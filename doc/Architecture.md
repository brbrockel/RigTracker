# Architecture

RigTracker is a web app (installable as a PWA) and a NestJS API backed by MongoDB. It follows TeeMate's structure and is moving to TeeMate's stack in steps ([Plan.md](Plan.md)); step 4 replaces MongoDB with PostgreSQL.

## Runtime

One container runs one Node process on port 4000. It serves:

- the API under `/api`
- uploaded photos and videos under `/uploads`, to signed-in people only
- the built web app (`WEB_DIST`), with `index.html` for client-side routes

Security headers come from helmet on every response, including the CSP.

```
Cloudflare tunnel → Traefik (rigtracker.bhbslp.org) → rigtracker:4000 ─┬─ MongoDB (internal network, auth)
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
   - **Stack:** NestJS 10 and Mongoose 7. Every request body and query is checked with zod.
   - **Modules:**
     - `auth`: sign-in links, sessions, CSRF and roles;
     - `people`: people and their sign-in access;
     - `rigs`, `gear`, `events`, `uploads`, `audit`, `health`.
   - **Global guards, in order:**
     1. rate limit per visitor IP;
     2. session and CSRF;
     3. roles.
   - **Scripts:** `dist/scripts/sign-in-link.js` (the first admin, or a lockout) and one-off data migrations.

3. **Data (MongoDB 6, `people`, `rigs`, `gear`, `events`, `sessions`, `sign_in_links`, `audit_logs`)**
   - A person may have sign-in access: `roles` (admin, user or viewer), `isActive`, and their last sign-in.
   - Gear points at a rig and/or a person (`assignedRigId`, `assignedPersonId`). On a rig, gear goes with the rig's primary person.
   - Sessions and sign-in links store only SHA-256 hashes of their tokens.

## Security model

See [Security.md](Security.md).

## Deployment

See [Deployment.md](Deployment.md). Images are published to `ghcr.io/brbrockel/rigtracker:<version>`, and the stack is `homelab-docker-linux/rigtracker/rigtracker-stack.yml`.
