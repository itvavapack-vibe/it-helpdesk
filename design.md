# Design — VAVA PACK Internal Systems

A locked design system for the multi-application workspace. Every redesigned page reads this file before emitting code.

## Direction

- Genre: modern-minimal enterprise dashboard inspired by TailAdmin's information hierarchy.
- Macrostructure: fixed collapsible sidebar, utility top bar, dense content canvas, responsive mobile drawer/header.
- Product tone: calm, precise, work-focused, and consistent across App Center, IT Helpdesk, and Secretary Center.

## Visual Rules

- Use cool neutral canvases with white surfaces and the selected application theme as the primary accent.
- Use semantic red, amber, emerald, and sky only for status and data meaning.
- Use 8px surface radii, restrained borders, and subtle shadows. Avoid glass blur, decorative glows, and ornamental gradients.
- Keep page headings compact. Use strong hierarchy through weight and spacing rather than oversized type.
- Tables and forms should prioritize scanning and repeated action. Controls use a stable 40-44px height.
- Icons come from Lucide and remain visually consistent at 16-20px in controls.

## Theme

- Paper and surfaces use cool neutral OKLCH tokens from `tokens.css`.
- Indigo is the shared action accent and stays below 5% of a typical viewport.
- Red, amber, emerald, and sky communicate domain status only.
- Every color, font, spacing, duration, rule, and radius used by shared UI must reference a named token.

## Typography

- Display: Noto Sans Thai / Leelawadee UI, weight 700, normal style.
- Body: Noto Sans Thai / Leelawadee UI, weights 400–600.
- Mono: Cascadia Code / Consolas for identifiers and technical values.
- Headings remain compact; no italic display type.

## Layout

- Expanded sidebar: 288px. Collapsed sidebar: 80px.
- Desktop top bar: 72px.
- Content max width: 1600px with responsive 16-32px gutters.
- Cards are individual functional units; page sections remain unframed.

## Motion and feedback

- Use `--ease-out` with `--dur-short` or `--dur-base`; animate opacity and transform only.
- Respect `prefers-reduced-motion` with near-instant state changes.
- Prefer inline confirmation and refreshed data over celebratory alerts.
- Tooltips open immediately on keyboard focus and after a deliberate hover delay.

## Accessibility

- Maintain visible focus rings and WCAG-friendly text contrast.
- Preserve 40px minimum touch targets on coarse pointers.
- Disable nonessential motion when reduced motion is requested.
- Keep dark mode and all existing color theme choices operational.

## Shared Component Contract

- All system modules use components exported from `src/shared/system-ui`.
- `SystemAppShell` owns sidebar, top bar, global search, theme toggle, notifications, profile, mobile drawer, and App Center navigation.
- Pages use `SystemPageHeader`, `SystemPanel`, `SystemStatCard`, `SystemDataTable`, `SystemStatusBadge`, and `SystemDetailDrawer` before adding page-specific UI.
- Business logic, permissions, API calls, signatures, printing, and approval workflows remain in feature modules. Shared UI components must not contain domain rules.
- A migrated page keeps a route back to its legacy implementation until its workflow and responsive checks pass.

## Per-page allowances

- App Center may use a directory layout, but shares typography, controls, and theme tokens.
- Operational pages use the Workbench Dashboard family: compact heading, toolbar, metrics, working surface, and optional detail drawer.
- Public request pages may omit the sidebar and use a focused form layout.
- PDF and print previews preserve document dimensions and are exempt from app-shell spacing.

## Exports

The canonical CSS export is `tokens.css`. Tailwind utilities, shared CSS, and future component libraries must map back to those tokens rather than declaring page-specific palettes.
