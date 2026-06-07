# @cycle/ui

Cycle UI is a React component package for product surfaces, forms, navigation, and workspace workflows.

The package should stay small, composable, accessible, and consistent. Components may be visually opinionated, but their public APIs must follow the rules below.

## Foundation

Cycle UI primitives build on [Base UI](https://base-ui.com/react/overview/quick-start) where Base UI provides the underlying accessible behavior. Keep local components as styled wrappers around `@base-ui/react` parts instead of reimplementing control semantics.

Rules:

- Prefer component-specific imports such as `@base-ui/react/button` and `@base-ui/react/select`.
- Keep Base UI provider and portal setup in `styles.css` and `ThemeProvider`.
- Preserve Cycle API names for existing consumers when practical.
- Expose Base UI compound parts from the local component module when consumers need lower-level composition.

## Component API Rules

### Naming

- Use `tone` for semantic color intent.
- Use `variant` only for structural or visual treatment on action components, such as `Button`.
- Do not add new semantic `variant` values like `destructive`, `success`, or `warning`.
- Use `appearance` for visual treatment when a non-action component needs it, for example `soft`, `solid`, or `outline`.
- Use `selected` for tab/list selection.
- Use `active` only for navigation-current state.
- Use `disabled`, `invalid`, `loading`, `readOnly`, and `required` consistently when a component supports those states.
- Use `onValueChange` for controlled value components that normalize input before emitting.
- Use `onSelect` or a more specific callback such as `onRowSelect` for business selection, but avoid colliding with native DOM event prop names.

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
- If a component intentionally does not support all shared sizes, document the reason in its props or story.

### Accessibility

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

### Forms

Use `Field` for form control composition.

Rules:

- Prefer `FieldInput`, `FieldSelect`, `FieldTextarea`, `FieldCheckbox`, and `FieldSwitch` when a control belongs to a `Field`.
- Use `controlId` on `Field` when a stable ID is needed for tests, analytics, or external labels.
- Let `FieldLabel`, `FieldDescription`, and `FieldError` derive IDs from `Field` unless there is a specific reason to override them.
- Set `invalid`, `disabled`, `readOnly`, and `required` on `Field` when the whole field shares that state.
- Primitive controls may still be used directly, but then consumers own all label and ARIA wiring.

### Actions And Slots

- Product-level components must not hard-code unconfigurable actions.
- If a component renders a built-in action, expose a callback and label prop for it.
- If consumers may need full control, expose a slot prop such as `primaryAction`, `headerAction`, or `filterControls`.
- Do not hide required product behavior behind static text such as "5 more" or "Display"; make it a prop.

### Rows, Lists, And Data Surfaces

- Row components should support `selected`, `disabled`, `density`, keyboard activation, and a selection callback.
- List components should support `loading`, `emptyState`, and `error`.
- Repeated rows should use stable keys from data IDs.
- If a component truncates or limits content, expose a limit prop and show a visible overflow affordance.
- Avoid fixed product data inside reusable organisms.

### Navigation

- Use `NavigationItem` for sidebar and workspace navigation rows.
- Navigation items may render as buttons or links through `href`.
- Sidebar components should expose item-level callbacks and a parent callback such as `onItemSelect`.
- Do not create separate visual-only nav row implementations.

### Controlled Components

- Components with user-editable values must support controlled and uncontrolled usage when practical.
- Controlled props should be named `value` and `onValueChange`.
- Uncontrolled defaults should be named `defaultValue`.
- Components that normalize input must emit the normalized value.

### Stories

- Every component should have Storybook coverage for its default state and meaningful variants.
- Components with state should include stories for disabled, invalid, loading, empty, error, and selected states where applicable.
- Stories should demonstrate current API rules, not legacy compatibility props.
- Stories are examples, not tests. Add tests when behavior goes beyond static rendering.

### Exports

- Every public component must export from its local `index.ts`.
- Components available through `atoms`, `molecules`, or `organisms` should also be available through `components`.
- Avoid adding new public paths without updating `package.json` exports.

## Current Compatibility Notes

- `Badge` and `Alert` still accept legacy `variant` values for existing consumers. New code should use `tone`.
- `destructive` is normalized to `danger`.
- `primary` is normalized to `info` when used as a legacy semantic value.
