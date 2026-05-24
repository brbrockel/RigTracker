# RigTracker

RigTracker is a monorepo application for managing skydiving rigs, packs, and people.

It provides a web UI and API for equipment records, assignment tracking, and operational data quality workflows.

## Executive Summary

- Purpose: centralize rig and people tracking for operational visibility.
- Runtime: MongoDB-backed API and React frontend.
- Deployment: combined container (nginx + API) deployed to Docker Swarm behind Traefik/Cloudflare.
- Status: production path is Mongo-only; Prisma/PostgreSQL runtime path has been removed.

## Documentation Index

- Development guide: [doc/Development.md](doc/Development.md)
- High-level architecture: [doc/Architecture.md](doc/Architecture.md)
- Roadmap and enhancement specs: [doc/Enhancements.md](doc/Enhancements.md)
- API-specific notes: [api/README.md](api/README.md)

## Repository Layout

- `api/` - NestJS + Mongoose API
- `web/` - React + Vite frontend
- `packages/shared/` - shared package(s)
- `docker/` - runtime nginx and container entrypoint

## Audience

- Operators running the homelab deployment
- Developers extending API/UI behavior
- Stakeholders tracking roadmap enhancements
