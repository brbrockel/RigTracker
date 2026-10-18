# Sign-in and security

RigTracker signs people in itself, with single-use sign-in links. Google sign-in was removed in 2.0.0. It doesn't send any email; admins pass links on themselves. Passwords, lockouts and optional authenticator codes (TeeMate's model) come in step 5 of [Plan.md](Plan.md).

## People and access

Every person is a record on **People**. A person can be given sign-in access with a role:

| Role | Can |
|---|---|
| **Admin** | Everything: people's private details, sign-in access, deleting, the Activity log |
| **User** | Add and change rigs, gear, events and people; upload photos |
| **Viewer** | Look at everything a signed-in member sees; change nothing |

People without access can't sign in. Access needs an email address that no one else who signs in uses. An ordinary edit can never set someone's role.

Other safeguards:

- You can't remove your own admin role or delete yourself.
- Removing someone's access signs them out everywhere.

## Sign-in links

1. An admin opens **People → ⋯ → Sign-in access…** and picks a role.
2. **⋯ → Get sign-in link** gives a single-use link, valid for 72 hours, to copy, text (it opens Messages) or email (it opens your mail app).
3. Opening the link shows who it's for. Pressing **Sign in** uses it up and starts a 30-day session. A phone previewing the link can't spoil it.

How the links are protected:

- The token is 256 bits.
- It travels in the URL fragment (`#token=`), which browsers never send to servers or in Referer headers.
- It is stored only as a SHA-256 hash.
- Checking or using links is limited to 10 tries a minute per visitor IP.

The first admin on a new server, or anyone if every admin is signed out:

```bash
docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com --admin "Your Name"
```

## Sessions

- **The cookie:** a random 256-bit token, stored only as a hash, in an `HttpOnly`, `SameSite=Lax` cookie that is `Secure` in production. It lasts 30 days.
- **Every change** (POST, PUT, PATCH or DELETE) needs the session's CSRF token in `x-csrf-token`.
- **Cross-site writes** are refused: the `Origin` must match the site.
- **Signing out:** admins can sign anyone out everywhere from People.

## Requests

- **Login is required by default:** every API route and every uploaded file needs a session. The exceptions are the sign-in routes and `/api/health`.
- **Bodies and queries** are checked with strict zod schemas:
  - unknown fields, operator objects such as `{"$gt": ""}` and non-string query values are refused;
  - photo and video URLs are never taken from requests: the server stores the file and picks the URL.
- **Rate limits per visitor IP** (from Cloudflare's `CF-Connecting-IP`): 300 requests a minute, 10 sign-in link tries a minute, 30 uploads a minute.
- **Same-origin only:** no CORS headers unless `RIGTRACKER_CORS_ORIGIN` is set.
- **Headers** (helmet) on everything:
  - a strict CSP (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`);
  - `nosniff`, HSTS, and `Referrer-Policy: strict-origin-when-cross-origin`;
  - a Permissions-Policy.

## Uploads

- **Checked by content, not by name:** only JPEG, PNG, GIF, WebP or AVIF images, and MP4, MOV or WebM videos.
- **Images are re-encoded to JPEG** (up to 2560 px), which turns them upright and drops all metadata, including GPS location. Images can be up to 30 MB and videos up to 200 MB.
- **The server picks the file name and folder:** `uploads/<rig|gear|event>/<record id>/<random id>.<ext>`. An upload names the record it belongs to (`POST /api/media`), which must exist.
- **Users and admins** add, caption, reorder and delete photos and videos; viewers only look. Each change is in the Activity log as a change of its record.
- **Deleting a record deletes its files,** and deleting a photo deletes its file, unless another record still uses it. Only files inside the uploads folder are ever deleted.
- **Served to signed-in people only,** with `Content-Security-Policy: sandbox` and `nosniff`. Other file types are never served.

## Audit log

Recorded actions:

- creating, changing and deleting rigs, gear, people and events;
- sign-ins and sign-outs;
- sign-in links made;
- sign-in access changes.

Admins see it under **Activity log**. Updates keep the record's values before and after the change. It is append-only: a database trigger refuses any change or removal of an entry.

## Secrets and infrastructure

- **Secrets:** the database connection string is a Docker secret (`DATABASE_URL_FILE`; `MONGO_URI_FILE` only for the one-off import). No secrets are kept in either repository.
- **The database:** PostgreSQL runs with a password on an internal network, with no published ports.
- **The container** runs as the unprivileged `node` user.
- **Backups:** nightly. See [Deployment.md](Deployment.md).

## Still to come (2.0.0)

- **Passwords and lockouts:**
  - Argon2id with NIST rules and a breached-password list;
  - per-account lockout and per-IP limits;
  - optional authenticator codes with recovery codes.
- **A read-only guest view:** people shown by first name and last initial only.
