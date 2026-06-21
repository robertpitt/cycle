# @cycle/ui

Cycle UI is the shared React design system for Cycle product surfaces. It contains low-level
controls, composed data-display components, and workspace layouts used by the desktop renderer and
Storybook.

The package is source-first inside this monorepo: exports point at `src/**/*.ts(x)` files and are
consumed through `@cycle/ui` for the full public surface or family paths such as `@cycle/ui/atoms`.

## Contents

- [Package Role](#package-role)
- [Install And Setup](#install-and-setup)
- [Common Imports](#common-imports)
- [Package Structure](#package-structure)
- [Styling And Theme](#styling-and-theme)
- [Component Families](#component-families)
- [Storybook](#storybook)
- [Development Workflow](#development-workflow)
- [Component API Rules](#component-api-rules)
- [Accessibility Rules](#accessibility-rules)
- [Export Rules](#export-rules)
- [Compatibility Notes](#compatibility-notes)

## Package Role

Use `@cycle/ui` for UI that should remain consistent across Cycle applications:

- reusable controls such as buttons, inputs, selects, switches, badges, and avatars
- form composition through `Field`
- issue and workspace rows, lists, toolbars, sidebars, and shells
- workspace onboarding and app-shell regions used by product screens
- theme tokens, shared contracts, and utility helpers

Do not place app runtime logic, persistence, Electron APIs, network calls, or package-specific state
management in this package. Components may accept callbacks and render props, but data fetching and
side effects belong in application packages such as `@cycle/desktop`.

## Install And Setup

From the repository root:

```sh
pnpm install
pnpm --filter @cycle/ui storybook
```

The root aliases are also available:

```sh
pnpm storybook
pnpm storybook:build
pnpm typecheck
pnpm lint
pnpm format:check
```

Consumers must provide React and React DOM. The package declares peer dependencies for:

- `react` `^19.0.0`
- `react-dom` `^19.0.0`
- `tailwindcss` `^4.0.0`

## Common Imports

Import the global stylesheet once at the application boundary:

```tsx
import "@cycle/ui/styles.css";
```

Wrap app content in the theme provider:

```tsx
import { ThemeProvider } from "@cycle/ui/theme";

export const App = () => (
  <ThemeProvider className="min-h-screen" mode="system">
    {/* routes */}
  </ThemeProvider>
);
```

Use `@cycle/ui` as the single broad import point when a consumer wants the full public surface:

```tsx
import { Button, Input, Select, cn } from "@cycle/ui";
```

Use the narrowest family import path when a consumer wants a smaller import surface:

```tsx
import { Button, Input, Select } from "@cycle/ui/atoms";
import { cn } from "@cycle/ui/utils";
```

Component-specific paths are available when a consumer wants a smaller import surface:

```tsx
import { Button } from "@cycle/ui/atoms/button";
import { Field, FieldInput, FieldLabel } from "@cycle/ui/molecules/field";
import { WorkspaceShell } from "@cycle/ui/organisms/workspace-shell";
```

## Package Structure

```txt
src/
  atoms/        Low-level styled controls and primitives.
  molecules/    Composed controls and compact data surfaces.
  organisms/    Product-level regions such as lists, toolbars, and shells.
  theme/        ThemeProvider and theme mode contracts.
  lib/          Shared class, style, and API-contract helpers.
  stories/      Cross-component Storybook examples.
  styles.css    Tailwind v4 entrypoint and Cycle design tokens.
```

The public export map in `package.json` exposes these groups:

- `@cycle/ui`
- `@cycle/ui/atoms` and `@cycle/ui/atoms/*`
- `@cycle/ui/molecules` and `@cycle/ui/molecules/*`
- `@cycle/ui/organisms` and `@cycle/ui/organisms/*`
- `@cycle/ui/theme`
- `@cycle/ui/utils`
- `@cycle/ui/styles.css`

## Styling And Theme

Cycle UI uses Tailwind CSS v4 with package-local tokens in `src/styles.css`.

The stylesheet defines:

- Tailwind source scanning for package files and Storybook files
- the `dark` custom variant
- semantic color tokens such as `background`, `surface`, `primary`, `accent`, `success`,
  `warning`, and `destructive`
- shared radius, shadow, focus, border, and overlay tokens
- light, dark, and system theme values

`ThemeProvider` renders a `div.cycle-theme` and sets `data-theme` to `light`, `dark`, or `system`.
Use it near the root of the consuming app so token values and dark-mode selectors apply to every
component.

```tsx
<ThemeProvider mode="dark">
  <WorkspaceShell />
</ThemeProvider>
```

Shared component contracts live in `src/lib/contracts.ts`:

```ts
type ComponentTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";
type ComponentDensity = "compact" | "comfortable";
type ComponentSize = "sm" | "md" | "lg";
```

Use `cn` from `@cycle/ui/utils` for class merging. It combines `clsx` and `tailwind-merge`.

## Component Families

Atoms:

- `Avatar`
- `Badge`
- `BrandMark`
- `Button`
- `Checkbox`
- `ChipTrigger`
- `DateTime`
- `IconButton`
- `Input`
- `Kbd`
- `Label`
- `Layout`
- `Select`
- `Separator`
- `Skeleton`
- `Spinner`
- `StatusIndicator`
- `Switch`
- `Textarea`
- `Text`

Molecules:

- `Alert`
- `Card`
- `ChipSelect`
- `CommandField`
- `Dialog`
- `Field`
- `IssueGroupHeader`
- `IssueListRow`
- `IssueMetaChip`
- `MarkdownRenderer`
- `NavigationItem`
- `OtpCodeField`
- `PropertyPicker`
- `SettingRow`
- `ShellSidebarSection`
- `SortableList`
- `ViewTab`
- `WorkItemRow`

Organisms:

- `AppShell`
- `CreateIssueDialog`
- `InitialSetupCard`
- `IssuesList`
- `IssuesSidebar`
- `IssuesToolbar`
- `RepositoryInitialiseDialog`
- `WorkspaceShell`

## Storybook

Run Storybook from the package:

```sh
pnpm --filter @cycle/ui storybook
```

Or from the repository root:

```sh
pnpm storybook
```

Build static Storybook output:

```sh
pnpm --filter @cycle/ui storybook:build
```

Every public component should have Storybook coverage for its default state and meaningful variants.
Components with state should include disabled, invalid, loading, empty, error, and selected examples
where applicable.

Stories are examples, not behavioral tests. Add tests when behavior depends on keyboard interaction,
state transitions, parsing, or non-trivial rendering logic.

## Development Workflow

1. Add or edit the component under the right family directory.
2. Export it from the local `index.ts`.
3. Export it through the family `index.ts`; the root `src/index.ts` re-exports all public families.
4. Add or update the Storybook story next to the component.
5. Keep public props aligned with the API rules below.
6. Run the relevant checks:

```sh
pnpm --filter @cycle/ui storybook:build
pnpm typecheck
pnpm lint
pnpm format:check
```

Use `@base-ui/react` for accessible control behavior where Base UI has the primitive. Keep Cycle
components as styled wrappers around those primitives rather than reimplementing keyboard,
selection, focus, or popup semantics.

## Component API Rules

### Naming

- Use `tone` for semantic color intent.
- Use `variant` only for structural or visual treatment on action components, such as `Button`.
- Do not add new semantic `variant` values like `destructive`, `success`, or `warning`.
- Use `appearance` for visual treatment when a non-action component needs it, for example `soft`,
  `solid`, or `outline`.
- Use `selected` for tab/list selection.
- Use `active` only for navigation-current state.
- Use `disabled`, `invalid`, `loading`, `readOnly`, and `required` consistently when a component
  supports those states.
- Use `onValueChange` for controlled value components that normalize input before emitting.
- Use `onSelect` or a more specific callback such as `onRowSelect` for business selection, but avoid
  colliding with native DOM event prop names.

### Semantic Tones

Supported semantic tones are exported from `componentTones`:

```ts
type ComponentTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";
```

Rules:

- Use `danger`, not `destructive`, in new component APIs.
- Use `info` for the primary informational/product-blue state.
- Components may keep legacy props for compatibility, but new stories and new code must use `tone`.
- Components should expose `data-tone` when tone changes styling.

### Sizes And Density

- Use `size` for discrete control sizes: `sm`, `md`, `lg`.
- Use `density` for repeated data surfaces: `compact`, `comfortable`.
- Do not create component-local names such as `small`, `normal`, `large`, `dense`, or `spacious`.
- If a component intentionally does not support all shared sizes, document the reason in its props or
  story.

### Forms

Use `Field` for form control composition.

Rules:

- Prefer `FieldInput`, `FieldSelect`, `FieldTextarea`, `FieldCheckbox`, and `FieldSwitch` when a
  control belongs to a `Field`.
- Use `controlId` on `Field` when a stable ID is needed for tests, analytics, or external labels.
- Let `FieldLabel`, `FieldDescription`, and `FieldError` derive IDs from `Field` unless there is a
  specific reason to override them.
- Set `invalid`, `disabled`, `readOnly`, and `required` on `Field` when the whole field shares that
  state.
- Primitive controls may still be used directly, but then consumers own all label and ARIA wiring.

### Actions And Slots

- Product-level components must not hard-code unconfigurable actions.
- If a component renders a built-in action, expose a callback and label prop for it.
- If consumers may need full control, expose a slot prop such as `primaryAction`, `headerAction`, or
  `filterControls`.
- Do not hide required product behavior behind static text such as "5 more" or "Display"; make it a
  prop.

### Rows, Lists, And Data Surfaces

- Row components should support `selected`, `disabled`, `density`, keyboard activation, and a
  selection callback.
- List components should support `loading`, `emptyState`, and `error`.
- Repeated rows should use stable keys from data IDs.
- If a component truncates or limits content, expose a limit prop and show a visible overflow
  affordance.
- Avoid fixed product data inside reusable organisms.

### Navigation

- Use `NavigationItem` for sidebar and workspace navigation rows.
- Navigation items may render as buttons or links through `href`.
- Sidebar components should expose item-level callbacks and a parent callback such as
  `onItemSelect`.
- Do not create separate visual-only nav row implementations.

### Controlled Components

- Components with user-editable values must support controlled and uncontrolled usage when practical.
- Controlled props should be named `value` and `onValueChange`.
- Uncontrolled defaults should be named `defaultValue`.
- Components that normalize input must emit the normalized value.

## Accessibility Rules

- Interactive visual elements must render as native controls or links when possible.
- Buttons must default to `type="button"`.
- Icon-only buttons must require a text `label` and set `aria-label`.
- Active navigation items must set `aria-current="page"`.
- Tabs must expose `role="tab"`, `aria-selected`, and a tablist parent where rendered as a set.
- Expandable controls must set `aria-expanded`.
- Invalid form controls must set `aria-invalid`.
- Descriptions and errors must connect to controls with `aria-describedby`.
- Error text that appears in response to validation should use `role="alert"`.
- Loading indicators must expose a screen-reader label unless they are purely decorative.

## Export Rules

- Every public component must export from its local `index.ts`.
- Components available through `atoms`, `molecules`, or `organisms` should also be available through
  `components`.
- Avoid adding new public paths without updating `package.json` exports.
- Keep `styles.css` listed in `sideEffects` so bundlers do not remove it.

## Compatibility Notes

- `Badge` and `Alert` still accept legacy `variant` values for existing consumers. New code should
  use `tone`.
- `destructive` is normalized to `danger`.
- `primary` is normalized to `info` when used as a legacy semantic value.
