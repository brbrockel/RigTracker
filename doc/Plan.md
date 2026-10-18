# RigTracker Plan

How RigTracker gets to TeeMate's stack and security model, step by step, while the live app keeps working. Background: [Review-2026-10.md](Review-2026-10.md). Last updated 2026-10-17.

## Objective

Track the club's rigs, gear, events and people, with:

- RigTracker's own sign-in (no Google), working like TeeMate's.
- TeeMate's interface: mobile first, light and dark themes, an installable app, the same components.
- A read-only guest view of basic information.
- One stack shared with TeeMate, so fixes and patterns carry over.

## Decisions

| Topic | Decision |
|---|---|
| Approach | Change the live app in steps instead of a big-bang `v2` branch. The UI step showed this works: each step is rehearsed on a restored copy of last night's backup, then deployed. |
| People and sign-in | One record. A person may have sign-in access with a role: **Admin** (everything, including private details, access and the audit log), **User** (adds and changes rigs, gear, events and people) or **Viewer** (signed-in read access). |
| Getting in | An admin gives access on **People**, then sends a single-use 72-hour sign-in link by copying, texting or emailing it. The server sends nothing. The first admin, or anyone locked out, uses `node dist/scripts/sign-in-link.js <email> [--admin "Name"]`. |
| Passwords | TeeMate's model, added in step 5: Argon2id with NIST rules and a breached-password list; links set a password; per-account lockout and per-IP limits; optional authenticator codes with recovery codes. |
| Guests | Read-only rigs, gear and events, with their photos. People appear only as first name and last initial. No contact details, DOB, address, emergency contacts, audit log or settings. |
| Database | PostgreSQL 18 + Drizzle (step 4), for foreign keys, unique constraints, an append-only audit trigger and the same backup and migration tooling as TeeMate. |
| User data | No new people data is entered as part of this work (decided 2026-10-17). Placeholder dates from the spreadsheet import (before 1950) display as unset. |

## Done

| Date | What | Commits |
|---|---|---|
| 2026-10-17 | Independent review | `8180cc7` |
| 2026-10-17 | Lock-down: sign-in required everywhere, uploads checked and re-encoded, same-origin only (no CORS), helmet and CSP, Node 24, dependency audit 36 → 1 | `e9ae7ba` |
| 2026-10-17 | Homelab: Docker secrets, Mongo with auth on an internal network, no published DB/API/mongo-express ports, nightly verified backup (a restore was rehearsed) | homelab `bde07b4`, `b2af016` |
| 2026-10-17 | Google sign-in removed; single-use sign-in links (CLI and app); hashed session and link tokens; CSRF token on every change; sign-in events in the audit log | `9753af5`, `0c0c36a` |
| 2026-10-17 | UI on TeeMate's stack: React 19, Vite 8, Tailwind 4, shadcn/Radix, TanStack Query, react-router 8; 36 web tests | `0c0c36a`, `2378698` |
| 2026-10-17 | People and sign-in accounts merged into one record (production migrated; old accounts kept in `users_merged`) | `7bf839c` |
| 2026-10-17 | Installable PWA with an iPhone "Add to Home Screen" hint | `69120e1` |
| 2026-10-17 | Step 1: strict zod schemas for rigs, gear and events (unknown fields, operator values and non-upload media URLs refused); query strings must be plain strings; per-IP rate limits (300/min, sign-in links 10/min, uploads 30/min); updates run validators; deleting a person clears references; gear whose rig was deleted stays editable; cleared serials removed; last name optional | `f56e534` |

