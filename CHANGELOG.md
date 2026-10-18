# Changelog

RigTracker follows [semantic versioning](https://semver.org). Deploys before 2.0.0 are pre-releases (`2.0.0-alpha.N`, then `-beta.N`, `-rc.N`); [doc/Plan.md](doc/Plan.md) has what's still to come.

## 2.0.0 (in progress)

### Breaking

- **Google sign-in is removed.** People sign in with single-use links from an admin, or from `dist/scripts/sign-in-link.js`. Passwords come before 2.0.0.
- **People and sign-in accounts are one record.** Access is a role on the person. The old `users` collection was migrated and kept as `users_merged`.
- **Sign-in is required for everything,** including reading records and opening uploaded media. A read-only guest view comes before 2.0.0.
- **API:**
  - Every change needs the session's CSRF token (`x-csrf-token`).
  - Request bodies are strict: unknown fields are refused, and gear and events no longer accept snake_case aliases.
  - The account routes moved: `/api/auth/users*` is now `/api/auth/people/:id/*`.
- **Uploads** are checked by content and images are re-encoded to JPEG. Other file types are no longer stored or served.
- **The container is one Node process on port 4000,** running as `node`, instead of nginx on 80. Images are tagged by version.
- **No CORS** unless `RIGTRACKER_CORS_ORIGIN` is set.

### Added

- The new interface on TeeMate's design: Tailwind and shadcn/ui, light and dark themes, a bottom tab bar on phones.
- An installable app (PWA), with an iPhone "Add to Home Screen" hint.
- Rigs and Gear in Table, List, Gallery or Cards layouts, with sort, grouping, columns, multi-select actions, CSV export and a print sheet.
- Sign-in access and sign-in links managed from People, and "Sign out everywhere".
- The Activity log records sign-ins, sign-outs, links and access changes.
- Per-IP rate limits, security headers and a CSP.
- `/api/health`, and the running version on Account.
- Nightly verified backups.
- 268 API end-to-end tests, 51 web tests, `pnpm check` and CI.

### Fixed

- Records were readable without signing in, and any Google account could sign in.
- Uploaded HTML or SVG could run script on the site.
- Database operators could be injected through query strings and bodies.
- Deleting a person left dangling references, and gear whose rig was deleted couldn't be edited.
- Duplicate serials, bad ids and invalid values answered with 500 errors.
- Imported spreadsheet blanks (dates in 1900) showed as long-overdue repacks.

### 2.0.0-alpha.3

- **Breaking:** PostgreSQL 18 + Drizzle replaces MongoDB.
  - Records have UUID `id`s instead of `_id`.
  - Date-only fields come back as `YYYY-MM-DD`.
  - Foreign keys connect gear, rigs and people, and sign-in emails are unique in the database.
  - The audit log is append-only (a database trigger) and records before and after values. The Activity log shows what changed.
- The API runs on NestJS 12, Express 5, ESM and TypeScript 6. `pnpm audit` finds no known vulnerabilities.
- The schema migrations (`api/drizzle`) run when the container starts.
- Backups are a nightly `pg_dump`, verified with `pg_restore --list`.
- The one-off import from Mongo keeps the old ids as `legacy_id`. It clears the 1900 placeholder dates and keeps the rigs' former names as the custom field "Past name".

### 2.0.0-alpha.2

- One Node process serves the API and the web app, with no nginx. It runs as `node`, with a healthcheck, validated settings and versioned images; `build.sh` rolls the stack onto each new version.

### 2.0.0-alpha.1

- Everything above up to the inventory layouts, deployed on 2026-10-17 before versioning started.

## 1.0.0

The original app: Google sign-in, antd interface, nginx and API in one container.
