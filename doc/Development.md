# Development Guide

This page contains day-to-day development and deployment operations for RigTracker.

## Prerequisites

- Node 24 (`.nvmrc`; `nvm use`)
- pnpm 10 (`packageManager` is pinned in root `package.json`)
- Docker (for container builds)
- Docker Swarm (for homelab deployment)

## Workspace Commands

From repo root:

```bash
pnpm install
cp .env.example .env    # local settings (never committed)
pnpm dev:services       # Postgres 18 on 127.0.0.1:15433 (stop: pnpm dev:services:stop)
pnpm dev:api            # API on :4000 (DATABASE_URL from .env); applies migrations at start-up
pnpm dev:web            # web on http://localhost:5173; /api and /uploads are proxied to :4000
```

Sign in locally with a link: `APP_URL=http://localhost:5173 node --env-file=.env api/dist/scripts/sign-in-link.js you@example.com --admin "Your Name"` (after `pnpm --filter rigtracker-api build`).

## Database

PostgreSQL 18 with Drizzle. The schema is `api/src/db/schema.ts`; migrations are SQL files in `api/drizzle`.

- **Migrations run at start-up:** `main.ts` applies any new ones before the API listens (a failed migration stops the start). By hand: `pnpm --filter rigtracker-api db:migrate`.
- **A schema change:** edit `schema.ts`, then `pnpm --filter rigtracker-api db:generate` (drizzle-kit writes the next `drizzle/NNNN_*.sql`). SQL drizzle-kit can't express (like the audit log's trigger, `0001_audit_append_only.sql`) goes in a custom migration: `pnpm exec drizzle-kit generate --custom --name <name>` in `api/`.
- **The audit log is append-only:** a trigger refuses `UPDATE` and `DELETE` on `audit_log`. `TRUNCATE` still works (the tests use it).
- **Expired sessions and sign-in links** are deleted at start-up and every hour.

## Checks

Run before every commit; CI (`.github/workflows/ci.yml`) runs the same on every push:

```bash
pnpm check              # lint + format:check + typecheck + test
pnpm format             # fix formatting (Prettier)
```

- Web tests (vitest + Testing Library, `web/src/test/`) stub the API with `mockApi`.
- API tests (vitest + supertest, `api/test/*.e2e.test.ts`) boot the real app against a test database: `TEST_DATABASE_URL`, default `postgres://rigtracker:rigtracker@127.0.0.1:15433/rigtracker_test` (the `pnpm dev:services` Postgres). Each run drops and re-creates it and applies the migrations from empty; each test then empties the tables with `TRUNCATE`.

## Build and deploy

```bash
pnpm build              # API (api/dist) and web (web/dist)
./build.sh              # the container image, tagged with the version in package.json
./build.sh --deploy     # push it and roll the homelab stack onto it
```

Deploying, versions, rollback, backups and secrets: [Deployment.md](Deployment.md).

## Environment Variables

Environment variable reference:

| Variable | Required | Used By | Purpose | Example |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` / `DATABASE_URL_FILE` | Yes in production | API, scripts | PostgreSQL connection string. `_FILE` reads it from a Docker secret. Without it (development), the `pnpm dev:services` database. | `postgres://rigtracker:…@postgres:5432/rigtracker` |
| `RIGTRACKER_CORS_ORIGIN` | Rarely | API | Origins allowed to call the API from another site (exact, or patterns like `http://localhost:*`). Not needed for development (Vite proxies the API) or production (same origin); unset means no CORS at all. | `https://other.example.com` |
| `HOST` / `PORT` | Optional | API | Listen address and port. | `0.0.0.0` / `4000` |
| `WEB_DIST` | Container | API | The built web app to serve on the same origin (the image sets `/app/web`). | `/app/web` |
| `UPLOADS_DIR` | Optional | API | Where uploaded photos and videos are stored (the image sets `/app/uploads`). | `./uploads` |
| `APP_VERSION` | Build | API | The release and commit, set by `build.sh`; shown at `/api/health` and on Account. | `2.0.0-alpha.2+abc1234` |
| `RATE_LIMIT_PER_MINUTE` | Optional | API | Requests per minute per visitor IP for most routes. | `300` |
| `GITHUB_GHCR_TOKEN` | Yes for deploy script | Build/deploy script | Auth token used by `./build.sh --deploy` to push to GHCR. | `ghp_xxx` |

Sign-in:

| Variable | Required | Used By | Purpose | Example |
| --- | --- | --- | --- | --- |
| `APP_URL` | Yes in production | API, `sign-in-link` script | Base URL that sign-in links point at. Without it, links made on Settings use the site the admin is on; the script refuses to run. | `https://rigtracker.bhbslp.org` |

Access rules:

- Every API route and every file under `/uploads` needs a signed-in session, except the sign-in routes (`/api/auth/link/check`, `/api/auth/link/redeem`, `/api/auth/me`, `/api/auth/logout`).
- There is no Google sign-in or password. People and sign-in accounts are the same records: on **People**, an admin uses **⋯ → Sign-in access…** to give someone a role (Viewer, User or Admin; it needs their email address), then **⋯ → Get sign-in link** gives a single-use link (valid 72 hours) to copy, text or email. Opening the link shows who it's for; pressing **Sign in** uses it up and starts a 30-day session. Only hashes of link and session tokens are stored.
- First admin, or if no admin can sign in:

  ```bash
  docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com --admin "Your Name"
  ```

  Without `--admin` it prints a link for an existing user. Locally: `APP_URL=http://localhost:5173 node api/dist/scripts/sign-in-link.js you@example.com`.
- Sign-ins, sign-outs, links made and access changes are in the audit log. **⋯ → Sign out everywhere** ends all of someone's sessions; removing sign-in access does that too.
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