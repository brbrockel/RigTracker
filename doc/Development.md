# Development Guide

This page contains day-to-day development and deployment operations for RigTracker.

## Prerequisites

- Node 20+
- pnpm 10 (`packageManager` is pinned in root `package.json`)
- Docker (for container builds)
- Docker Swarm (for homelab deployment)

## Workspace Commands

From repo root:

```bash
pnpm install
pnpm dev:api
pnpm dev:web
```

## Build Commands

API build:

```bash
pnpm --filter api build
```

Web build:

```bash
pnpm --filter web build
```

Combined image build:

```bash
./build.sh
```

## Deploy Commands

Helper script build + push + deploy:

```bash
./build.sh --deploy
```

Manual stack deploy (homelab repo):

```bash
docker stack deploy -c /home/brian/repos/homelab-docker-linux/rigtracker/rigtracker-stack.yml rigtracker
```

Force a rollout after image refresh:

```bash
docker service update --force rigtracker_rigtracker
```

## API Base and Ports

- API listens on container port `4000`
- nginx serves frontend and proxies API on container port `80`
- Stack currently publishes:
  - `8085 -> 80` (app)
  - `4000 -> 4000` (API direct)

## Environment Variables

Common runtime variables:

- `MONGO_URI`
- `RIGTRACKER_CORS_ORIGIN`
- `RIGTRACKER_API_BASE`

Deploy helper variable:

- `GITHUB_GHCR_TOKEN` (required for `./build.sh --deploy`)

## Troubleshooting

Service health:

```bash
docker stack services rigtracker
docker service ps rigtracker_rigtracker
```

Service logs:

```bash
docker service logs --tail 200 rigtracker_rigtracker
```

Public health check:

```bash
curl -I https://rigtracker.bhbslp.org/
```

Direct host health check:

```bash
curl -I http://127.0.0.1:8085/
```