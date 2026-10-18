# Architecture

RigTracker is a web app (installable as a PWA) and a NestJS API backed by PostgreSQL. It follows TeeMate's structure and stack ([Plan.md](Plan.md)).

## Runtime

One container runs one Node process on port 4000. It serves:

- the API under `/api`
- uploaded photos and videos under `/uploads`, to signed-in people only
- the built web app (`WEB_DIST`), with `index.html` for client-side routes

Security headers come from helmet on every response, including the CSP.

```
Cloudflare tunnel → Traefik (rigtracker.bhbslp.org) → rigtracker:4000 ─┬─ PostgreSQL (internal network)
                                                                       └─ /app/uploads (host bind mount)
backup job (nightly) ── internal network ── MongoDB, uploads (read-only)
```

## Components

1. **Web app (`web/`)**
   - **Stack:** React 19, Vite 8, TypeScript, Tailwind CSS 4 and shadcn/ui on Radix, the same components as TeeMate. TanStack Query for data, react-router 8, lucide icons.
   - **Layout:** mobile first. A bottom tab bar on phones (Home, Rigs, Gear, Events, People) and top links on desktop. Admin pages (Activity log) are in the account menu.
   - **Themes:** light and dark.
   - **Inventory pages (Rigs, Gear):**
     - four layouts (Table, List, Gallery, Cards), with sort, grouping and column choice remembered per device;
     - multi-select assign, unassign and delete;
     - CSV export and a print sheet.
   - **Installable PWA:** the service worker caches the app shell only, never `/api` or `/uploads`. iPhone users get an "Add to Home Screen" hint on Home.
   - **API calls** are same-origin (`/api/...`), with the session's CSRF token in `x-csrf-token` on every change.

2. **API (`api/`)**
   - **Stack:** NestJS 12 on Express 5, ESM, TypeScript 6, Drizzle ORM on PostgreSQL 18. Every request body and query is checked with zod. Migrations (`api/drizzle`) are applied at start-up.
   - **Modules:**
     - `auth`: sign-in links, sessions, CSRF and roles;
     - `people`: people and their sign-in access;
     - `rigs`, `gear`, `events`, `uploads`, `audit`, `health`.
   - **Global guards, in order:**
     1. rate limit per visitor IP;
     2. session and CSRF;
     3. roles.
   - **Scripts:** `dist/scripts/sign-in-link.js` (the first admin, or a lockout) and `dist/scripts/import-mongo.js` (the one-off import from MongoDB).

3. **Data (PostgreSQL 18: `people`, `rigs`, `gear`, `events`, `sessions`, `sign_in_links`, `audit_log`; `api/src/db/schema.ts`)**
   - Records have UUID ids. Rows imported from MongoDB keep the old ObjectId in `legacy_id`.
   - A person may have sign-in access: a `role` (admin, user or viewer; the API shows it as `roles`), `is_active`, and their last sign-in. Emails are unique among people who sign in (a partial unique index).
   - Gear points at a rig and/or a person (`rig_id`, `person_id`; `assignedRigId`, `assignedPersonId` in the API), and a rig at its primary person, with foreign keys that clear the reference when the record is deleted. On a rig, gear goes with the rig's primary person. Serial numbers are unique. A rig's container, main, reserve and AAD are gear in its slots (`gear.slot`, one of each per rig, a partial unique index); rig responses list them as `components`. The rig's old component columns are unused and are dropped in a later release.
   - Sessions and sign-in links store only SHA-256 hashes of their tokens, and are deleted with their person.
   - The audit log is append-only (a trigger refuses UPDATE and DELETE) and keeps the record before and after each update.

## Security model

See [Security.md](Security.md).

## Deployment

See [Deployment.md](Deployment.md). Images are published to `ghcr.io/brbrockel/rigtracker:<version>`, and the stack is `homelab-docker-linux/rigtracker/rigtracker-stack.yml`.
