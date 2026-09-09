# Shared UI Migration Plan

## Goal

Move App Center, IT Helpdesk, Secretary Center, and future HR modules to one
TailAdmin-inspired application template without replacing business logic in a
single risky release.

## Architecture

- Shared shell and visual primitives: `src/shared/system-ui`
- IT Helpdesk domains: `src/apps/it-helpdesk`
- Secretary domain: `src/apps/secretary`
- Design rules: `design.md`
- Tokens: `tokens.css`
- UAT preview route: `/it-helpdesk/admin/tailadmin-preview`
- Legacy pages remain available until each migrated page passes acceptance

## Shared Components

| Component | Responsibility |
| --- | --- |
| `SystemAppShell` | Sidebar, header, search, notifications, profile, theme, mobile drawer |
| `SystemPageHeader` | Breadcrumb, compact title, metadata, page actions |
| `SystemPanel` | Standard functional content surface |
| `SystemStatCard` | Operational KPI summary |
| `SystemDataTable` | Table structure, loading and empty state |
| `SystemStatusBadge` | Semantic status display |
| `SystemDetailDrawer` | Read/detail workflow without leaving a list |

## Migration Order

1. IT Helpdesk dashboard and issue list
2. Computer inventory, computer asset status, and PM
3. User access requests and system development requests
4. Approved documents and server room
5. Employees, admin users, and IT chat
6. Secretary reporter pages
7. Secretary receiver, dashboard, overview, reports, and user management
8. App Center and HR foundation

## Per-page Process

1. Inventory current roles, actions, API calls, print/PDF, signatures, uploads, and edge cases.
2. Compose the new page from shared components.
3. Keep domain behavior in the existing feature module or extracted hooks.
4. Add a UAT route and retain a link to the legacy page.
5. Test desktop and mobile layouts.
6. Test role visibility and all create/update/delete/approval paths.
7. Obtain UAT sign-off, then switch the default route.
8. Keep the previous release tag as the production rollback point.

## Acceptance Gates

- Production data is never used for destructive redesign testing.
- Build and relevant integration tests pass.
- No horizontal overflow at 320, 375, 414, and 768px.
- Search, filters, pagination, drawers, menus, and keyboard focus work.
- Permissions and the first-assignee rule are unchanged.
- Signature, print/PDF, upload, and three-day auto-close workflows are unchanged.
- A page is not enabled by default until its legacy feature parity is confirmed.
