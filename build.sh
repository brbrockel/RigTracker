#!/usr/bin/env bash
set -euo pipefail

# Build script for local rigtracker images and optional stack deploy
# Usage: ./build.sh [--deploy]

ROOT_REPO="$(cd "$(dirname "$0")" && pwd)"
STACK_DIR="/home/brian/repos/homelab-docker-linux/rigtracker"
MONGO_DATA_DIR="/srv/homelab-data/rigtracker/mongo-data"

DOCKER_SERVER_IMAGE="rigtracker-server:latest"
DOCKER_UI_IMAGE="rigtracker-ui:latest"

DEPLOY=false
if [[ ${1:-} == "--deploy" ]]; then
  DEPLOY=true
fi

echo "Root repo: $ROOT_REPO"
echo "Stack dir: $STACK_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH" >&2
  exit 1
fi

echo "Building server image ($DOCKER_SERVER_IMAGE)"
docker build -t "$DOCKER_SERVER_IMAGE" -f "$ROOT_REPO/Dockerfile.server" "$ROOT_REPO"

echo "Building UI image ($DOCKER_UI_IMAGE)"
docker build -t "$DOCKER_UI_IMAGE" -f "$ROOT_REPO/Dockerfile.ui" "$ROOT_REPO"
if $DEPLOY; then
  # load .env if present (for GITHUB_GHCR_TOKEN)
  if [ -f "$ROOT_REPO/.env" ]; then
    set -o allexport
    # shellcheck disable=SC1090
    source "$ROOT_REPO/.env"
    set +o allexport
  fi

  # determine git owner for GHCR (fallback to repo owner if parsing fails)
  REMOTE_URL=$(git -C "$ROOT_REPO" remote get-url origin 2>/dev/null || true)
  OWNER=$(echo "$REMOTE_URL" | sed -E 's#.*[:/]+([^/]+)/[^/]+(.git)?$#\1#')
  if [ -z "$OWNER" ]; then
    OWNER="brbrockel"
  fi

  SHA=$(git -C "$ROOT_REPO" rev-parse --short HEAD 2>/dev/null || echo "local")
  GHCR_REG="ghcr.io"
  SERVER_GHCR="$GHCR_REG/$OWNER/rigtracker-server:$SHA"
  UI_GHCR="$GHCR_REG/$OWNER/rigtracker-ui:$SHA"

  if [ -n "${GITHUB_GHCR_TOKEN:-}" ]; then
    echo "GHCR token found — logging in as $OWNER and pushing images"
    echo "$GITHUB_GHCR_TOKEN" | docker login $GHCR_REG -u "$OWNER" --password-stdin
    echo "Tagging images: $SERVER_GHCR and $UI_GHCR"
    docker tag "$DOCKER_SERVER_IMAGE" "$SERVER_GHCR"
    docker tag "$DOCKER_UI_IMAGE" "$UI_GHCR"
    echo "Pushing server image to GHCR"
    docker push "$SERVER_GHCR"
    echo "Pushing UI image to GHCR"
    docker push "$UI_GHCR"

    # If stack exists, update services; otherwise deploy stack then update
    if docker stack ls --format '{{.Name}}' | grep -q '^rigtracker$'; then
      echo "Updating existing services to use pushed GHCR images"
      docker service update --image "$SERVER_GHCR" rigtracker_rigtracker-server || true
      docker service update --image "$UI_GHCR" rigtracker_rigtracker-ui || true
    else
      echo "No stack present — deploying stack and then updating services to GHCR images"
      docker stack deploy -c "$STACK_DIR/rigtracker-stack.yml" rigtracker
      sleep 3
      docker service update --image "$SERVER_GHCR" rigtracker_rigtracker-server || true
      docker service update --image "$UI_GHCR" rigtracker_rigtracker-ui || true
    fi

    echo "Deploy update requested — pushed images tagged with $SHA"
  else
    echo "No GHCR token found — falling back to stack redeploy (will remove stack first)"
    if docker stack ls --format '{{.Name}}' | grep -q '^rigtracker$'; then
      echo "Existing stack found — removing to ensure clean restart"
      docker stack rm rigtracker
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
    echo "Deploying stack: rigtracker"
    docker stack deploy -c "$STACK_DIR/rigtracker-stack.yml" rigtracker
    echo "Waiting a few seconds for services to start..."
    sleep 3
    docker stack ps rigtracker --no-trunc
  fi
else
  echo "Build complete. To deploy the stack run:"
  echo "  $0 --deploy"
fi
