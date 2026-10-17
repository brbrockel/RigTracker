# RigTracker v2 Plan

A ground-up rebuild of RigTracker on TeeMate's stack and security model, with a tested migration path from the current app. Decided 2026-10-17; background in [Review-2026-10.md](Review-2026-10.md).

## Objective

Track the club's skydiving rigs, gear, events and members, with:

- RigTracker's own sign-in (no Google). It works like TeeMate: passwords, sign-in links, lockouts, and optional authenticator codes.
- An interface that matches TeeMate: mobile first, light and dark themes, the same components.
- A guest view of basic information.
- One stack shared with TeeMate, so fixes and patterns carry across.

## Decisions

| Topic | Decision |
|---|---|
| Approach | Rebuild on a `v2` branch in this repo, starting from TeeMate's skeleton. The current app stays in production (Phase 0 hardened) until cutover. |
| Stack | Node 24, TypeScript 6 (ESM), NestJS 12, Express 5, zod, PostgreSQL 18 + Drizzle; React 19, Vite 8, Tailwind 4 + TeeMate `ui/*`, TanStack Query, react-router 8; vitest everywhere, ESLint, Prettier, CI. |
| Container | One Node process serves the API and the built web app (no nginx), runs as `node`, has a healthcheck, and applies migrations on start. Secrets come from Docker secrets. |
| Sign-in | Ported from TeeMate (see [TeeMate Security.md](../../teemate/doc/Security.md)): Argon2id passwords with NIST rules and a breached-password list; single-use, hashed 72-hour password links; per-account exponential lockout and per-IP limits; hashed session cookies; CSRF on every change; optional TOTP with recovery codes. Google sign-in is removed. |
| First admin | A CLI script prints a sign-in link: `docker exec … node dist/scripts/sign-in-link.js you@example.com`. |
| Getting people in | An admin adds the person, then uses **⋯ → Get password link** to copy it, or **Text** to open Messages with the link filled in. Email code is included behind TeeMate's mail guard with `MAIL_MODE=off`, so it can be turned on later. |
| Roles | **Admin** (everything, including people's private details, users and the audit log), **Editor** (changes rigs, gear and events), **Member** (signed-in read access, including people). |
| Guests | Read-only rigs, gear, events and their photos. People appear only as first name and last initial. No contact details, DOB, address, emergency contacts, audit log or settings. |
| Audit | Append-only, enforced by a database trigger. It records before and after values plus sign-in events. |

## Data model (draft)

- `user`: sign-in account (email, password hash, role, lockout, TOTP).
- `session`, `password_link`: stored as hashes only.
- `person`: club member. Has a profile and private details (phone, DOB, address, emergency contacts). Linked to a `user` if the person can sign in.
- `rig`: number (unique), name, primary person (FK), notes, photo.
- `gear`: type (`container`/`main`/`reserve`/`aad`/`other`), make, model, size, serial (unique), dates (DOM, repack, inspection), rig (FK, `ON DELETE SET NULL`), person (FK), `custom_fields` jsonb.
  - A rig's container, main, reserve and AAD are gear rows. This replaces the serials embedded in the rig, which kept the same data in two places.
- `event`, `media`: media has an owner (rig, gear or event), a kind (photo or video) and stored-file metadata. Photos are re-encoded with no EXIF data.
- `audit_log`: append-only.

Computed, not stored: repack and inspection due status, and what is assigned to whom.

## Migration path

1. **Import script** (`scripts/import-mongo.ts`). It reads a `mongodump` archive from the nightly backup and writes Postgres.
   - The old ObjectIds are kept in a `legacy_id` column.
   - Rig serials are reconciled with gear rows, and conflicts are reported instead of guessed.
   - It is idempotent, so it can be re-run.
   - Uploads are re-encoded into the media store and linked to their owners.
2. **Accounts.** The three existing Google users become accounts without passwords. The first admin gets a link from the CLI and sends links to the others.
3. **Rehearsal.** Deploy v2 as a separate stack at `rigtracker-next.bhbslp.org` and import last night's backup into it. Then compare counts (the script prints them) and check each page against `TestPlan.md`. Repeat as needed.
4. **Cutover** (short downtime):
   1. Stop the old app.
   2. Take a final backup and import it.
   3. Point `rigtracker.bhbslp.org` at v2.
5. **Rollback window.** Keep the old image and the Mongo volume for 30 days. Then:
   - remove Mongo;
   - delete the Google OAuth client.

## Milestones

| # | Milestone | Done when |
|---|---|---|
| M1 | Skeleton from TeeMate: tooling, CI, config, Postgres and migrations, single-process Docker image, health check | `pnpm check` and the CI pipeline pass; the image serves an empty shell |
| M2 | Auth, users, audit and mail ported; app shell, theme, and the Sign in, Set password, Account and People/Users screens | First admin via CLI; links, lockout and TOTP tested |
| M3 | Domain schema and API (people, rigs, gear, events, media) with guest rules | API tests cover guest, member, editor and admin access |
| M4 | Web pages: Home (repacks due), Rigs, Gear, Events, People, Audit | Matches TeeMate's patterns; component tests |
| M5 | Import script, staging stack, and the `Security.md`, `Deployment.md` and `TestPlan.md` docs | Rehearsal import checks out |
| M6 | Cutover and clean-up | v2 is live; Mongo and Google are retired after 30 days |
