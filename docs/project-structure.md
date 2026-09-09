# Project Structure

This repository serves multiple systems from one Vite application and one Node
API. New code should be placed by ownership instead of adding more files to the
top-level component directory.

## Frontend

| Path | Ownership |
| --- | --- |
| `src/apps/center` | App Center routes and screens |
| `src/apps/it-helpdesk` | IT Helpdesk application shell and feature domains |
| `src/apps/it-helpdesk/access` | User access requests and access approvals |
| `src/apps/it-helpdesk/admin` | Employees, admin users, and security settings |
| `src/apps/it-helpdesk/approvals` | Shared approval inbox and approval reports |
| `src/apps/it-helpdesk/assets` | GLPI inventory, PM, asset status, and asset-code import |
| `src/apps/it-helpdesk/chat` | Requester and IT chat experiences |
| `src/apps/it-helpdesk/changes` | System change requests and acceptance workflows |
| `src/apps/it-helpdesk/issues` | Helpdesk tickets, tracking, signatures, and issue reports |
| `src/apps/it-helpdesk/preview` | UAT-only redesigned Helpdesk page previews |
| `src/apps/it-helpdesk/server-room` | Server-room access management |
| `src/apps/secretary` | Secretary Center features, API client, and screens |
| `src/shared/ui` | Low-level reusable controls such as buttons, selects, and dialogs |
| `src/shared/system-ui` | Shared application shell, tables, headers, theme, and status UI |
| `src/shared/dashboard` | Shared dashboard composition components |
| `src/config` | Routes and frontend configuration |
| `src/utils` | Cross-feature frontend utilities |

Use the `@/` alias for frontend imports that cross feature boundaries and
`@common/` for root shared modules. Keep relative imports for files inside the
same feature folder.

## Backend And Operations

| Path | Ownership |
| --- | --- |
| `server.js` | API composition and server startup |
| `lib` | Backend services and integration modules |
| `scripts` | Migrations, maintenance, and verification scripts |
| `shared` | Code intentionally shared by browser and Node runtimes |

The root `shared` directory is separate from `src/shared`: root modules may be
loaded by both runtimes, while `src/shared` contains frontend-only components.

## Migration Rules

1. Move one domain at a time and keep behavior unchanged.
2. Run the production build and relevant integration tests after each move.
3. Do not combine folder moves with database or business-rule changes.
4. Keep a checkpoint commit before each structural phase for rollback.
