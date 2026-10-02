# VAVA PACK Application Design System

## Direction

- Genre: modern minimal operational dashboard inspired by TailAdmin's information hierarchy.
- Macrostructure: fixed collapsible sidebar, utility top bar, dense content canvas, responsive mobile drawer/header.
- Product tone: calm, precise, work-focused, and consistent across App Center, IT Helpdesk, and Secretary Center.

## Visual Rules

- Use cool neutral canvases with white surfaces and the selected application theme as the primary accent.
- Use semantic red, amber, emerald, and sky only for status and data meaning.
- Use 8px surface radii, restrained borders, and subtle shadows. Avoid glass blur, decorative glows, and ornamental gradients.
- Keep page headings compact. Use strong hierarchy through weight and spacing rather than oversized type.
- Tables and forms should prioritize scanning and repeated action. Controls use a stable 40-44px height.
- Icons come from Lucide and remain visually consistent at 16-20px in controls.

## Layout

- Expanded sidebar: 288px. Collapsed sidebar: 80px.
- Desktop top bar: 72px.
- Content max width: 1600px with responsive 16-32px gutters.
- Cards are individual functional units; page sections remain unframed.

## Accessibility

- Maintain visible focus rings and WCAG-friendly text contrast.
- Preserve 40px minimum touch targets on coarse pointers.
- Disable nonessential motion when reduced motion is requested.
- Keep dark mode and all existing color theme choices operational.

## Shared Component Contract

- All system modules use components exported from `src/components/system-ui`.
- `SystemAppShell` owns sidebar, top bar, global search, theme toggle, notifications, profile, mobile drawer, and App Center navigation.
- Pages use `SystemPageHeader`, `SystemPanel`, `SystemStatCard`, `SystemDataTable`, `SystemStatusBadge`, and `SystemDetailDrawer` before adding page-specific UI.
- Business logic, permissions, API calls, signatures, printing, and approval workflows remain in feature modules. Shared UI components must not contain domain rules.
- A migrated page keeps a route back to its legacy implementation until its workflow and responsive checks pass.

## App Center Homepage

- Uses a scalable Portal Directory grid where every department system has equal visual priority.
- The grid renders only available systems and grows naturally as departments are added.
- Frequently used IT tasks appear as direct actions below the directory.
- The homepage uses square corners, strong typography, restrained borders, and no ornamental gradients.
- The App Center uses a TailAdmin dashboard shell with persistent navigation, operational summary cards, equal system cards, and a compact quick-action panel.
