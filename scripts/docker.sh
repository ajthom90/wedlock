#!/bin/bash
set -e

REGISTRIES=(
  "forgejo.int.aafoods.com/ajthom90/joe-and-alex"
  "forgejo.home.njathome.net/ajthom90/joe-and-alex"
)
# Pick one registry to host the buildx layer cache. Only one needed since
# the cache just accelerates *building*; both registries receive full images.
CACHE_REF="${REGISTRIES[0]}:buildcache"
PLATFORMS="linux/arm64,linux/amd64"

# Read version from package.json
VERSION=$(node -p "require('./package.json').version")
# Preserved across the whole script so the EXIT trap can restore the file
# if anything fails mid-build and leaves a placeholder behind.
ORIGINAL_VERSION="$VERSION"

usage() {
  echo "Usage: $0 <command> [options]"
  echo ""
  echo "Commands:"
  echo "  build          Build multi-platform Docker image locally"
  echo "  push           Build and push multi-platform image to registry"
  echo "  bump-patch     Bump patch version (e.g., 2.0.0 -> 2.0.1) then build & push"
  echo "  bump-minor     Bump minor version (e.g., 2.0.0 -> 2.1.0) then build & push"
  echo "  bump-major     Bump major version (e.g., 2.0.0 -> 3.0.0) then build & push"
  echo "  version        Show current version"
  echo ""
  echo "Options:"
  echo "  --no-latest    Don't tag as :latest"
  echo "  --no-push      Build only, don't push (for bump commands)"
  echo ""
  echo "Current version: $VERSION"
  echo "Registries:"
  for reg in "${REGISTRIES[@]}"; do
    echo "  - $reg"
  done
}

compute_bumped_version() {
  local part=$1
  IFS='.' read -r major minor patch <<< "$VERSION"
  case $part in
    major) major=$((major + 1)); minor=0; patch=0 ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    patch) patch=$((patch + 1)) ;;
  esac
  VERSION="${major}.${minor}.${patch}"
  echo "Target version: $VERSION (will be written after successful build)"
}

# Write a specific version string into package.json.
write_version_to() {
  local new_version=$1
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '${new_version}';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
}

# Replace the version field with a stable placeholder so Docker sees the same
# package.json content on every build. Real version goes back in after
# do_build/do_push finishes.
stabilize_version() {
  write_version_to '0.0.0-build'
}

# Trap that runs on any exit. On success the caller has already written the
# correct final version. On failure we restore the original, so a failed
# build never leaves the repo with the '0.0.0-build' placeholder.
on_exit() {
  local rc=$?
  if [ $rc -ne 0 ]; then
    local current
    current=$(node -p "require('./package.json').version" 2>/dev/null || echo '')
    if [ "$current" = "0.0.0-build" ]; then
      echo "Build failed — restoring package.json version to $ORIGINAL_VERSION"
      write_version_to "$ORIGINAL_VERSION"
    fi
  fi
  return $rc
}
trap on_exit EXIT

build_tags() {
  local tag_latest=$1
  local tags=()
  for reg in "${REGISTRIES[@]}"; do
    tags+=(-t "$reg:$VERSION")
    [ -n "$tag_latest" ] && tags+=(-t "$reg:latest")
  done
  echo "${tags[@]}"
}

do_build() {
  local tag_latest=$1
  echo "Building v$VERSION for $PLATFORMS..."
  local tags
  read -ra tags <<< "$(build_tags "$tag_latest")"
  # Read-only registry cache: seeds layers if they're already cached from a
  # prior push. No --cache-to here because --load doesn't support pushing
  # cache metadata.
  docker buildx build \
    --platform "$PLATFORMS" \
    "${tags[@]}" \
    --cache-from "type=registry,ref=${CACHE_REF}" \
    --load \
    .
  for reg in "${REGISTRIES[@]}"; do
    echo "Built $reg:$VERSION"
  done
}

do_push() {
  local tag_latest=$1
  echo "Building and pushing v$VERSION for $PLATFORMS..."

  # Create/use a builder that supports multi-platform push
  docker buildx create --name multiarch --use 2>/dev/null || docker buildx use multiarch 2>/dev/null || true

  local tags
  read -ra tags <<< "$(build_tags "$tag_latest")"
  # mode=max pushes intermediate layer metadata so subsequent builds can reuse
  # individual stages (deps install, prisma generate, next build) instead of
  # only the final exported image.
  # --provenance=false skips SLSA attestation generation, which adds meaningful
  # push time and isn't consumed by our deploy target (TrueNAS Docker pull).
  docker buildx build \
    --platform "$PLATFORMS" \
    "${tags[@]}" \
    --cache-from "type=registry,ref=${CACHE_REF}" \
    --cache-to "type=registry,ref=${CACHE_REF},mode=max" \
    --provenance=false \
    --push \
    .
  for reg in "${REGISTRIES[@]}"; do
    echo "Pushed $reg:$VERSION"
    [ -n "$tag_latest" ] && echo "Pushed $reg:latest"
  done
}

# Run the build with a stabilized package.json, then restore the real version.
# `final_version` is what should end up in package.json after success — the
# existing version for plain build/push, or the bumped version for bump-*.
build_with_stable_pkg() {
  local final_version=$1
  local op=$2  # "build" or "push"
  stabilize_version
  if [ "$op" = "push" ]; then
    do_push "$TAG_LATEST"
  else
    do_build "$TAG_LATEST"
  fi
  write_version_to "$final_version"
  echo "Wrote $final_version to package.json"
}

# Parse options
TAG_LATEST=true
NO_PUSH=false
for arg in "$@"; do
  case $arg in
    --no-latest) TAG_LATEST="" ;;
    --no-push) NO_PUSH=true ;;
  esac
done

case "${1:-}" in
  build)
    build_with_stable_pkg "$ORIGINAL_VERSION" build
    ;;
  push)
    build_with_stable_pkg "$ORIGINAL_VERSION" push
    ;;
  bump-patch)
    compute_bumped_version patch
    if [ "$NO_PUSH" = true ]; then
      build_with_stable_pkg "$VERSION" build
    else
      build_with_stable_pkg "$VERSION" push
    fi
    ;;
  bump-minor)
    compute_bumped_version minor
    if [ "$NO_PUSH" = true ]; then
      build_with_stable_pkg "$VERSION" build
    else
      build_with_stable_pkg "$VERSION" push
    fi
    ;;
  bump-major)
    compute_bumped_version major
    if [ "$NO_PUSH" = true ]; then
      build_with_stable_pkg "$VERSION" build
    else
      build_with_stable_pkg "$VERSION" push
    fi
    ;;
  version)
    echo "$VERSION"
    ;;
  *)
    usage
    exit 1
    ;;
esac
