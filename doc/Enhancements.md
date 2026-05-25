# Enhancements

This page tracks planned enhancements in a consistent, reviewable format.

## Table of Contents

1. [How To Document An Enhancement](#how-to-document-an-enhancement)
2. [EH-001: Authentication and Roles](#eh-001-authentication-and-roles)
3. [EH-002: Audit Trail and Change History](#eh-002-audit-trail-and-change-history)
4. [EH-003: Reporting Dashboard](#eh-003-reporting-dashboard)
5. [EH-004: Bulk Import UX](#eh-004-bulk-import-ux)

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

## EH-001: Authentication and Roles

**Status**: Proposed  
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

**Status**: Proposed  
**Owner**: TBD

### Problem
No first-class audit trail exists for updates/deletes.

### Scope
In:
- Change log entries for packs, rigs, people
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