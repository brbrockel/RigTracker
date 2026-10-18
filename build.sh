#!/bin/sh
# Builds the RigTracker image, tagged with the release in package.json.
#   ./build.sh            build only
#   ./build.sh --deploy   build, push to GHCR and roll the homelab stack onto it
# Each deploy needs a new version: bump "version" in package.json first (e.g. 2.0.0-alpha.3).
set -eu

REPO=ghcr.io/brbrockel/rigtracker
STACK_FILE=/home/brian/repos/homelab-docker-linux/rigtracker/rigtracker-stack.yml

# GITHUB_GHCR_TOKEN for pushing
if [ -f ./.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

VERSION=$(node -p "require('./package.json').version")
COMMIT=$(git rev-parse --short HEAD)
DIRTY=$( [ -n "$(git status --porcelain)" ] && echo "-dirty" || true )
APP_VERSION="$VERSION+$COMMIT$DIRTY"

echo "Building $REPO:$VERSION ($APP_VERSION)"
docker build --build-arg APP_VERSION="$APP_VERSION" -t "$REPO:$VERSION" -t "$REPO:latest" .

if [ "${1:-}" != "--deploy" ]; then
  echo "Built. To push and deploy: $0 --deploy"
  exit 0
fi

if [ -n "$DIRTY" ]; then
  echo "Commit your changes first: a deployed version must match a commit." >&2
  exit 1
fi
if [ -z "${GITHUB_GHCR_TOKEN:-}" ]; then
  echo "GITHUB_GHCR_TOKEN not set (see .env.example)" >&2
  exit 1
fi
echo "$GITHUB_GHCR_TOKEN" | docker login ghcr.io -u brbrockel --password-stdin
if docker manifest inspect "$REPO:$VERSION" >/dev/null 2>&1; then
  echo "$REPO:$VERSION is already published. Bump the version in package.json first." >&2
  exit 1
fi
docker push "$REPO:$VERSION"
docker push "$REPO:latest"

# A new tag means Swarm rolls the service onto it (no forced restarts needed).
RIGTRACKER_TAG="$VERSION" docker stack deploy --prune -c "$STACK_FILE" rigtracker
echo "Deployed $APP_VERSION"
