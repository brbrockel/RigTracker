# RigTracker API

Minimal Nest-style API scaffold for RigTracker. This is intentionally lightweight — run `pnpm install` in the monorepo root then `pnpm --filter api dev` to start development after installing dependencies.

Endpoints:
- `GET /packs` — list sample packs
- `GET /packs/:id` — get pack by id
- `POST /packs` — create a pack (in-memory)
