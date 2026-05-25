# Internal UI Library

Reusable UI components that keep the original visual pattern of this project:

- glass panels/cards
- `input-modern`
- indigo/violet gradient actions
- rounded-xl / rounded-2xl controls
- Tailwind-only implementation where possible

This is intentionally not shadcn/ui. It is a copy-friendly internal library for future systems.

## Import

```jsx
import { Button, Card, Input, Label, Dialog } from '@/components/ui';
```

or import one component:

```jsx
import { Button } from '@/components/ui/button';
```

## Copy To Another Project

Copy these files:

- `src/components/ui`
- `src/lib/utils.js`

Also copy the CSS utilities from `src/index.css`:

- `.glass-panel`
- `.glass-card`
- `.input-modern`

## Available Components

- `Badge`
- `Button`
- `Card`
- `Dialog`
- `Input`
- `Label`
- `Select`
- `Table`
- `Textarea`
