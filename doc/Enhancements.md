# Enhancements

This page tracks planned enhancements in a consistent, reviewable format.

## Table of Contents

1. [How To Document An Enhancement](#how-to-document-an-enhancement)
2. [Enhancement Review Snapshot (2026-06-17)](#enhancement-review-snapshot-2026-06-17)
3. [EH-001: Authentication and Roles](#eh-001-authentication-and-roles)
4. [EH-002: Audit Trail and Change History](#eh-002-audit-trail-and-change-history)
5. [EH-003: Reporting Dashboard](#eh-003-reporting-dashboard)
6. [EH-004: Bulk Import UX](#eh-004-bulk-import-ux)
7. [EH-005: Photo Albums and Multi-Source Uploads](#eh-005-photo-albums-and-multi-source-uploads)

## How To Document An Enhancement

Use one section per enhancement with a stable ID (`EH-###`) and these fields:

- **Status**: Proposed | Planned | In Progress | Blocked | Done
- **Owner**: team or individual accountable for delivery
- **Problem**: concise statement of the pain point
- **Scope**: what is included and excluded
- **Proposed Solution**: architecture-level approach
- **Data/Schema Impact**: new fields/collections/indexes
- **API Impact**: route, payload, and compatibility changes
- **UI Impact**: pages, workflows, and states affected
- **Risks**: technical and operational risks
- **Rollout Plan**: migration, feature flags, fallback strategy
- **Acceptance Criteria**: objective, testable completion criteria

Template:

```md
## EH-###: Title
**Status**: Proposed
**Owner**: TBD

### Problem
...

### Scope
In:
- ...
Out:
- ...

### Proposed Solution
...

### Data/Schema Impact
...

### API Impact
...

### UI Impact
...

### Risks
- ...

### Rollout Plan
...

### Acceptance Criteria
- [ ] ...
- [ ] ...
```

## Enhancement Review Snapshot (2026-06-17)

### Status Summary

- EH-001 Authentication and Roles: Proposed
- EH-002 Audit Trail and Change History: Proposed
- EH-003 Reporting Dashboard: Proposed
- EH-004 Bulk Import UX: Proposed
- EH-005 Photo Albums and Multi-Source Uploads: In Progress

### What Can Be Marked Complete Now

- Event-level media album workflow exists (create/edit event, attach multiple media URLs, set primary event media).
- Device uploads are implemented for desktop and mobile-friendly flows (file picker and camera capture).
- Upload storage is organized under resource folders and supports host-mounted persistence.
- Delete-event workflow is implemented with safe default behavior: keep media by default, optional purge when explicitly selected.

### What Is Partially Complete

- EH-005 is partially complete via Events media album support, but not yet a general Albums feature across resources.
- Video upload support exists at API/UI/proxy level, but the enhancement text still focuses on photo-only wording and cloud providers not yet delivered.

### Recommended Next Priority Order

1. EH-001 Authentication and Roles (security foundation for uploads/imports and administrative actions).
2. EH-002 Audit Trail and Change History (track who changed/deleted records and when).
3. EH-005 Phase 1 hardening (quotas, retention policy, orphan-media cleanup tooling, explicit media limits by type).
4. EH-003 Reporting Dashboard (operational visibility once auth/audit are in place).
5. EH-004 Bulk Import UX (operator efficiency after core governance is in place).

## EH-001: Authentication and Roles

**Status**: Done — 2026-06-17  
**Owner**: TBD

### Problem
Current application access is not role-scoped at runtime for critical operations.

### Scope
In:
- Authentication flow
- Role-based access controls for write operations
- Google OAuth 2.0 login for first-party web app users
- User activity tracking (last login, login counts)
Out:
- Non-Google identity providers in first phase

### Proposed Solution
Use Google OAuth 2.0 as the identity provider and establish an app-managed session after callback.

High-level flow:
- User clicks Sign in with Google in web UI.
- API redirects user to Google consent screen.
- Google callback is handled by API, which validates identity and upserts a local user record in MongoDB.
- API issues a secure, httpOnly session cookie.
- Role guards enforce route-level authorization for write operations.

### Data/Schema Impact
Add a users collection in MongoDB with fields similar to:
- provider: google
- googleId: stable provider user ID (indexed, unique)
- email: normalized email address (indexed, unique)
- displayName
- pictureUrl
- roles: array (for example admin, editor, viewer)
- isActive: boolean
- createdAt, updatedAt
- lastLoginAt
- loginCount
- lastLoginIp (optional)
- lastUserAgent (optional)

Add a sessions collection if server-side session persistence is selected:
- sessionId (indexed, unique)
- userId (indexed)
- createdAt, expiresAt, revokedAt
- ip, userAgent (optional)

### API Impact
New endpoints (names illustrative):
- GET /api/auth/google
- GET /api/auth/google/callback
- POST /api/auth/logout
- GET /api/auth/me

Behavioral changes:
- Protected routes require authenticated session and appropriate role.
- Unauthorized requests return 401.
- Authenticated but insufficient-role requests return 403.

### UI Impact
- Add Sign in with Google entry point.
- Add signed-in user menu (profile, logout).
- Add unauthenticated and unauthorized states for protected pages/actions.

### External Setup (Non-Code)
Google Cloud and platform setup required before enabling auth:

1. Create or select a Google Cloud project.
2. Configure OAuth consent screen:
- App name, support email, and authorized domain(s).
- Privacy Policy URL and Terms URL (recommended for production).
- Add required scopes (openid, email, profile).
3. Create OAuth client credentials (Web application type).
4. Add authorized JavaScript origins:
- Production origin (for example https://rigtracker.bhbslp.org).
- Local dev origin(s) as needed.
5. Add authorized redirect URI(s):
- Production callback URI (for example https://rigtracker.bhbslp.org/api/auth/google/callback).
- Local dev callback URI(s) as needed.
6. Configure secrets in deployment environment:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- SESSION_SECRET
- Optional: AUTH_ALLOWED_EMAIL_DOMAIN or explicit allowlist.
7. Ensure HTTPS is enabled end-to-end so secure cookies can be enforced.
8. Confirm reverse proxy forwards protocol headers correctly so callback URL and cookie security behave as expected.
9. Validate DNS and external URL stability before go-live (callback URLs must match exactly).

### Risks
- Misconfigured callback URLs or proxy headers can break login flow.
- Cookie SameSite and domain settings may block session behavior if set incorrectly.
- Role mapping mistakes can over-permit access.

### Rollout Plan
1. Implement auth endpoints and user persistence behind a feature flag.
2. Enable read-only user identification first (me endpoint and UI login state).
3. Gradually enforce auth on write routes.
4. Enable role checks on critical write routes.
5. Roll back by disabling enforcement flag while keeping auth endpoints available.

### Acceptance Criteria
- [ ] Users can authenticate with Google in dev and production environments.
- [ ] User records are created/updated in MongoDB on successful login.
- [ ] lastLoginAt and loginCount are updated on each successful login.
- [ ] Read/write routes enforce role checks.
- [ ] Unauthorized requests return explicit 401/403 responses.

## EH-002: Audit Trail and Change History

**Status**: Done — 2026-06-17  
**Owner**: TBD

### Problem
No first-class audit trail exists for updates/deletes.

### Scope
In:
- Change log entries for gear, rigs, people
- Read endpoint to view history
Out:
- Full event sourcing

### Proposed Solution
Write immutable audit documents for create/update/delete operations.

### Acceptance Criteria
- [ ] All write operations emit audit entries.
- [ ] Audit history is queryable by resource ID.

## EH-003: Reporting Dashboard

**Status**: Proposed  
**Owner**: TBD

### Problem
Operational metrics are not centrally visible.

### Scope
In:
- Summary KPIs on home page
- Filters by date and resource type
Out:
- External BI integration

### Proposed Solution
Add aggregate API endpoints and a dashboard page in web UI.

### Acceptance Criteria
- [ ] Dashboard shows agreed KPI set.
- [ ] Filters update data within acceptable response times.

## EH-004: Bulk Import UX

**Status**: Proposed  
**Owner**: TBD

### Problem
Bulk data onboarding is script-only and not discoverable for operators.

### Scope
In:
- UI workflow for CSV/XLSX upload
- Validation preview before commit
Out:
- Real-time sync from external systems

### Proposed Solution
Add staged import endpoint and UI wizard with row-level validation feedback.

### Acceptance Criteria
- [ ] Users can preview and validate imports before save.
- [ ] Import summary reports successes and failures by row.

## EH-005: Photo Albums and Multi-Source Uploads

**Status**: In Progress  
**Owner**: TBD

### Problem
Operators and users need a simple way to organize rig/event photos into albums and upload photos directly from phones or cloud photo libraries.

### Scope
In:
- Create new photo albums.
- Add photos to existing albums.
- Upload photos directly from mobile devices (camera roll/file picker).
- Import photos from Google Photos.
- Import photos from iCloud Photos.
- Album visibility model (private/team/public) and ownership metadata.
Out:
- AI auto-tagging, face recognition, or duplicate-photo detection in phase 1.

### Proposed Solution
Add an Albums feature across API and web UI with a unified upload/import workflow:
- Album management: create, rename, archive, and list albums.
- Media ingestion:
	- Direct upload from device (desktop/mobile web).
	- Google Photos connector using OAuth-based import flow.
	- iCloud Photos connector using a supported provider integration path or user-export/import fallback when direct API access is constrained.
- Storage abstraction layer so images can be stored in local volume first, with optional object storage support later.
- Async import jobs for cloud providers to handle large libraries and background processing.

### Current Implementation Notes
- Implemented now:
  - Events include media album behavior (`photoUrls` + `eventPhotoUrl`) with primary selection in UI.
  - Upload from device/camera works in mobile and desktop web flows.
  - API upload endpoint currently allows image and video media types with server-side validation.
  - Proxy/body-size settings were increased to support larger media uploads.
- Not implemented yet:
  - First-class generic Albums collection/pages across all resources.
  - Google Photos and iCloud import connectors and async import jobs.
  - Visibility/ownership model for albums (private/team/public).

### Data/Schema Impact
Add MongoDB collections:
- albums:
	- _id, name, description, ownerUserId, visibility, coverPhotoId
	- createdAt, updatedAt, archivedAt
- photos:
	- _id, albumId, uploaderUserId, sourceType (device/google_photos/icloud)
	- storagePath, mimeType, width, height, sizeBytes
	- capturedAt, uploadedAt, checksum
- importJobs:
	- _id, userId, provider (google_photos/icloud), status, progress
	- startedAt, completedAt, errorSummary

Indexes:
- albums.ownerUserId + createdAt
- photos.albumId + uploadedAt
- importJobs.userId + startedAt

### API Impact
New endpoints (illustrative):
- POST /api/albums
- GET /api/albums
- PATCH /api/albums/:id
- POST /api/albums/:id/photos (multipart upload)
- GET /api/albums/:id/photos
- POST /api/import/google-photos/start
- POST /api/import/icloud/start
- GET /api/import/:jobId/status

Behavioral notes:
- Upload and import endpoints require authenticated users.
- File type and max size validation enforced server-side.
- Import jobs expose progress and error details.

### UI Impact
- New Albums page with:
	- Album grid/list view.
	- Create album action.
	- Album details page showing photos.
	- Add to existing album action in uploader/import flow.
- Mobile-friendly upload UX:
	- Camera roll/file picker support.
	- Progress UI for large uploads and provider imports.

### External Setup (Non-Code)
Required integrations and operations setup:

1. Google Cloud project and OAuth credentials for Google Photos import scopes.
2. Apple/iCloud integration setup (or documented fallback upload path where direct API scopes are restricted).
3. Secure secrets management for provider client IDs/secrets.
4. Storage configuration:
- Local filesystem path and retention policy, or
- Object storage bucket and lifecycle policy.
5. Upload size limits and reverse-proxy/body-size settings.
6. Privacy and consent policy updates for user photo data processing.

### Risks
- Provider API limitations or policy restrictions (especially iCloud) may limit direct import behavior.
- Large media uploads can increase storage and bandwidth costs quickly.
- Background import retries and partial failures can complicate user experience.
- Privacy and retention requirements must be explicit for personal photos.

### Rollout Plan
1. Phase 1: Albums + direct device uploads + add-to-existing-album flow.
2. Phase 2: Google Photos import with async jobs and status tracking.
3. Phase 3: iCloud import path (direct if feasible, fallback workflow if not).
4. Phase 4: Hardening (quotas, lifecycle rules, admin reporting).

### Acceptance Criteria
- [ ] Users can create a new album from web and mobile layouts.
- [ ] Users can add photos to an existing album.
- [x] Users can upload photos from phone browsers.
- [ ] Users can initiate and complete Google Photos imports.
- [ ] Users can initiate iCloud Photos ingestion via supported integration path.
- [ ] Users can view import progress and completion/failure states.
