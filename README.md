# RigTracker

RigTracker is a monorepo application for managing skydiving rigs, gear, events, and people.

It provides a web UI and API for equipment records, assignment tracking, and operational data quality workflows.

## Executive Summary

- Purpose: centralize rig and people tracking for operational visibility.
- Runtime: NestJS API on PostgreSQL, and a React web app (installable as a PWA).
- Deployment: one container (Node serving the API and the web app) on Docker Swarm behind Traefik/Cloudflare.
- Status: 2.0.0 in progress (see [CHANGELOG.md](CHANGELOG.md) and [doc/Plan.md](doc/Plan.md)).

## Documentation Index

- Development guide: [doc/Development.md](doc/Development.md)
- Deployment, versions, backups: [doc/Deployment.md](doc/Deployment.md)
- Sign-in and security: [doc/Security.md](doc/Security.md)
- Changes by version: [CHANGELOG.md](CHANGELOG.md)
- High-level architecture: [doc/Architecture.md](doc/Architecture.md)
- Hands-on test checklist: [doc/TestPlan.md](doc/TestPlan.md)
- 1.x enhancement specs (superseded by the plan): [doc/Enhancements.md](doc/Enhancements.md)
- API-specific notes: [api/README.md](api/README.md)
- v2 rebuild plan and migration path: [doc/Plan.md](doc/Plan.md)
- Independent review and modernization roadmap (Oct 2026): [doc/Review-2026-10.md](doc/Review-2026-10.md)

## Repository Layout

- `api/` - NestJS + Drizzle API (PostgreSQL)
- `web/` - React + Vite frontend

## Audience

- Operators running the homelab deployment
- Developers extending API/UI behavior
- Stakeholders tracking roadmap enhancements

## License

[MIT](LICENSE).
