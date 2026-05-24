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
Out:
- External SSO federation in first phase

### Proposed Solution
Introduce application auth middleware and role guards on API endpoints.

### Acceptance Criteria
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