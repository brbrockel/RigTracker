# RigTracker API

NestJS + Mongoose API for RigTracker.

## Run

From monorepo root:

```bash
pnpm install
pnpm --filter api dev
```

Build:

```bash
pnpm --filter api build
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

- `MONGO_URI` (default fallback is localhost)
- `RIGTRACKER_CORS_ORIGIN` (optional allowlist/patterns)
