# Architecture

This document describes the high-level architecture of RigTracker.

## Overview

RigTracker is a full-stack web application composed of a React frontend, a NestJS API, and MongoDB storage.

In production, the frontend and API run in a combined container:

- nginx serves static web assets
- nginx proxies `/api/*` requests to the Node API process
- Node API handles business logic and MongoDB access

## Logical Components

1. Web App (`web/`)
- React 19, Vite 8, TypeScript, Tailwind CSS 4 and shadcn/ui on Radix, the same stack and components as TeeMate
- TanStack Query for data, react-router 8, lucide icons; vitest + Testing Library tests
- Mobile first: bottom tab bar on phones (Home, Rigs, Gear, Events, People), top links on desktop; admin pages (Users and sign-in, Activity log) in the account menu
- Light and dark themes
- Same-origin API calls (`/api/...`), with the session's CSRF token in `x-csrf-token` on every change

2. API (`api/`)
- NestJS + Mongoose
- Resource groups: gear, rigs, people
- Routes are globally prefixed with `/api`

3. Database
- MongoDB (single runtime database path)

4. Edge/Ingress
- Cloudflare Tunnel forwards `*.bhbslp.org` traffic to Traefik
- Traefik routes by hostname to service backends

## Deployment Topology

- Docker Swarm orchestrates services
- RigTracker stack includes:
  - `rigtracker` (combined app container)
  - `mongo`
  - `mongo-express`
- Services are attached to external overlay network `traefik-public`

## Request Flow

1. Client requests `https://rigtracker.bhbslp.org`
2. Cloudflare Tunnel receives request
3. Traefik matches hostname router for RigTracker
4. Traefik forwards to rigtracker service on port `80`
5. nginx serves SPA assets
6. SPA calls `/api/...`
7. nginx proxies `/api` to Node API on `127.0.0.1:4000`
8. API queries MongoDB and returns JSON response

## Data Boundaries

- MongoDB is the system of record
- API enforces validation/normalization rules
- Frontend performs additional user-input validation for UX

## Operational Notes

- RigTracker runtime is Mongo-only
- Prisma/PostgreSQL runtime path is not part of current architecture