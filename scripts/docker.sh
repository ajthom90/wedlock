#!/bin/bash
set -e

# Registries are configured per-deployer via the DOCKER_REGISTRIES env var
# (space-separated image repo paths). Drop it in a local .env file — see
# .env.example for the format. Unset is valid: the script will skip the
# local Docker build and rely entirely on GitHub Actions publishing to
# GHCR off the pushed tag.
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

PLATFORMS="linux/arm64,linux/amd64"

# Read version from package.json
VERSION=$(node -p "require('./package.json').version")
# Preserved across the whole script so the EXIT trap can restore the file
# if anything fails mid-build and leaves a placeholder behind. The bump
# flow re-points RESTORE_VERSION at the new tag once git push succeeds, so
# a failure in the local Docker step after the tag has already been pushed
# won't roll package.json back and desync it from git.
ORIGINAL_VERSION="$VERSION"
RESTORE_VERSION="$VERSION"

usage() {
  echo "Usage: $0 <command> [options]"
  echo ""
  echo "Commands:"
  echo "  build          Build multi-platform Docker image locally (no push, no version change)"
  echo "  push           Build and push multi-platform image to DOCKER_REGISTRIES"
  echo "  bump-patch     Bump patch version (e.g. 1.0.0 → 1.0.1), commit, tag, push remotes"
  echo "  bump-minor     Bump minor version (e.g. 1.0.0 → 1.1.0), commit, tag, push remotes"
  echo "  bump-major     Bump major version (e.g. 1.0.0 → 2.0.0), commit, tag, push remotes"
  echo "  version        Show current version"
  echo ""
  echo "Bump flow: update package.json → git commit → git tag vX.Y.Z → git push main +"
  echo "tag to every remote (kicks off .github/workflows/docker.yml to publish GHCR in"
  echo "parallel) → build & push multi-arch image to DOCKER_REGISTRIES. Git push goes"
  echo "first so the GitHub Actions build runs concurrently with the local registry"
  echo "build, cutting total release time."
  echo ""
  echo "Options:"
  echo "  --no-latest    Don't tag local Docker push as :latest"
  echo "  --no-push      Build only; skip Docker push AND skip git commit/tag/push"
  echo ""
  echo "Current version: $VERSION"
  if [ -n "${DOCKER_REGISTRIES:-}" ]; then
    echo "Local Docker registries:"
    IFS=' ' read -ra regs <<< "$DOCKER_REGISTRIES"
    for r in "${regs[@]}"; do echo "  - $r"; done
  else
    echo "DOCKER_REGISTRIES unset — bump-* will only tag+push to git (GHCR via Actions)."
  fi
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
# correct final version. On failure we restore whatever version we should
# currently be at (ORIGINAL_VERSION before a bump's tag push, the bumped
# VERSION after it — so git and package.json never disagree).
on_exit() {
  local rc=$?
  if [ $rc -ne 0 ]; then
    local current
    current=$(node -p "require('./package.json').version" 2>/dev/null || echo '')
    if [ "$current" = "0.0.0-build" ]; then
      echo "Build failed — restoring package.json version to $RESTORE_VERSION"
      write_version_to "$RESTORE_VERSION"
    fi
  fi
  return $rc
}
trap on_exit EXIT

has_docker_registries() {
  [ -n "${DOCKER_REGISTRIES:-}" ]
}

build_tags() {
  local tag_latest=$1
  local tags=()
  IFS=' ' read -ra regs <<< "$DOCKER_REGISTRIES"
  for reg in "${regs[@]}"; do
    tags+=(-t "$reg:$VERSION")
    [ -n "$tag_latest" ] && tags+=(-t "$reg:latest")
  done
  echo "${tags[@]}"
}

do_build() {
  local tag_latest=$1
  if ! has_docker_registries; then
    echo "Skipping local Docker build (DOCKER_REGISTRIES unset)."
    return 0
  fi
  local cache_ref
  IFS=' ' read -ra regs <<< "$DOCKER_REGISTRIES"
  cache_ref="${regs[0]}:buildcache"

  echo "Building v$VERSION for $PLATFORMS..."
  local tags
  read -ra tags <<< "$(build_tags "$tag_latest")"
  # Read-only registry cache: seeds layers if they're already cached from a
  # prior push. No --cache-to here because --load doesn't support pushing
  # cache metadata.
  docker buildx build \
    --platform "$PLATFORMS" \
    "${tags[@]}" \
    --cache-from "type=registry,ref=${cache_ref}" \
    --load \
    .
  for reg in "${regs[@]}"; do
    echo "Built $reg:$VERSION"
  done
}

do_push() {
  local tag_latest=$1
  if ! has_docker_registries; then
    echo "Skipping local Docker push (DOCKER_REGISTRIES unset — GitHub Actions will publish GHCR)."
    return 0
  fi
  local cache_ref
  IFS=' ' read -ra regs <<< "$DOCKER_REGISTRIES"
  cache_ref="${regs[0]}:buildcache"

  echo "Building and pushing v$VERSION for $PLATFORMS..."

  # Create/use a builder that supports multi-platform push
  docker buildx create --name multiarch --use 2>/dev/null || docker buildx use multiarch 2>/dev/null || true

  local tags
  read -ra tags <<< "$(build_tags "$tag_latest")"
  # mode=max pushes intermediate layer metadata so subsequent builds can reuse
  # individual stages (deps install, prisma generate, next build) instead of
  # only the final exported image.
  # --provenance=false skips SLSA attestation generation, which adds meaningful
  # push time and isn't consumed by our deploy targets.
  docker buildx build \
    --platform "$PLATFORMS" \
    "${tags[@]}" \
    --cache-from "type=registry,ref=${cache_ref}" \
    --cache-to "type=registry,ref=${cache_ref},mode=max" \
    --provenance=false \
    --push \
    .
  for reg in "${regs[@]}"; do
    echo "Pushed $reg:$VERSION"
    [ -n "$tag_latest" ] && echo "Pushed $reg:latest"
  done
}

# Run the build with a stabilized package.json, then restore the real version.
# `final_version` is what should end up in package.json after success — the
# existing version for plain build/push, or the bumped version for bump-*.
# When DOCKER_REGISTRIES is unset, do_build/do_push are no-ops and we skip
# stabilize_version since there's no Docker build to feed it.
build_with_stable_pkg() {
  local final_version=$1
  local op=$2  # "build" or "push"
  if has_docker_registries; then
    stabilize_version
  fi
  if [ "$op" = "push" ]; then
    do_push "$TAG_LATEST"
  else
    do_build "$TAG_LATEST"
  fi
  write_version_to "$final_version"
  echo "Wrote $final_version to package.json"
}

# Commit the version bump, tag vX.Y.Z, and push main + tag to every git
# remote. The GHCR image is built by .github/workflows/docker.yml off the
# pushed tag — this function does not build Docker images itself.
tag_and_push() {
  local v=$1
  local tag="v$v"

  local message="Bump to $tag"
  if [ -n "${COMMIT_TRAILER:-}" ]; then
    message="$(printf '%s\n\n%s' "$message" "$COMMIT_TRAILER")"
  fi

  echo ""
  echo "Committing and tagging $tag..."
  git add package.json
  git commit -m "$message"
  git tag "$tag"

  echo ""
  echo "Pushing main + $tag to all git remotes:"
  local remote
  for remote in $(git remote); do
    echo "  → $remote"
    git push "$remote" HEAD
    git push "$remote" "$tag"
  done
  echo ""
  echo "Tag $tag pushed. If the 'origin' remote is GitHub, the Docker workflow"
  echo "will now build a multi-arch image and publish ghcr.io/<repo>:$v."
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
  bump-patch|bump-minor|bump-major)
    compute_bumped_version "${1#bump-}"
    if [ "$NO_PUSH" = true ]; then
      build_with_stable_pkg "$VERSION" build
      echo ""
      echo "--no-push set; skipping git commit/tag/push. package.json is at $VERSION."
    else
      # Git push first so the GitHub Actions workflow kicks off immediately
      # and builds GHCR in parallel with the local multi-arch build below.
      # Once tag_and_push succeeds, git is authoritative on the new version,
      # so if the local Docker step fails later, on_exit restores
      # package.json to $VERSION (not ORIGINAL_VERSION) to keep them aligned.
      write_version_to "$VERSION"
      tag_and_push "$VERSION"
      RESTORE_VERSION="$VERSION"
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
