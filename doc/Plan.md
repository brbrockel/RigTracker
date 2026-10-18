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

### 3. Container and deploys (M)

- One Node process serves the API and the built web app, like TeeMate, with no nginx in the container. Move the security headers and CSP into helmet.
- `USER node`, `/api/health` and `HEALTHCHECK`; zod-validated config with `*_FILE` secrets.
- Versioned image tags (`APP_VERSION`, the git commit) and a rolling `docker stack deploy` in `build.sh`. No more `stack rm`, and no more forced updates.
- Write `Deployment.md` (secrets, deploy, rollback, backup and restore drill) and `Security.md`.

### 4. PostgreSQL + Drizzle, NestJS 12 (L)

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

### 5. Passwords, lockouts and the guest view (M)

- **Port from TeeMate:**
  - `auth/password.ts` (Argon2id, NIST rules, breached-password list);
  - set-password links;
  - per-account exponential lockout, and per-IP limits;
  - an optional authenticator (TOTP, AES-GCM-encrypted with `APP_SECRET`) with recovery codes;
  - a Security card on Account.
- Sign-in links remain for first sign-in and resets.
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
