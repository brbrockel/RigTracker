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

The stack also references `rigtracker_mongo_uri`, which is used only by the one-off import from the old Mongo database (see below). On a new server with no Mongo, create it with any placeholder value, or remove it from the stack.

The uploads folder must be writable by the container's `node` user (uid 1000):

```bash
docker run --rm -v /srv/homelab-data/rigtracker/uploads:/u alpine chown -R 1000:1000 /u
```

The container applies database migrations when it starts. The first admin:

```bash
docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com --admin "Your Name"
```

## Backups

The `backup` service runs nightly at 07:00 UTC (about 3 AM Eastern):

- a compressed `pg_dump`, checked with `pg_restore --list` and kept for 30 days;
- one current tarball of the uploads.

Both go to the `rigtracker_backups` volume. Copy that volume off this machine periodically. The last Mongo archives from before the cutover (`rigtracker-*.archive.gz`) are kept there too.

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

Mongo stays in the stack, untouched, for 30 days as the rollback: deploy the previous version (`RIGTRACKER_TAG=2.0.0-alpha.2`) and point it back at Mongo.

## Logs and status

```bash
docker stack services rigtracker
docker service ps rigtracker_rigtracker
docker service logs --tail 200 rigtracker_rigtracker
docker service logs --tail 20 rigtracker_backup
```
