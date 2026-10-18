# Sign-in and security

RigTracker signs people in itself, with an email address and password (TeeMate's model, since 2.0.0-beta.1). Google sign-in was removed in 2.0.0. It doesn't send any email; admins pass password links on themselves. Visitors without an account can look around as a guest.

## People and access

Every person is a record on **People**. A person can be given sign-in access with a role:

| Role | Can |
|---|---|
| **Admin** | Everything: people's private details, sign-in access, unlocking accounts, resetting authenticators, deleting, the Activity log |
| **User** | Add and change rigs, gear, events and people; upload photos |
| **Viewer** | Look at everything a signed-in member sees; change nothing |
| **Guest** (no account) | Look at rigs, gear and events and their photos; people show as "First L." |

People without access can't sign in. Access needs an email address that no one else who signs in uses. An ordinary edit can never set someone's role, password or authenticator.

Other safeguards:

- You can't remove your own admin role or delete yourself.
- Removing someone's access signs them out everywhere.

## Passwords

- Stored only as **Argon2id** hashes (19 MiB, 2 passes: OWASP's recommended minimum). The password itself is never stored or logged, and never in the Activity log.
- **Rules (NIST SP 800-63B):** at least 10 characters (up to 128), and no forced symbols or scheduled changes. Refused: about 2,300 common or breached passwords of 10+ characters, the person's own email address, and one character repeated.
- **Checking takes the same time** whether or not the email has an account (a dummy hash is checked for unknown emails).
- **Changing your password** (Account → Security, with your current one) signs you out on your other devices.
- **Someone without a password** can only get in with a password link.

## Password links

1. An admin opens **People → ⋯ → Sign-in access…** and picks a role.
2. **⋯ → Get password link** gives a single-use link, valid for 72 hours, to copy, text (it opens Messages) or email (it opens your mail app).
3. Opening the link shows who it's for and a **Set your password** form (**Reset your password** if they have one). Saving the password uses up the link, signs them out on other devices, clears any lockout and signs them in. If the account has authenticator codes on, they also enter a code first, so a link alone can't get past the authenticator.
4. Opening the link doesn't use it up, so a phone previewing the link can't spoil it.

A forgotten password works the same way: an admin gets a new password link.

How the links are protected:

- The token is 256 bits.
- It travels in the URL fragment (`/sign-in#token=`), which browsers never send to servers or in Referer headers.
- It is stored only as a SHA-256 hash.
- Checking or using links is limited to 10 tries a minute per visitor IP.

The first admin on a new server, or anyone if every admin is locked out:

```bash
docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com --admin "Your Name"
```

It prints a password link (the script keeps its old name).

## Guessing and lockouts

- **Per account:** after 5 wrong passwords (or authenticator codes), the account cools down for 15 minutes. Each lockout in a row doubles it (30 minutes, an hour, and so on up to 24 hours). A successful sign-in resets the count.
  - Lockouts are temporary on purpose: a permanent lock would let anyone lock a member out by typing wrong passwords.
  - Each try takes one of the 5 before the password is checked, so parallel guesses can't get past the limit.
- **Per network address:** 30 password attempts every 15 minutes across all accounts (and 30 code attempts). The real visitor address comes from Cloudflare's `CF-Connecting-IP`.
- **What admins see:** every lockout and failed sign-in is in the **Activity log**. Admins see "Locked until…" on **People** and can **Unlock account**.
- **Messages:** "Email or password is incorrect" either way, so the sign-in form can't be used to find out who is a member.

## Authenticator codes (optional)

- **Setup:** **Account → Security → Set up authenticator** works with Google Authenticator, Microsoft Authenticator, 1Password and similar apps (a QR code, or the key to type in). It uses 6-digit codes that change every 30 seconds (RFC 6238), and each code works once.
- **Signing in:** after the right password, the app asks for a code. The step between the two is a single-use token that lasts 5 minutes.
- **Recommended for admins:** an admin account controls everyone's details.
- **Storage:** the app's key is encrypted with AES-256-GCM using the server's `APP_SECRET`, a Docker secret in production.
- **Recovery codes:** 8 one-time codes are shown once when the app is set up, stored only as hashes. Each can stand in for a code if the phone is lost. **New recovery codes** (with your password) replace the old ones.
- **Turning it off:** you need your password. An admin can also **Reset authenticator** for someone who lost their phone, which signs them out everywhere.

## Guests

**Look around as a guest** on the sign-in page starts a guest session: a session row with no person, a CSRF token as usual, for 12 hours.

- **Guests can only read** rigs, gear and events (`GET /api/rigs`, `/api/gear`, `/api/events`, each by id too, and `/api/media`), and the uploaded photos and videos of rigs, gear and events. Routes are closed to guests unless marked for them, so a new route never shows guests anything by accident.
- **People are "First L."** (first name and last initial) in rigs and gear. Guests never get emails, phones, dates of birth, addresses, emergency contacts, People, the Activity log, uploads or any change.
- **In the app** guests have Home, Rigs, Gear and Events, no New, Edit or Delete, and a **Sign in** button that ends the guest session.

## Sessions

- **The cookie:** a random 256-bit token, stored only as a hash, in an `HttpOnly`, `SameSite=Lax` cookie that is `Secure` in production. It lasts 30 days (12 hours for guests).
- **Every change** (POST, PUT, PATCH or DELETE) needs the session's CSRF token in `x-csrf-token`.
- **Cross-site writes** are refused: the `Origin` must match the site.
- **Signing out:** admins can sign anyone out everywhere from People; changing a password, a password link and an authenticator reset do it automatically.

## Requests

- **Login is required by default:** every API route and every uploaded file needs a session. The exceptions are the sign-in routes and `/api/health`; guests get only the routes above.
- **Bodies and queries** are checked with strict zod schemas:
  - unknown fields, operator objects such as `{"$gt": ""}` and non-string query values are refused;
  - photo and video URLs are never taken from requests: the server stores the file and picks the URL.
- **Rate limits per visitor IP** (from Cloudflare's `CF-Connecting-IP`): 300 requests a minute, 10 password link tries and guest sessions a minute, 30 uploads a minute, and the password limits above.
- **Same-origin only:** no CORS headers unless `RIGTRACKER_CORS_ORIGIN` is set.
- **Headers** (helmet) on everything:
  - a strict CSP (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`);
  - `nosniff`, HSTS, and `Referrer-Policy: strict-origin-when-cross-origin`;
  - a Permissions-Policy.

## Uploads

- **Checked by content, not by name:** only JPEG, PNG, GIF, WebP or AVIF images, and MP4, MOV or WebM videos.
- **Images are re-encoded to JPEG** (up to 2560 px), which turns them upright and drops all metadata, including GPS location. Images can be up to 30 MB and videos up to 200 MB.
- **The server picks the file name and folder:** `uploads/<rig|gear|event>/<record id>/<random id>.<ext>`. An upload names the record it belongs to (`POST /api/media`), which must exist.
- **Users and admins** add, caption, reorder and delete photos and videos; viewers and guests only look. Each change is in the Activity log as a change of its record.
- **Deleting a record deletes its files,** and deleting a photo deletes its file, unless another record still uses it. Only files inside the uploads folder are ever deleted.
- **Served to signed-in people only** (and to guests for files that are photos or videos of a rig, gear or event), with `Content-Security-Policy: sandbox` and `nosniff`. Other file types are never served.

## Email

RigTracker sends no email. TeeMate's mail guard is in place for later: `MAIL_MODE=off` (the default) sends nothing, `allowlist` only sends to `MAIL_ALLOWLIST`, and `all` needs the owner's consent. No SMTP server is configured.

## Audit log

Recorded actions:

- creating, changing and deleting rigs, gear, people and events;
- sign-ins (by password, password link or authenticator code), failed sign-ins (the reason, never the password) and sign-outs;
- lockouts and unlocks;
- password links made, passwords set and changed;
- authenticator codes turned on, off or reset, and new recovery codes;
- guest sessions (no person);
- sign-in access changes.

Admins see it under **Activity log**. Updates keep the record's values before and after the change. It is append-only: a database trigger refuses any change or removal of an entry.

## Secrets and infrastructure

- **Secrets:** the database connection string (`DATABASE_URL_FILE`) and the authenticator key (`APP_SECRET_FILE`, 32+ random bytes, required in production) are Docker secrets. No secrets are kept in either repository.
- **The database:** PostgreSQL runs with a password on an internal network, with no published ports.
- **The container** runs as the unprivileged `node` user.
- **Backups:** nightly. See [Deployment.md](Deployment.md).

## Still possible to add

- **Passkeys:** Face ID or fingerprint sign-in, with no password to steal or phish.
- **Emailed password links,** once email is approved.