| 2026-10-17 | Rigs and Gear inventory layouts: Table, List, Gallery and Cards (remembered per device and page), sort, group by, column picker, multi-select (assign, unassign, delete), CSV export, print sheet | `bf97d3f` |
| 2026-10-17 | Step 2: 247 API end-to-end tests (the contract for step 4), Prettier, ESLint, `.nvmrc`, `.env.example`, docker compose Mongo, `pnpm check`, GitHub Actions CI; unused `packages/shared` removed | `152641b` |
| 2026-10-17 | Step 3: one Node process (no nginx), `USER node`, `/api/health` + healthcheck, validated config, helmet CSP, versioned images with `build.sh` rolling deploys, `Deployment.md`, `Security.md`, `CHANGELOG.md`; `v1.0.0` tagged on the pre-review app | 2.0.0-alpha.2 |
| 2026-10-18 | Production cutover to Postgres: about 5 minutes of downtime, the import verified every collection, a backup was taken right after; Mongo kept as the rollback until about 2026-11-17 | 2.0.0-alpha.3 |
| 2026-10-18 | Step 4a (2.0.0-alpha.3): PostgreSQL 18 + Drizzle, NestJS 12, Express 5, ESM, TS 6; UUID ids; FKs; append-only audit with before/after (shown in the Activity log); importer from Mongo with verification; `pg_dump` backups; 268 API tests | 2.0.0-alpha.3 |
| 2026-10-18 | Step 4b: rig components as gear slots (alpha.4, the move matched 9 gear by serial and created 11), the media table for photos and videos (alpha.5, 61 photos moved), and the 1.x columns and one-off scripts removed (alpha.6) | 2.0.0-alpha.6 |
| 2026-10-17 | Notices (2.0.0-beta.3, TeeMate's): admins post to everyone, one person or the public (guests too), as stacked banners on every page and in the horn's list, with must-see, banner end dates, read and dismissed state per person, an "Also text it" group text from the admin's phone, People → ⋯ → Send notice, and automatic repack reminders (the primary person within 14 days or overdue, a summary for admins); migration 0007; nothing is emailed or pushed | 2.0.0-beta.3 |

## Releases

2.0.0 is a major release (breaking changes in sign-in, accounts, the API and the container). Each deploy until then is a pre-release: `2.0.0-alpha.N` through step 4, `-beta.N` for step 5 and the test plan, `-rc.N` for the final check. See [Deployment.md](Deployment.md#versions) and [CHANGELOG.md](../CHANGELOG.md).

## Next steps

Each step is rehearsed on a backup copy, deployed, and checked on production before the next one starts.

### 1. Close the remaining API gaps (S) — done 2026-10-17

Open findings from the review that are still exploitable today:

- **S3 mass assignment:** rigs save the raw request body (`rigs.service.ts:19,53`). Gear and events need checking too. Fix: whitelist the fields and validate them with zod, as people now do.
- **S4 query injection:** `?rigId[$ne]=` on gear and `?action[$ne]=` on audit. Fix: string-only query parsing, plus `mongoose.set('sanitizeFilter', true)`.
- **S7 rate limiting:** add `@nestjs/throttler`, keyed on `CF-Connecting-IP`, for the sign-in link routes, uploads and writes.
- **Correctness bugs from the review §3:**
  - `runValidators` on updates;
  - dangling references when a rig or person is deleted;
  - gear that can't be edited when its rig is missing.

### 2. Tooling and a safety net (S–M) — done 2026-10-17

Do this before the bigger changes:

- `.nvmrc` (24) and `engines`, `tsconfig.base.json`, ESLint and Prettier (TeeMate's configs), `.editorconfig`, `.env.example`.
- `pnpm check` = lint + format:check + typecheck + test.
- GitHub Actions CI with `--frozen-lockfile`.
- API tests with vitest and supertest against a throwaway Mongo. Cover the guards (signed out, viewer, user, admin), CSRF, sign-in links and access, and CRUD for each resource. These tests are the contract for step 4.
- Delete stale files: `tools/import_run.log`, the empty `api/src/packs/`, and the workspace path to `/srv/homelab-data`.

### 3. Container and deploys (M) — done 2026-10-17 (2.0.0-alpha.2)

- One Node process serves the API and the built web app, like TeeMate, with no nginx in the container. Move the security headers and CSP into helmet.
- `USER node`, `/api/health` and `HEALTHCHECK`; zod-validated config with `*_FILE` secrets.
- Versioned image tags (`APP_VERSION`, the git commit) and a rolling `docker stack deploy` in `build.sh`. No more `stack rm`, and no more forced updates.
- Write `Deployment.md` (secrets, deploy, rollback, backup and restore drill) and `Security.md`.

### 4. PostgreSQL + Drizzle, NestJS 12 (L) — done 2026-10-18 (2.0.0-alpha.3 to alpha.6)

Split in two on 2026-10-17:

- **4a: the database and framework move,** with the same API behaviour (the 252 tests as the contract). Done in 2.0.0-alpha.3.
- **4b: the model changes:** rig components as gear rows, and a media table for photos and videos with owners. These change the rig and event screens.
  - **Part 1, rig components as gear** (2.0.0-alpha.4, built, not yet deployed): `gear.slot` (one container, main, reserve and AAD per rig), `components` on rig responses, the Components card and Position select, and `scripts/rig-components.ts` to move the rig columns into gear ([Deployment.md](Deployment.md#rig-components-into-gear-200-alpha4)). The old columns are dropped in a later release, once production has been moved.
  - **Part 2, a media table** (2.0.0-alpha.5, built, not yet deployed): photos and videos of rigs, gear and events in a `media` table with owners and an order (the first is the cover), `/api/media` to add, list, reorder, caption and delete them, `media` and `coverUrl` on the records, a Photos card on rigs, photos in the gear form and on events, and migration 0004 copying the old photo columns ([Deployment.md](Deployment.md#photos-and-videos-into-media-200-alpha5)). The old columns are dropped in a later release with the old rig component columns.

- **Upgrade:** ESM, NestJS 12, Express 5 and TypeScript 6, which clears the last audit finding.
- **Schema:**
  - Foreign keys: gear → rig and person with `ON DELETE SET NULL`, and rig → primary person.
  - Unique serial and rig number.
  - A rig's container, main, reserve and AAD become gear rows, replacing the serials embedded in the rig.
  - An append-only `audit_log` enforced by a trigger, with before and after values.
  - A media table with owners.
- **Migrations** run at start-up, like TeeMate's.
- **Import script:** reads a `mongodump` archive, keeps the old ids in `legacy_id`, reports conflicts instead of guessing, prints counts, and can be re-run.
- **Rehearsal:** run it on a staging stack until step 2's API tests and the TestPlan pass. Then cut over with a short downtime, keep Mongo for 30 days as a rollback, and switch the backup job to `pg_dump`.

### 5. Passwords, lockouts and the guest view (M) — built (2.0.0-beta.1), not yet deployed

**Status:** built on the `step5-passwords` branch as 2.0.0-beta.1 (migration 0006, 411 API and 87 web tests). Deploying needs the `rigtracker_app_secret` Docker secret and `APP_SECRET_FILE` in the stack ([Deployment.md](Deployment.md#passwords-and-the-guest-view-200-beta1)); after it, everyone without a live session needs a password link. Sign-in links became password links at the same URL, so links already sent still work. Email stays off: the mail guard is in place, with nothing that sends.

- **Port from TeeMate:**
  - `auth/password.ts` (Argon2id, NIST rules, breached-password list);
  - set-password links;
  - per-account exponential lockout, and per-IP limits;
  - an optional authenticator (TOTP, AES-GCM-encrypted with `APP_SECRET`) with recovery codes;
  - a Security card on Account.
- Sign-in links remain for first sign-in and resets (as password links).
- **Guest view:**
  - "Look around as a guest" on the sign-in page;
  - read-only;
  - the API returns guest-safe fields only.
- **Email** stays off, behind TeeMate's mail guard (`MAIL_MODE=off`), until approved.

### 6. Finish (S)

- **`TestPlan.md`:** a phone and desktop checklist for each page.
- **Docs:** update `Architecture.md` and `Development.md`.
- **Retire** Mongo, the `users_merged` collection and the Google OAuth client in Google Cloud Console.
- **Optional:** move the other homelab stacks' plaintext passwords (Grafana, Frigate, Komodo, Nextcloud) to Docker secrets.
