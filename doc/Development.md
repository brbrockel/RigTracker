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
pnpm dev:api            # API on :4000 (needs MONGO_URI, or a local Mongo on 27017)
pnpm dev:web            # web on http://localhost:5173; /api and /uploads are proxied to :4000
pnpm --filter rigtracker-web test       # web tests (vitest)
pnpm --filter rigtracker-web typecheck
```

Sign in locally with a link: `APP_URL=http://localhost:5173 node api/dist/scripts/sign-in-link.js you@example.com --admin "Your Name"` (after `pnpm --filter rigtracker-api build`).

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
| `RIGTRACKER_CORS_ORIGIN` | Rarely | API | Origins allowed to call the API from another site (exact, or patterns like `http://localhost:*`). Not needed for development (Vite proxies the API) or production (same origin); unset means no CORS at all. | `https://other.example.com` |
| `HOST` / `PORT` | Optional | API | Listen address and port. The image sets `HOST=127.0.0.1`. | `0.0.0.0` / `4000` |
| `GITHUB_GHCR_TOKEN` | Yes for deploy script | Build/deploy script | Auth token used by `./build.sh --deploy` to push to GHCR. | `ghp_xxx` |

Sign-in:

| Variable | Required | Used By | Purpose | Example |
| --- | --- | --- | --- | --- |
| `APP_URL` | Yes in production | API, `sign-in-link` script | Base URL that sign-in links point at. Without it, links made on Settings use the site the admin is on; the script refuses to run. | `https://rigtracker.bhbslp.org` |

Access rules:

- Every API route and every file under `/uploads` needs a signed-in session, except the sign-in routes (`/api/auth/link/check`, `/api/auth/link/redeem`, `/api/auth/me`, `/api/auth/logout`).
- There is no Google sign-in or password. An admin adds the person on **Settings**, then **Sign-in link** gives a single-use link (valid 72 hours) to copy, text or email. Opening the link shows who it's for; pressing **Sign in** uses it up and starts a 30-day session. Only hashes of link and session tokens are stored.
- First admin, or if no admin can sign in:

  ```bash
  docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com --admin "Your Name"
  ```

  Without `--admin` it prints a link for an existing user. Locally: `APP_URL=http://localhost:5173 node api/dist/scripts/sign-in-link.js you@example.com`.
- Sign-ins, sign-outs, links made and role changes are in the audit log. **Sign out everywhere** on Settings ends all of someone's sessions.
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