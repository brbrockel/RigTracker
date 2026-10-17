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

- API listens on `127.0.0.1:4000` inside the container (`HOST`, `PORT`); only nginx reaches it
- nginx serves frontend and proxies `/api` and `/uploads` on container port `80`
- Traefik routes `rigtracker.bhbslp.org` to port `80`. The API port is not published: going around nginx would skip its security headers

## Environment Variables

Environment variable reference:

| Variable | Required | Used By | Purpose | Example |
| --- | --- | --- | --- | --- |
| `MONGO_URI` / `MONGO_URI_FILE` | Yes | API | MongoDB connection string. `_FILE` reads it from a Docker secret. | `mongodb://mongo:27017/rigtracker` |
| `RIGTRACKER_CORS_ORIGIN` | Dev only | API | Origins allowed to call the API from another site (exact, or patterns like `http://localhost:*`). Leave unset in production: the app is same-origin, and unset means no CORS at all. | `http://localhost:5173` |
| `HOST` / `PORT` | Optional | API | Listen address and port. The image sets `HOST=127.0.0.1`. | `0.0.0.0` / `4000` |
| `RIGTRACKER_API_BASE` | Optional | Web | API base URL override; keep empty for same-origin deployments behind nginx. | `` |
| `GITHUB_GHCR_TOKEN` | Yes for deploy script | Build/deploy script | Auth token used by `./build.sh --deploy` to push to GHCR. | `ghp_xxx` |

Implemented now for EH-001 starter (Google auth API + persisted sessions):

| Variable | Required | Used By | Purpose | Example |
| --- | --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes (EH-001) | API auth module | Google OAuth client identifier for login redirects and token validation. | `1234567890-abc123.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` / `GOOGLE_CLIENT_SECRET_FILE` | Yes (EH-001) | API auth module | Google OAuth client secret used during callback token exchange. Use the `_FILE` form with a Docker secret in production. | `GOCSPX-...` |
| `AUTH_GOOGLE_CALLBACK_URL` | Yes (EH-001) | API auth module | Exact callback URL registered in Google OAuth client config. | `https://rigtracker.bhbslp.org/api/auth/google/callback` |
| `AUTH_SUCCESS_REDIRECT` | Optional | API auth module | Redirect target after successful Google login. | `/` |
| `AUTH_FAILURE_REDIRECT` | Optional | API auth module | Redirect target after failed Google login. | `/?auth=failed` |
| `AUTH_ALLOWED_EMAILS` | Optional | API auth module | Comma-separated emails that may sign in without being added first. Needed once, to let the first admin in on an empty database. | `you@gmail.com` |
| `AUTH_ALLOWED_EMAIL_DOMAIN` | Optional | API auth module | Comma-separated domains whose verified Google accounts may sign in. | `example.org` |

Access rules:

- Every API route and every file under `/uploads` needs a signed-in session, except the sign-in routes (`/api/auth/google`, `/api/auth/google/callback`, `/api/auth/me`, `/api/auth/logout`).
- Sign-in is closed by default. A Google account gets in only if an admin added its email on **Settings**, or it matches `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_EMAIL_DOMAIN`. The Google email must be verified.
- Writes (`POST`/`PUT`/`PATCH`/`DELETE`) from another site are refused (`Origin` must match the host).
- Uploads are checked by content, not name: images are re-encoded to JPEG (no EXIF or GPS), and videos are kept only as MP4, MOV or WebM.

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