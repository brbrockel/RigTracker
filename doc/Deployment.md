# Deployment

RigTracker runs on the homelab Docker Swarm as the `rigtracker` stack (`homelab-docker-linux/rigtracker/rigtracker-stack.yml`) at https://rigtracker.bhbslp.org. It reaches the internet through the Cloudflare tunnel and Traefik.

## Versions

Releases follow semver. The version lives in the root `package.json`, which `api` and `web` match, and in `CHANGELOG.md`.

- `1.0.0`: the Google sign-in app, before the October 2026 review (git tag `v1.0.0`).
- `2.0.0-alpha.N`, then `-beta.N` and `-rc.N`: the 2.0.0 work in progress. Each deploy gets the next number.
- `2.0.0`: when [Plan.md](Plan.md) steps 3–6 are done and [TestPlan.md](TestPlan.md) passes.

Each image is tagged `ghcr.io/brbrockel/rigtracker:<version>` (and `latest`). The running build shows at `/api/health` and at the bottom of **Account**, e.g. `2.0.0-alpha.2+abc1234`.

## Deploy a new version

1. **Bump the version** in `package.json`, `api/package.json` and `web/package.json` (e.g. `2.0.0-alpha.3`). Add a `CHANGELOG.md` entry.
2. **Commit.** A deploy refuses uncommitted changes, so the version always matches a commit.
3. **Run `./build.sh --deploy`.** It builds the image with `APP_VERSION=<version>+<commit>` and pushes it (it refuses a version that's already published). Then it runs `RIGTRACKER_TAG=<version> docker stack deploy`. A new tag rolls the service, with no forced restarts.
4. **Check it.** `curl -s https://rigtracker.bhbslp.org/api/health` should report the new version.

The container has a healthcheck (`/api/health`, which also pings the database). If the new task doesn't become healthy, Swarm rolls back to the previous version by itself.

## Roll back

```bash
cd ~/repos/homelab-docker-linux
RIGTRACKER_TAG=<previous version> docker stack deploy -c rigtracker/rigtracker-stack.yml rigtracker
```

or roll back to the last spec with `docker service rollback rigtracker_rigtracker`. Database changes aren't undone by a rollback: the container applies new schema migrations (`api/drizzle`) when it starts, so take a backup before deploying one. One-off data scripts are run by hand, with a backup taken first.

## One-time setup (a new server)

The Postgres password and connection string, as Docker secrets:

```bash
PW=$(openssl rand -hex 24)
printf '%s' "$PW" | docker secret create rigtracker_db_password -
printf 'postgres://rigtracker:%s@postgres:5432/rigtracker' "$PW" | docker secret create rigtracker_database_url -
unset PW
```

The key that encrypts authenticator-app secrets (2.0.0-beta.1 and later; the API refuses to start in production without it):

```bash
openssl rand -hex 32 | tr -d '\n' | docker secret create rigtracker_app_secret -
```

The stack gives it to the `rigtracker` service as `APP_SECRET_FILE=/run/secrets/rigtracker_app_secret`. Keep it: if it's lost or changed, everyone's authenticator codes stop working and an admin has to **Reset authenticator** for each person who had them. It isn't in the database backups, so store a copy with the other secrets (for example in the password manager).

**Report a problem** (2.0.0-rc.2 and later) files GitHub issues with TeeMate's token, the existing `teemate_github_token` secret, given to the service as `GITHUB_TOKEN_FILE`. The token must include `brbrockel/RigTracker` with Issues: read and write (GitHub → Settings → Developer settings → Fine-grained tokens). On a server without TeeMate, create a `teemate_github_token` secret with such a token, or remove it from the stack: reports are then kept in the app only.

The uploads folder must be writable by the container's `node` user (uid 1000):

```bash
docker run --rm -v /srv/homelab-data/rigtracker/uploads:/u alpine chown -R 1000:1000 /u
```

The container applies database migrations when it starts. The first admin gets a password link (open it, set a password, and you're signed in):

```bash
docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com --admin "Your Name"
```

Email stays off (`MAIL_MODE=off`, the default); the stack sets no `MAIL_*` or `SMTP_*` settings.

## Backups

The `backup` service runs nightly at 07:00 UTC (about 3 AM Eastern):

- a compressed `pg_dump`, checked with `pg_restore --list` and kept for 30 days;
- one current tarball of the uploads.

Both go to the `rigtracker_backups` volume. Copy that volume off this machine periodically. The Mongo archives are kept there too: the ones from before the cutover (`rigtracker-*.archive.gz`) and the final one taken when Mongo was retired (`rigtracker-mongo-final-2026-10-18.archive.gz`).

Take one now, for example before a deploy with a schema migration:

```bash
docker exec $(docker ps -qf name=rigtracker_backup) sh -c \
  'PGPASSWORD="$(cat /run/secrets/rigtracker_db_password)" pg_dump -Fc -f /backups/rigtracker-manual-$(date -u +%Y%m%dT%H%M).dump'
```

Restore drill (a throwaway Postgres; never restore over production without a fresh backup first):

```bash
docker run -d --rm --name rt-restore -e POSTGRES_PASSWORD=x -p 127.0.0.1:15499:5432 postgres:18-alpine
docker run --rm --network host -v rigtracker_backups:/b:ro -e PGPASSWORD=x postgres:18-alpine \
  pg_restore -h 127.0.0.1 -p 15499 -U postgres --create -d postgres /b/rigtracker-YYYY-MM-DD.dump
docker exec rt-restore psql -U postgres rigtracker -c \
  "select 'people', count(*) from people union all select 'rigs', count(*) from rigs union all select 'gear', count(*) from gear"
docker rm -f rt-restore
```

## Moving from Mongo (2.0.0-alpha.3 cutover)

The import script (`dist/scripts/import-mongo.js`) and the later one-off moves (`rig-components.js`, the photo move) were removed in 2.0.0-alpha.6, after production was moved. To run them again, use the `2.0.0-alpha.5` image, which still has them.

Done once, on 2026-10-18. Kept here as the record and for a re-run if a rollback is ever needed.

1. Take a final Mongo backup into the backups volume (`mongodump --gzip --archive=…`).
2. Stop the old app: `docker service scale rigtracker_rigtracker=0`.
3. Run a one-off service on the internal network, with both secrets, that applies the migrations and then imports:
   - `node dist/db/migrate.js`
   - `node dist/scripts/import-mongo.js`, a dry run that prints the counts
   - `node dist/scripts/import-mongo.js --apply`, one transaction, which ends with a Mongo-vs-Postgres verification table and exits non-zero on any mismatch
4. Deploy the new version (`./build.sh --deploy`).
5. Take a Postgres backup straight away (see Backups). The backup job's first run happens when the stack deploys Postgres, before the import, so it backs up an empty database.

On 2026-10-18 the app was stopped from 01:27 to 01:32 UTC. The import verified 10 people, 9 rigs, 112 gear, 2 events, 2 live sessions, 1 unused link and 146 audit entries, and cleared 6 placeholder dates.

Mongo was kept in the stack as the rollback, then retired early on 2026-10-18 (with the owner's OK): a final `mongodump` (10 people, 9 rigs, 112 gear, 2 events, 146 audit entries, 3 `users_merged`; checked with `mongorestore --dryRun`) went to the backups volume, and the `mongo` service and the `rigtracker_mongo_uri` secret were removed. Its data folder, `/srv/homelab-data/rigtracker/mongo-data`, is left on disk. Going back to 1.x now means restoring that archive into a new Mongo.

## Rig components into gear (2.0.0-alpha.4)

Done once, after deploying 2.0.0-alpha.4 (its migration adds `gear.slot`). Until the script has run, rigs show empty components; the old rig columns are untouched, so rolling back to 2.0.0-alpha.3 still works.

1. Take a Postgres backup (see Backups).
2. Deploy: `./build.sh --deploy`.
3. A dry run, as a one-off service on the internal network. It prints a plan per rig (match, new, conflict), then the conflicts, date differences, type changes and a summary:

   ```bash
   run_components() {
     docker service create --name rigtracker-components --restart-condition none --detach \
       --network rigtracker_rigtracker-internal \
       --secret rigtracker_database_url -e DATABASE_URL_FILE=/run/secrets/rigtracker_database_url \
       ghcr.io/brbrockel/rigtracker:2.0.0-alpha.4 node dist/scripts/rig-components.js "$@"
     until docker service ps rigtracker-components --format '{{.CurrentState}}' | grep -qE 'Complete|Failed|Rejected'; do sleep 2; done
     docker service ps rigtracker-components --format '{{.CurrentState}} {{.Error}}'
     docker service logs --raw rigtracker-components; docker service rm rigtracker-components
   }
   run_components            # dry run
   run_components --apply    # one transaction; exits non-zero (nothing written) on an error
   run_components            # check: every slot "already", 0 matched, 0 created
   ```

   (`docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/rig-components.js [--apply]` does the same from the running container.)
4. Check a few rigs on their pages, and look at any "Unplaced …" custom fields the conflicts left (for example rig #12's container shares serial 12376 with rig #11's).

## Photos and videos into media (2.0.0-alpha.5)

Nothing to run by hand: migration 0003 adds the `media` table and 0004 copies the photo columns into it (`rigs.image_url` and `gear.image_url` as each record's cover; an event's `event_photo_url` first, then its other `photo_urls` in order, each once). They run when the container starts. Blank values are skipped, and only `/uploads/...` paths and `https` links are kept, as the API allowed. If 2.0.0-alpha.4 isn't deployed yet, deploy this instead and do its rig components step afterwards (above, with this image's tag).

1. Take a Postgres backup (see Backups).
2. Deploy: `./build.sh --deploy`.
3. Check that a rig, a gear item and an event with photos still show them, and that the counts look right:

   ```bash
   docker exec $(docker ps -qf name=rigtracker_backup) sh -c \
     'PGPASSWORD="$(cat /run/secrets/rigtracker_db_password)" psql -c "select owner_type, kind, count(*) from media group by 1, 2 order by 1, 2"'
   ```

The old columns stay (a later release drops them), so rolling back to 2.0.0-alpha.4 still works. That version doesn't know about media, though: it shows the photos as they were at the upgrade, doesn't show photos added since, and shows a broken image for a migrated photo deleted since. Records changed by the old container during the rolling deploy keep their media from the copy.

New uploads go in `uploads/<rig|gear|event>/<record id>/`. The 1.x folders (`rigs/`, `gear/`, `events/`) stay where they are; their files are deleted when their media rows are.

## Passwords and the guest view (2.0.0-beta.1)

Before deploying:

1. **Create the secret** `rigtracker_app_secret` (above), and in the stack give the `rigtracker` service the secret and `APP_SECRET_FILE=/run/secrets/rigtracker_app_secret`.
2. **Take a backup.** Migration 0006 adds the password, lockout and authenticator columns to `people`, guest sessions, the purpose of sign-in tokens, the `auth_attempts` table (per-IP limits) and an index on `media.url`. It only adds; rolling back to 2.0.0-alpha.6 still works (that version ignores the new columns and treats a guest session as signed out), but it signs people in with links only and never asks for authenticator codes, so keep a rollback short.

After deploying:

- **Everyone keeps their session** (up to 30 days from their last sign-in) and can set a password on **Account → Security** without a current one.
- **Links already sent still work:** an unused sign-in link now opens the "Set your password" form, and saving signs in.
- **Everyone else needs a password link:** on **People → ⋯ → Get password link** (or the script above), then text it to them. Nobody can sign in with an email and password until they've set one.

## Logs and status

```bash
docker stack services rigtracker
docker service ps rigtracker_rigtracker
docker service logs --tail 200 rigtracker_rigtracker
docker service logs --tail 20 rigtracker_backup
```
