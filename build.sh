#!/bin/sh
set -e

# --- Configurable variables ---
IMAGE_NAME="ghcr.io/brbrockel/rigtracker:combined-latest"
STACK_DIR="/home/brian/repos/homelab-docker-linux/rigtracker"

# Load .env if present
if [ -f "./.env" ]; then
  set -o allexport
  # shellcheck disable=SC1090
  . ./.env
  set +o allexport
fi

echo "Building $IMAGE_NAME using Dockerfile"
docker build -f Dockerfile -t "$IMAGE_NAME" .
echo "Built $IMAGE_NAME"

if [ "$1" = "--deploy" ]; then
  if [ -z "${GITHUB_GHCR_TOKEN:-}" ]; then
    echo "GITHUB_GHCR_TOKEN not set — cannot push images" >&2
    exit 1
  fi
  echo "Logging in to ghcr.io as brbrockel"
  echo "$GITHUB_GHCR_TOKEN" | docker login ghcr.io -u brbrockel --password-stdin
  echo "Pushing image to GHCR"
  docker push "$IMAGE_NAME"

  # Remove existing stack if present
  if docker stack ls --format '{{.Name}}' | grep -q '^rigtracker$'; then
    echo "Existing stack found — removing to ensure clean restart"
    docker stack rm rigtracker || true
    echo "Waiting up to 60s for stack containers to stop..."
    SECS=0
    while [ $SECS -lt 60 ]; do
      CNT=$(docker ps -a --filter "label=com.docker.stack.namespace=rigtracker" -q | wc -l)
      if [ "$CNT" -eq 0 ]; then
        echo "All stack containers stopped"
        break
      fi
      echo "Waiting — $CNT rigtracker containers still present..."
      sleep 2
      SECS=$((SECS+2))
    done
  fi

  echo "Deploying stack using GHCR image"
  docker stack deploy -c "$STACK_DIR/rigtracker-stack.yml" rigtracker
  echo "Deploy complete."
else
  echo "Build complete. To push and deploy run:"
  echo "  $0 --deploy"
fi
