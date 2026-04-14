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

bump_version() {
  local part=$1
  IFS='.' read -r major minor patch <<< "$VERSION"
  case $part in
    major) major=$((major + 1)); minor=0; patch=0 ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    patch) patch=$((patch + 1)) ;;
  esac
  VERSION="${major}.${minor}.${patch}"
  # Update package.json
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '${VERSION}';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "Version bumped to $VERSION"
}

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
    do_build "$TAG_LATEST"
    ;;
  push)
    do_push "$TAG_LATEST"
    ;;
  bump-patch)
    bump_version patch
    if [ "$NO_PUSH" = true ]; then
      do_build "$TAG_LATEST"
    else
      do_push "$TAG_LATEST"
    fi
    ;;
  bump-minor)
    bump_version minor
    if [ "$NO_PUSH" = true ]; then
      do_build "$TAG_LATEST"
    else
      do_push "$TAG_LATEST"
    fi
    ;;
  bump-major)
    bump_version major
    if [ "$NO_PUSH" = true ]; then
      do_build "$TAG_LATEST"
    else
      do_push "$TAG_LATEST"
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
