# RigTracker

> Modern web app to manage and track skydiving parachute rigs, packs, and allocations.

RigTracker helps dropzones, riggers, and skydivers keep organized records of parachute systems: which packs exist, their configurable options, technical specs, maintenance history, and who each rig is allocated to.

## Key Features

- Inventory: catalog every pack and rig with photos and serial numbers.
- Configurable Options: store container type, main/reserve canopy models, AAD, slider type, and other options.
- Specs & Documents: record weights, line lengths, max load, service history, and attach manuals/certs.
- Allocations: assign rigs to users, crews, or rental pools with history and check-in/out tracking.
- Search & Filters: find rigs by owner, type, service due, or compatibility.
- Roles & Permissions: user roles (rigger, admin, jumper) control actions and service records.

## Suggested Tech Stack

- Frontend: React + TypeScript, Tailwind CSS for UI.
- Backend: Node.js + TypeScript (Express or Fastify) or Python (FastAPI).
- Database: PostgreSQL + Prisma or SQLAlchemy for schema-first modeling.
- Storage: S3-compatible object storage for photos & PDFs.
- Auth: JWT or OAuth2 (e.g., Auth0) with role-based access control.

## Data Model (core entities)

- Pack
  - id (uuid)
  - serial_number
  - name (e.g., "Mirage G4 3.0")
  - container_type
  - notes
  - photos
  - created_at, updated_at

- Option (linked to Pack)
  - id
  - pack_id
  - slot (main, reserve, AAD, pilot chute, slider)
  - make_model
  - size
  - install_date

- Spec
  - id
  - pack_id
  - weight (kg)
  - max_load (kg)
  - line_length (cm)
  - serials (json)

- Allocation
  - id
  - pack_id
  - user_id
  - type (rental, owned, loaned)
  - start_date
  - end_date (nullable)
  - notes

- User
  - id
  - name
  - email
  - role

Example JSON (Pack):

```json
{
  "id": "7a1f0d2e-...",
  "serial_number": "MIR-12345",
  "name": "Mirage G4 3.0",
  "container_type": "Two-Reserve",
  "options": [
    {"slot":"main","make_model":"PD Sabre2","size":"170"},
    {"slot":"reserve","make_model":"PD Reserve","size":"210"},
    {"slot":"AAD","make_model":"Cypres 2"}
  ],
  "allocation": {"user_id":"u-42","type":"rental","start_date":"2026-03-01"}
}
```

## Example API Endpoints

- `GET /api/packs` — list packs with filters
- `GET /api/packs/:id` — pack details, options, specs, allocation
- `POST /api/packs` — create pack
- `PUT /api/packs/:id` — update pack
- `POST /api/packs/:id/allocate` — allocate pack to a user
- `GET /api/users/:id/allocations` — allocation history

## UI Ideas

- Dashboard: quick stats (total rigs, service due, rental inventory)
- Pack page: photos carousel, options table, maintenance log, allocation history
- Quick-check: mobile-friendly check-in/out form with QR scan of serial

## Quick Start (developer)

1. Clone the repo

```bash
git clone <repo-url>
cd RigTracker
```

2. Backend (example Node + pnpm)

```bash
pnpm install
pnpm prisma:migrate # or run migrations
pnpm dev
```

3. Frontend

```bash
cd web
pnpm install
pnpm dev
```

Or start quickly with Docker (suggested `docker-compose` with app & postgres).

## Maintenance & Safety

- Keep service records and reserve repack dates as first-class data.
- Use roles so only certified riggers can mark maintenance complete.
- Backup attachments and DB daily; sensitive user data should be encrypted at rest.

## Contributing

Contributions welcome. Please open issues for feature requests and submit PRs for bug fixes or improvements.

## License

This repository does not include a license by default. Add a license file (e.g., MIT) to clarify reuse.

---

If you'd like, I can also scaffold a starter app structure (frontend + backend), create database migrations, or add sample seed data. Which next step should I take?
