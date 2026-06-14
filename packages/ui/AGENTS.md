# Cycle UI Agent Guidelines

## Scope

These instructions apply to every file under `packages/ui`.

`@cycle/ui` is the shared React design system for Cycle product surfaces. Keep it presentation-first:
components may accept data, callbacks, and render slots, but app state, Electron APIs, persistence,
network calls, query clients, mutations, and routing hooks belong in consuming applications such as
`@cycle/desktop`.

## Component Ownership

- Put low-level controls in `src/atoms`.
- Put small composed controls and compact data surfaces in `src/molecules`.
- Put product regions, dialogs, sidebars, lists, toolbars, and shells in `src/organisms`.
- Put full-screen examples and prototype compositions in `src/pages`.
- Use `src/templates` only for reusable layout skeletons that are not product-specific.
- Do not add a `src/components` re-export surface. The root `src/index.ts` is the single broad
  import point, and the atomic-design folders are the canonical implementation and direct import
  locations.

Promote renderer UI into this package when it is reusable, presentational, and not coupled to app
state. Keep renderer wrappers when they adapt app/domain data into UI props.

## First-Class Component Criteria

A component is first-class only when it has:

- a stable public prop contract with app data passed in through props
- no hard-coded product records that consumers cannot replace
- callback props or slots for every visible action
- controlled and uncontrolled value support when the user can edit state
- semantic API names from the shared contracts
- accessible markup and keyboard behavior
- Storybook coverage for default, meaningful variants, loading, empty, error, disabled, selected, and
  long-content states where applicable

`CreateIssueDialog` is the reference organism target: it should be data-driven through status,
priority, assignee, label, project, and secondary-action options rather than owning fixed product
data internally.

## API Rules

- Use `tone` for semantic color intent: `neutral`, `info`, `success`, `warning`, `danger`, `accent`.
- Use `variant` only for structural/action treatment such as `primary`, `secondary`, `outline`,
  `ghost`, or `link`.
- Use `danger`, not `destructive`, in new public APIs. Keep legacy values only for compatibility.
- Use `appearance` for non-action visual treatment such as `soft`, `solid`, or `outline`.
- Use `size` for discrete control sizes: `sm`, `md`, `lg`.
- Use `density` for repeated data surfaces: `compact`, `comfortable`.
- Use `selected` for tab/list selection and `active` for navigation-current state.
- Use `value`, `defaultValue`, and `onValueChange` for editable controlled components.
- Use specific callback names for business actions, such as `onRowSelect`, `onCreate`, or
  `onRepositorySelect`.
- Avoid static action text inside organisms. Expose label props, callbacks, and slots.

Shared contracts live in `src/lib/contracts.ts`. Use them instead of component-local equivalents
unless a component intentionally supports a narrower set.

## Composition Rules

- Prefer existing atoms and molecules before adding new styling directly to organisms.
- Use `Field` and its control wrappers for form composition.
- Use `NavigationItem` for sidebar and workspace navigation rows.
- Use Base UI primitives for controls with keyboard, popup, selection, focus, or dialog behavior when
  a suitable primitive exists.
- Use `cn` from `@cycle/ui/utils` for class merging.
- Do not add app runtime logic, query state, filesystem state, or Electron bridge calls.
- Do not put UI cards inside other cards. Cards are for repeated items, dialogs, modals, and genuinely
  framed tools.

## Visual Rules

- Cycle's product UI should feel quiet, dense, and work-focused.
- Use `typography` from `src/lib/styles.ts` for shared product text roles before adding one-off
  Tailwind text, leading, tracking, or font-weight classes.
- Prefer restrained surfaces, predictable navigation, compact controls, and clear scan paths.
- Keep card radii at `rounded-lg` or smaller unless the component is a modal/dialog or an existing
  pattern requires otherwise.
- Avoid decorative orbs, bokeh blobs, generic gradient backgrounds, and one-note palettes.
- Use lucide icons for recognizable actions instead of text-only pills.
- Ensure long labels, IDs, titles, and metadata truncate or wrap intentionally without overlapping.
- Define stable dimensions for boards, grids, toolbars, icon buttons, counters, rows, and tiles so
  hover or dynamic content does not resize the layout.
- Do not scale font size with viewport width.
- Keep letter spacing at `0` unless preserving an existing component pattern.

## Accessibility Rules

- Interactive elements must render as native controls or links when possible.
- Buttons must default to `type="button"`.
- Icon-only buttons must have a text `label` and `aria-label`.
- Active navigation items must set `aria-current="page"`.
- Tabs must expose `role="tab"` and `aria-selected`; tab groups must expose `role="tablist"`.
- Expandable controls must set `aria-expanded`.
- Invalid form controls must set `aria-invalid`.
- Descriptions and errors must connect to controls with `aria-describedby`.
- Validation errors should use `role="alert"`.
- Loading indicators need a screen-reader label unless they are decorative.

## Storybook Rules

- Every public atom, molecule, and organism must have colocated Storybook coverage.
- Story titles should follow the atomic hierarchy, such as `Atoms/Button`,
  `Molecules/Issue List Row`, and `Organisms/Create Issue Dialog`.
- Stories are product examples, not tests. Keep sample data realistic but do not let one issue title
  or project name define the component identity.
- Add states before calling a component complete: default, loading, empty, error, disabled, selected,
  compact/comfortable density, long content, and narrow viewport where relevant.
- Keep page stories under `Examples/` unless the page is intended as a reusable exported screen.

## Export Rules

- Every public component exports from its local `index.ts`.
- Components in `atoms`, `molecules`, `organisms`, `pages`, or `templates` must be reachable through
  the root `src/index.ts` via family barrel exports.
- Update `package.json` exports only when adding a new public path.
- Keep `styles.css` listed in `sideEffects`.

## Verification

For UI package changes, run the narrowest relevant checks first:

```sh
pnpm --filter @cycle/ui storybook:build
```

For broader API or type changes, also run:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
```
