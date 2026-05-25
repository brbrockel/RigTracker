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

Environment variable reference:

| Variable | Required | Used By | Purpose | Example |
| --- | --- | --- | --- | --- |
| `MONGO_URI` | Yes | API | MongoDB connection string for runtime data. | `mongodb://mongo:27017/rigtracker` |
| `RIGTRACKER_CORS_ORIGIN` | Recommended | API | Allowed browser origins (supports wildcard patterns like `*.example.com`). | `*.bhbslp.org` |
| `RIGTRACKER_API_BASE` | Optional | Web | API base URL override; keep empty for same-origin deployments behind nginx. | `` |
| `GITHUB_GHCR_TOKEN` | Yes for deploy script | Build/deploy script | Auth token used by `./build.sh --deploy` to push to GHCR. | `ghp_xxx` |

Planned for EH-001 (Google auth and app sessions):

| Variable | Required | Used By | Purpose | Example |
| --- | --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes (EH-001) | API auth module | Google OAuth client identifier for login redirects and token validation. | `1234567890-abc123.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Yes (EH-001) | API auth module | Google OAuth client secret used during callback token exchange. | `GOCSPX-...` |
| `SESSION_SECRET` | Yes (EH-001) | API auth module | Secret used to sign/encrypt session cookies or session tokens. | `long-random-value` |
| `AUTH_ALLOWED_EMAIL_DOMAIN` | Optional (EH-001) | API auth module | Restrict logins to a single domain (or use allowlist strategy). | `bhbslp.org` |
| `AUTH_ALLOWED_EMAILS` | Optional (EH-001) | API auth module | Comma-separated explicit allowlist for login access. | `user1@bhbslp.org,user2@gmail.com` |

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