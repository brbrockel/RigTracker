# RigTracker API

NestJS + Drizzle (PostgreSQL) API for RigTracker. ESM, built to `dist/`; migrations in `drizzle/` are applied at start-up.

## Run

From monorepo root:

```bash
pnpm install
pnpm --filter rigtracker-api dev
```

Build:

```bash
pnpm --filter rigtracker-api build
```

## Base Path

All routes are served under `/api`.

## Routes

Gear:

- `GET /api/gear`
- `GET /api/gear/:id`
- `POST /api/gear`
- `PUT /api/gear/:id`
- `DELETE /api/gear/:id`

Uploads:

- `POST /api/uploads/image` (multipart form-data with `file`)

Events:

- `GET /api/events`
- `GET /api/events/:id`
- `POST /api/events`
- `PUT /api/events/:id`
- `DELETE /api/events/:id`

Rigs:

- `GET /api/rigs`
- `GET /api/rigs/:id`
- `POST /api/rigs`
- `PUT /api/rigs/:id`
- `DELETE /api/rigs/:id`

People:

- `GET /api/people`
- `GET /api/people/:id`
- `POST /api/people`
- `PUT /api/people/:id`
- `DELETE /api/people/:id`

## Environment

- `DATABASE_URL` or `DATABASE_URL_FILE` (required in production; development defaults to the `pnpm dev:services` Postgres)
- `RIGTRACKER_CORS_ORIGIN` (dev only: origins allowed cross-site; unset means same-origin, no CORS)
- `HOST`, `PORT` (default `0.0.0.0`, `4000`)

All routes need a session except the `/api/auth` sign-in routes; see [doc/Development.md](../doc/Development.md#environment-variables).
