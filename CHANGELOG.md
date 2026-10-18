# Changelog

RigTracker follows [semantic versioning](https://semver.org). Deploys before 2.0.0 are pre-releases (`2.0.0-alpha.N`, then `-beta.N`, `-rc.N`); [doc/Plan.md](doc/Plan.md) has what's still to come.

## 2.0.0 (in progress)

### Breaking

- **Google sign-in is removed.** People sign in with an email and password, set from a single-use password link an admin gives them (or from `dist/scripts/sign-in-link.js`).
- **People and sign-in accounts are one record.** Access is a role on the person. The old `users` collection was migrated, and kept as `users_merged` until Mongo was retired.
- **Sign-in is required for everything,** including reading records and opening uploaded media, except a read-only guest view of rigs, gear and events.
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
- Passwords (Argon2id, NIST rules), lockouts, optional authenticator codes with recovery codes, and "Look around as a guest" (TeeMate's model).
- Sign-in access and password links managed from People, "Unlock account", "Reset authenticator" and "Sign out everywhere".
- The Activity log records sign-ins, failed sign-ins, lockouts, sign-outs, links, passwords, authenticator changes, guests and access changes.
- Notices from admins as banners on every page, with automatic repack reminders.
- Per-IP rate limits, security headers and a CSP.
- `/api/health`, and the running version on Account.
- Nightly verified backups.
- 427 API tests, 99 web tests, `pnpm check` and CI.

### Fixed

- Records were readable without signing in, and any Google account could sign in.
- Uploaded HTML or SVG could run script on the site.
- Database operators could be injected through query strings and bodies.
- Deleting a person left dangling references, and gear whose rig was deleted couldn't be edited.
- Duplicate serials, bad ids and invalid values answered with 500 errors.
- Imported spreadsheet blanks (dates in 1900) showed as long-overdue repacks.

### 2.0.0-beta.5

- **Installing on Android and computers:** Home now offers **Install RigTracker** with an **Install** button whenever the browser can install it (Chrome, Edge or Samsung Internet), opening the browser's own dialog, instead of waiting for Chrome to show its prompt by itself (it often doesn't). On Android without that offer, it gives the menu steps (⋮ → Add to Home screen or Install app). iPhone keeps its Share → Add to Home Screen steps. Hidden once installed, opened from the icon, or dismissed.

### 2.0.0-beta.4

- **A password is required.** Admins get a banner that can't be dismissed while anyone with sign-in access has no password ("Alex and Sam need a password"), saying who also needs an email address first; it opens People filtered to them (**Needs a password**, `/people?filter=password`) and goes away when each has a password or their access is turned off.
- **People** shows a **Needs a password** badge (or **Needs an email and a password**), and a sign-in recorded without a password says "(before passwords)": it was with Google or an old link, in 1.x or the early betas.
- **Anyone signed in without a password** (a session from before passwords) sets one before using anything else.

### 2.0.0-beta.3

- **Notices** (TeeMate's, for one club). Admins post a notice (an optional title and up to 1,000 characters) to **everyone who signs in**, **one person**, or **the public** (guests too), from the horn in the top bar or **People → ⋯ → Send notice**. **Must see** keeps it a banner until each person dismisses it; **Banner until** picks when it stops (by default a week, two days for one person). It stays in the notices list after. Admins edit and delete them; each change is in the Activity log (`notices`).
- **Banners** at the top of every page, stacked like phone notifications (the top one with a +N count; tap to fan them out), tinted in the primary colour: must-see first, then overdue repacks, then what's for you, then everyone's, newest first. Tap one for its text (that marks it read), ✕ to dismiss it. An edited notice shows again.
- **Repack reminders:** a rig's primary person gets a banner when its repack is due within 14 days ("Rig #6 repack due Jun 8") or overdue ("…overdue since Jun 8"); admins get one summary ("2 rigs overdue, 1 due within 14 days") that opens Rigs filtered to them (`/rigs?filter=repack`, a new filter). Dismissing one keeps it away until the due date (or the list) changes. Placeholder dates before 1950 are ignored.
- **The horn** shows how many notices are new that aren't already a banner, and opens every notice for you, with **Mark all read**. Home shows a one-line "New notice" strip only while something new isn't a banner.
- **Texting a notice:** after posting (or with the text button on a notice) admins get **Also text it**, which opens their own Messages with the text and the mobile numbers of the people it's for (for everyone or the public: everyone with sign-in access that's on), and says how many have no number and are skipped. RigTracker itself sends nothing: no email, no texts, no push.
- **Guests** see public notices as banners (dismissing them is kept in the browser) and in the horn, and nothing else.
- **API:** `GET /api/notices` and `GET /api/notices/banners` (guests: public notices only), `POST /api/notices/read` and `/dismiss` (`ids`, or `keys` for repack reminders), and for admins `POST /api/notices`, `PATCH|DELETE /api/notices/:id`, `GET /api/notices/:id/phones`.
- **Deploy:** migration 0007 only adds the `notices`, `notice_reads` and `notice_dismissals` tables.

### 2.0.0-beta.2

- A password link's **Text** button opens Messages addressed to the person's mobile number when they have one (it already filled in the message). **Email** opens your mail app addressed to them, with the subject and link filled in. RigTracker itself sends nothing.

### 2.0.0-beta.1

- **Breaking: passwords.** Signing in is an email and password (`POST /api/auth/sign-in`), as in TeeMate:
  - Passwords are Argon2id hashes and follow NIST rules: 10 to 128 characters, not one of about 2,300 common or breached passwords, not your email, not one character repeated.
  - A wrong email and a wrong password get the same answer ("Email or password is incorrect").
  - 5 wrong passwords or codes lock the account for 15 minutes, doubling with each lockout in a row up to 24 hours; a success resets it. Each visitor IP gets 30 password attempts per 15 minutes. Lockouts are in the Activity log, People shows "Locked until…", and admins can **Unlock account** (`POST /api/auth/people/:id/unlock`).
- **Breaking: sign-in links are password links.** `/sign-in#token=…` (the same URL, so links already sent still work) shows who it's for and a **Set your password** form. `POST /api/auth/link/redeem` now needs `{ token, password }`: it sets the password, uses up the link, signs out other sessions and signs in. `POST /api/auth/link/check` also says `hasPassword`. People → **Get password link**; the `sign-in-link.js` script prints one.
- **Authenticator codes (optional):** Account → **Security** sets up an authenticator app (QR code or key), with 8 one-time recovery codes shown once, new recovery codes and turning it off (both need the password). Signing in then answers `{ needsCode, token }` and finishes with `POST /api/auth/sign-in/code { token, code }`; a password link also asks for a code. Each code works once. The key is encrypted with AES-256-GCM using `APP_SECRET`. Admins can **Reset authenticator** (`POST /api/auth/people/:id/reset-authenticator`), which signs the person out everywhere.
- **Account → Security:** change (or first set) your password, which signs out your other devices; the authenticator. New routes: `GET /api/auth/security`, `POST /api/auth/password`, `POST /api/auth/totp/start|enable|disable|recovery-codes`.
- **Look around as a guest** (`POST /api/auth/guest`): a 12-hour, read-only session without a person. Guests get rigs, gear, events, their media and photos; people appear as "First L." (`primaryUserName` on rigs, `assignedPersonName` on gear) and nothing else about them. Everything else is 403. The app shows guests Home, Rigs, Gear and Events and a **Sign in** button.
- People responses have `hasPassword`, `totpEnabled` and `lockedUntil`, never the hashes or the key.
- TeeMate's mail guard (`MAIL_MODE=off` by default); RigTracker still sends no email.
- **Deploy:** needs the `rigtracker_app_secret` Docker secret and `APP_SECRET_FILE` (the API refuses to start in production without it). Migration 0006 only adds columns, a table and an index. Existing sessions continue; everyone else needs a password link. See [Deployment.md](doc/Deployment.md#passwords-and-the-guest-view-200-beta1).

### 2.0.0-alpha.6

- The 1.x columns are dropped: rigs' container, main, reserve and AAD text fields, and the old photo URL columns (`image_url`, `event_photo_url`, `photo_urls`). The data lives in gear slots and media.
- The one-off scripts (the Mongo importer, the rig components move, the photo move) and the `mongodb` dependency are removed; the `2.0.0-alpha.5` image still has them.

### 2.0.0-alpha.5

- **Breaking:** photos and videos are a `media` table with owners (a rig, gear or event), in order; the first is the cover (an event's main photo).
  - `POST /api/media` (multipart: `file`, `ownerType`, `ownerId`, `caption`) adds one at the end of the record's list, `GET /api/media?ownerType=&ownerId=` lists them, `PATCH /api/media/:id` changes the caption or the order (`makeCover`, `position`), and `DELETE /api/media/:id` deletes it and its file. Users and admins make changes; anyone signed in looks. Uploads are checked and re-encoded as before, and stored in `uploads/<type>/<id>/`.
  - Rig, gear and event responses have `media` and `coverUrl` instead of `imageUrl`, `eventPhotoUrl` and `photoUrls`, and bodies refuse those fields. Rig components have `coverUrl`.
  - `POST /api/uploads/image` is gone. `/uploads/...` is served as before.
  - Deleting a rig, gear or event deletes its photos and videos (`?purgeMedia=` on event deletes is ignored). A file shared by two records is kept until both are gone.
  - Migration 0004 copies the old photo columns into media at start-up; the columns stay, unused, until a later release.
- Rigs have a **Photos** card, gear its photos in the edit form, and events manage theirs the same way: take a photo or add several photos and videos, make one the cover, add captions, delete, and open them full size. Photos chosen for a new rig or gear upload as soon as it's saved.
- The Activity log records photos and videos added, removed, made the cover or captioned, as changes of their record.

### 2.0.0-alpha.4

- **Breaking:** a rig's container, main, reserve and AAD are gear, the single source of truth for serials and dates.
  - Gear has a `slot` (`container`, `main`, `reserve` or `aad`). Only gear on a rig has one, and a rig has one of each: a taken slot is 409 ("Rig #7 already has a reserve"). Taking gear off its rig, giving it to a person or deleting the rig clears it.
  - Rig responses have `components: { container, main, reserve, aad }` (the gear in each slot, or null) instead of the component fields. Rig bodies refuse those fields (`container`, `mainSize`, `aadSerialNumber`, …). The old columns stay in the database until a later release.
- The rig page has a **Components** card: add, change or take off each component, choosing existing gear or making new gear. The gear form has a **Position** select. Inventory columns, CSV, print and search use the components, and gear shows its slot with its rig ("#4 · Blue · Main").
- `dist/scripts/rig-components.js` moves the old rig fields into gear (matched by serial, or new gear), keeps conflicts in the rig's custom fields as "Unplaced …", fills missing dates and tidies gear types (`Aad` → `AAD`, trailing spaces, case variants). Dry run by default, `--apply` in one transaction, and safe to re-run.

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
