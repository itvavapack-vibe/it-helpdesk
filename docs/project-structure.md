# Project Structure

This repository serves multiple systems from one Vite application and one Node
API. New code should be placed by ownership instead of adding more files to the
top-level component directory.

## Frontend

| Path | Ownership |
| --- | --- |
| `src/apps/center` | App Center routes and screens |
| `src/apps/secretary` | Secretary Center features, API client, and screens |
| `src/components` | Existing IT Helpdesk feature components during phased migration |
| `src/shared/ui` | Low-level reusable controls such as buttons, selects, and dialogs |
| `src/shared/system-ui` | Shared application shell, tables, headers, theme, and status UI |
| `src/shared/dashboard` | Shared dashboard composition components |
| `src/config` | Routes and frontend configuration |
| `src/utils` | Cross-feature frontend utilities |

Use the `@/` alias for imports that cross feature boundaries. Keep relative
imports for files inside the same feature folder.

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
