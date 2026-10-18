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

or roll back to the last spec with `docker service rollback rigtracker_rigtracker`. Database changes aren't undone by a rollback. Data migrations are separate scripts, run by hand, with a backup taken first.

## One-time setup (a new server)

The Mongo user, created while Mongo still runs without `--auth`; its connection string becomes a Docker secret:

```bash
PW=$(openssl rand -hex 24)
docker exec $(docker ps -qf name=rigtracker_mongo) mongosh --quiet admin --eval \
  "db.createUser({user:'rigtracker',pwd:'$PW',roles:[{role:'readWrite',db:'rigtracker'}]})"
printf 'mongodb://rigtracker:%s@mongo:27017/rigtracker?authSource=admin' "$PW" | docker secret create rigtracker_mongo_uri -
unset PW
```

The uploads folder must be writable by the container's `node` user (uid 1000):

```bash
docker run --rm -v /srv/homelab-data/rigtracker/uploads:/u alpine chown -R 1000:1000 /u
```

The first admin:

```bash
docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com --admin "Your Name"
```

## Backups

The `backup` service runs nightly at 07:00 UTC (about 3 AM Eastern):

- a gzipped `mongodump`, checked with a dry-run restore and kept for 30 days;
- one current tarball of the uploads.

Both go to the `rigtracker_backups` volume. Copy that volume off this machine periodically.

Take one now, for example before a migration:

```bash
docker exec $(docker ps -qf name=rigtracker_backup) sh -c \
  'mongodump --quiet --uri="$(cat /run/secrets/rigtracker_mongo_uri)" --gzip --archive=/backups/rigtracker-manual-$(date -u +%Y%m%dT%H%M).archive.gz'
```

Restore drill (a throwaway Mongo; never restore over production without a fresh backup first):

```bash
docker run -d --rm --name rt-restore -p 127.0.0.1:27999:27017 mongo:6.0
docker run --rm --network host -v rigtracker_backups:/b:ro mongo:6.0 \
  mongorestore --uri=mongodb://127.0.0.1:27999 --gzip --archive=/b/rigtracker-YYYY-MM-DD.archive.gz
docker exec rt-restore mongosh --quiet rigtracker --eval 'db.getCollectionNames().forEach(c => print(c, db[c].countDocuments()))'
docker rm -f rt-restore
```

## Logs and status

```bash
docker stack services rigtracker
docker service ps rigtracker_rigtracker
docker service logs --tail 200 rigtracker_rigtracker
docker service logs --tail 20 rigtracker_backup
```
