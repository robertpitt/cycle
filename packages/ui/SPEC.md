# @cycle/ui Productionization Specification

Status: Draft implementation specification

Version: 0.2.0

Scope: `packages/ui` and `packages/desktop/src/renderer`

## 1. Purpose

`@cycle/ui` MUST become the first-class shared React UI system for Cycle product surfaces. It MUST
own the reusable application UI, design-system primitives, product components, layouts, pages,
templates, examples, styling contracts, and Storybook coverage needed by the desktop renderer and
future Cycle applications.

`@cycle/desktop` renderer code MUST become an adapter layer. It MAY own routes, providers, query and
mutation hooks, IPC bridge access, app-specific state, DTO-to-UI mapping, notifications, and
navigation. It MUST NOT remain the long-term owner of reusable product UI, local menu
implementations, date formatting widgets, issue property controls, settings panels, list/detail
views, or screen layouts that can be represented through props and callbacks.

This specification replaces the previous narrow Lexical Markdown editor specification. The Markdown
editor remains a required first-class component family under this broader UI productionization
contract.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means an implementation may choose the behavior, but it MUST document that
choice and expose enough information for callers, tests, and future maintainers to reason about it.

## 3. Source Guidance

UI productionization work MUST follow these local sources:

- `packages/ui/AGENTS.md`
- `packages/ui/README.md`
- `packages/desktop/README.md`
- Root `SPEC.md` package-boundary rules for `@cycle/ui` and `@cycle/desktop`
- Existing component implementations under `packages/ui/src`
- Existing desktop renderer usage under `packages/desktop/src/renderer`

Where this specification and `packages/ui/AGENTS.md` differ on component placement, API vocabulary,
visual rules, accessibility, or export rules, `packages/ui/AGENTS.md` wins and this specification
SHOULD be revised.

## 4. Problem Statement

Cycle's UI was developed quickly across `@cycle/ui` and the desktop renderer. The package already
has atoms, molecules, organisms, pages, templates, design tokens, Storybook, and architecture tests,
but the implementation is not yet production-standard as a shared UI library.

Current inconsistencies include:

- Desktop renderer components own reusable UI structures such as issues panels, view tables,
  settings panels, repository history panels, issue property controls, empty states, and page
  headers.
- Renderer components mix React Query, mutations, route state, DTO adaptation, formatting, and
  reusable JSX in the same files.
- Date and time formatting is duplicated with ad hoc `Intl.DateTimeFormat` calls.
- Typography is applied through one-off Tailwind classes instead of a strict shared text component
  and text-role vocabulary.
- Select, dropdown, autocomplete, chip picker, command picker, and local property menus do not share
  one consistent interaction model.
- Status, priority, assignee, label, metadata, table, loading, empty, and error states are repeated
  with small visual differences.
- Some UI components contain default product data that is useful for stories but unsafe as a shared
  component contract.
- Storybook coverage exists but is not yet the formal conformance surface for every first-class
  component and state.

Cycle needs a production-grade UI package where all reusable UI is data-driven, consistent,
accessible, documented through Storybook, and consumed by desktop through thin adapters.

## 5. Goals

The productionized UI package MUST:

1. Provide a strict atomic-design structure with first-class atoms, molecules, organisms, pages, and
   templates.
2. Move reusable desktop renderer UI into `@cycle/ui` as presentational components.
3. Keep `@cycle/desktop` renderer responsible for routes, providers, query hooks, mutation hooks,
   IPC bridge access, navigation, notifications, and DTO-to-UI mapping.
4. Keep `@cycle/ui` free of application data fetching, React Query, Effect runtime ownership,
   Electron APIs, persistence, routing hooks, and app package imports.
5. Allow domain-shaped UI props such as `issue`, `repository`, `savedView`, and `comment` when those
   shapes are defined locally in `@cycle/ui` and passed as plain data.
6. Avoid importing `@cycle/contracts`, `@cycle/database`, `@cycle/api`, `@cycle/usecases`,
   `@cycle/desktop`, or other non-UI Cycle runtime packages from `@cycle/ui`.
7. Prefer breaking cleanup over backwards-compatible API clutter while `@cycle/desktop` is the only
   consumer.
8. Provide a required `Text` component that controls allowed semantic text roles, tones, truncation,
   and rendering elements.
9. Provide a required `DateTime` component that accepts `string | Date` values, supports an explicit
   timezone, handles invalid values consistently, and replaces ad hoc UI date formatting.
10. Provide one shared choice/popup foundation for `Select`, `DropdownMenu`, `Autocomplete`, and
    multi-select/property picker behavior.
11. Standardize status, priority, label, assignee, metadata, table, empty, loading, and error
    presentation through reusable components.
12. Keep Markdown strings as the public contract for Markdown editor and renderer components.
13. Provide Storybook coverage for every first-class public component in one colocated story file
    that demonstrates the component's meaningful states.
14. Make conformance testable through architecture tests, import scans, Storybook builds, component
    behavior tests, and desktop typechecks.

## 6. Non-Goals

The productionized UI package MUST NOT:

1. Preserve old UI public APIs when a breaking API produces a cleaner and more consistent result.
2. Own React Query clients, query keys, mutation instances, retries, invalidation, or app caching.
3. Own Electron bridge calls, native dialogs, filesystem access, clipboard writes, or external link
   opening. These actions MUST be exposed as callback props when needed.
4. Own route parsing, URL construction, navigation history, route loaders, or React Router hooks.
5. Import app-domain schema packages to reuse their types directly.
6. Persist app data, write to local storage for product state, or perform network requests.
7. Become a generic design system for unrelated products. Components SHOULD be optimized for Cycle's
   dense, work-focused product UI.
8. Add decorative marketing-page patterns, large hero compositions, gradient ornamentation, or
   visual effects that are not part of the product UI.
9. Require every tiny pure helper to become a component when a local helper keeps the code clearer.
10. Require one public component to cover incompatible interaction models. Shared foundations are
    preferred over unnatural prop overloads.

## 7. System Overview

### 7.1 Layer Position

```text
@cycle/contracts / @cycle/api / @cycle/usecases
  Domain schemas, usecase contracts, API execution, storage, and workflow policy

@cycle/desktop main/preload
  Electron lifecycle, IPC, native theme state, shell APIs, filesystem-safe platform behavior

@cycle/desktop renderer
  React Query, mutations, route state, DTO-to-UI mapping, callback wiring, app providers

@cycle/ui
  Theme, tokens, atoms, molecules, organisms, templates, pages, Markdown editor/renderer,
  Storybook examples, component tests, and presentational UI contracts
```

`@cycle/ui` MUST be usable by future Cycle frontends without bringing in desktop runtime code.

### 7.2 Desktop Adapter Rule

A desktop renderer component is valid when it primarily:

- calls query and mutation hooks
- reads route parameters or navigation state
- maps app DTOs into `@cycle/ui` prop shapes
- passes callbacks into `@cycle/ui`
- renders one or more `@cycle/ui` components

A desktop renderer component SHOULD be migrated into `@cycle/ui` when it primarily:

- renders reusable layout, panels, tables, lists, cards, toolbars, dialogs, or forms
- defines local icons, indicators, date formatting, empty states, or menus
- contains product UI that could be rendered from props and callbacks
- has no unavoidable dependency on route state, query state, mutation state, IPC, or app providers

### 7.3 First-Class Component Families

The following component families are REQUIRED before the UI package is considered productionized:

- Foundation atoms: `Text`, `DateTime`, `Button`, `IconButton`, `Input`, `Textarea`, `Checkbox`,
  `Switch`, `Badge`, `Avatar`, `Kbd`, `Label`, `Separator`, `Skeleton`, `Spinner`, and
  `StatusIndicator`.
- Choice components: `Select`, `DropdownMenu`, `Autocomplete`, and multi-select/property picker
  components built on one shared foundation.
- Form composition: `Field` and field adapters for supported controls.
- Feedback components: `Alert`, `Notification`, `EmptyState`, `PanelState`, loading states, and
  error states.
- Data display components: metadata lists, info rows, tables, issue rows, inbox rows, commit history
  rows, status marks, priority marks, label swatches, assignee marks, and inline copy/action chips.
- Product organisms: app shell, workspace shell, issues list, issues toolbar, issues sidebar, inbox
  list, views table, repository history, settings panels, create issue dialog, view issue surface,
  repository initialization dialog, and setup/onboarding surfaces.
- Templates: reusable workspace, settings, list/detail, split-pane, centered-state, and app-shell
  layout skeletons.
- Pages: data-driven full-screen compositions used by desktop adapters and Storybook examples.
- Markdown system: Markdown renderer, Lexical-backed Markdown editor, issue editor, and comment
  composer.

## 8. Repository and Export Contract

### 8.1 Source Layout

`@cycle/ui` production source MUST follow this layout:

```text
src/
  atoms/        Low-level controls and semantic presentation primitives.
  molecules/    Composed controls, compact data surfaces, and reusable field/picker patterns.
  organisms/    Product regions, panels, dialogs, sidebars, lists, toolbars, and shells.
  pages/        Full-screen data-driven product compositions and Storybook page examples.
  templates/    Reusable layout skeletons with slots and no product data assumptions.
  theme/        Theme provider and theme mode contracts.
  lib/          Shared contracts, styles, utilities, formatting helpers, and internal foundations.
  stories/      Cross-component examples that are not tied to one public component.
  styles.css    Tailwind v4 entrypoint and Cycle design tokens.
```

The atomic-design folders are the canonical implementation locations. `src/components` MUST NOT
exist as a re-export or implementation surface.

### 8.2 Component Directory Contract

Every public component MUST live in a kebab-case directory:

```text
src/<family>/<component-name>/
  <component-name>.tsx
  <component-name>.stories.tsx
  index.ts
  <component-name>.test.tsx        optional but REQUIRED for non-trivial behavior
```

Additional files MAY exist for local helpers, fixtures, or internal subcomponents. Internal files
MUST NOT create undocumented public exports.

### 8.3 Export Rules

Every public component MUST export from:

- its local `index.ts`
- the canonical family barrel, such as `src/atoms/index.ts`
- the root `src/index.ts` through the relevant family barrel

Package export paths in `packages/ui/package.json` MUST stay aligned with the source layout.

Breaking export cleanup is allowed. When a public path is removed, desktop usage MUST be migrated in
the same change set.

## 9. Component Taxonomy

### 9.1 Atoms

Atoms are low-level semantic controls or presentation primitives. An atom MAY wrap an accessible
primitive library when that primitive represents one control, but it MUST NOT encode product
workflow, domain records, query state, or multi-region application layout.

Examples:

- `Text`
- `DateTime`
- `Button`
- `IconButton`
- `Input`
- `Textarea`
- `Checkbox`
- `Switch`
- `Badge`
- `Avatar`
- `Kbd`
- `Separator`
- `Skeleton`
- `Spinner`
- `StatusIndicator`

Atoms MUST expose shared API vocabulary from `src/lib/contracts.ts` where applicable.

### 9.2 Molecules

Molecules compose atoms into reusable controls, form groups, compact data surfaces, or interaction
patterns. A molecule MAY own local UI state such as open/closed state, search text, highlighted
index, uncontrolled value, focus state, and local draft text. It MUST NOT own app state or app data
fetching.

Examples:

- `Field`
- `Select`
- `DropdownMenu`
- `Autocomplete`
- `PropertyPicker`
- `SearchInput`
- `Alert`
- `Notification`
- `IssueMetaChip`
- `IssueComment`
- `MarkdownEditor`
- `EmptyState`
- `PanelState`

### 9.3 Organisms

Organisms are product regions made from atoms and molecules. They MAY represent Cycle concepts such
as issues, repositories, inbox entries, views, comments, and settings when those concepts are passed
as plain UI props. They MUST remain presentational.

Examples:

- `AppShell`
- `WorkspaceShell`
- `IssuesList`
- `IssuesToolbar`
- `InboxList`
- `ViewsTable`
- `RepositoryHistory`
- `ApplicationSettingsPanel`
- `RepositorySettingsPanel`
- `ViewIssue`
- `CreateIssueDialog`
- `RepositoryInitialiseDialog`
- `InitialSetup`

Organisms MUST expose callbacks or slots for every visible action. They MUST NOT hard-code actions
that a consuming application cannot replace.

### 9.4 Templates

Templates define reusable layout skeletons. A template MUST use slots and layout props rather than
product records.

Examples:

- workspace app shell template
- settings page template
- list/detail template
- split-pane template
- centered state template
- table page template

Templates MUST NOT import product organisms when that would make the template product-specific.

### 9.5 Pages

Pages are full-screen compositions intended for app consumption or Storybook examples. A page MAY
compose product organisms and MAY include realistic default demo data for stories only. Production
page exports MUST remain data-driven and callback-driven.

Pages MUST NOT call React Query hooks, route hooks, Electron bridge APIs, or app mutations.

## 10. First-Class Component Criteria

A component is first-class only when it has:

1. A stable public TypeScript prop contract.
2. App data passed in through props.
3. Callback props or slots for visible actions.
4. Controlled and uncontrolled value support when the user edits component-owned state and both
   modes are practical.
5. Shared semantic API names such as `tone`, `variant`, `appearance`, `size`, `density`, `selected`,
   `active`, `disabled`, `invalid`, `loading`, `readOnly`, `required`, `value`, `defaultValue`, and
   `onValueChange`.
6. Accessible markup and keyboard behavior.
7. Explicit loading, empty, error, disabled, selected, long-content, and narrow-layout states where
   those states apply.
8. One colocated Storybook file demonstrating all meaningful states.
9. Tests for keyboard behavior, parsing, formatting, state transitions, or non-trivial rendering.
10. No app runtime imports or app data fetching.

Components that do not meet these criteria MUST remain internal or be completed before being exposed
through a public barrel.

## 11. Presentational Boundary

### 11.1 Forbidden Production Imports

Production source files in `@cycle/ui` MUST NOT import:

- `@cycle/contracts`
- `@cycle/database`
- `@cycle/desktop`
- `@cycle/git`
- `@cycle/git-store`
- `@cycle/usecases`
- `@cycle/api`
- `@tanstack/react-query`
- `effect`
- `electron`
- `react-router`

This restriction applies to type imports as well as runtime imports.

### 11.2 Allowed UI Domain Shapes

`@cycle/ui` MAY define local UI data types that use domain-shaped names. Examples include:

- `IssueListItem`
- `IssueStatusOption`
- `IssuePriorityOption`
- `RepositorySummary`
- `SavedViewRow`
- `InboxEntry`
- `CommitHistoryItem`
- `ViewIssueComment`

These types MUST be renderer-safe plain data. They MUST NOT expose mutable query results, mutation
objects, Effect values, Electron bridge objects, database documents, or transport clients.

### 11.3 State Ownership

`@cycle/ui` MAY own ephemeral presentation state:

- controlled/uncontrolled form values
- local drafts inside a form or popover
- open/closed popup state
- selected tab or item state when exposed through controlled props
- highlighted option state
- focus and hover state
- local optimistic visual state that does not persist app data

`@cycle/ui` MUST NOT own application state:

- remote data loading
- query invalidation
- mutation retries
- route history
- repository selection persistence
- desktop settings persistence
- Electron native theme source
- file system or clipboard side effects
- API clients or bridge clients

## 12. Shared API Vocabulary

`src/lib/contracts.ts` MUST remain the canonical source for shared semantic API vocabulary.

Required shared contracts:

- `ComponentTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent"`
- `ComponentDensity = "compact" | "comfortable"`
- `ComponentSize = "sm" | "md" | "lg"`
- `ComponentAppearance = "soft" | "solid" | "outline"`
- `ComponentActionVariant = "primary" | "secondary" | "outline" | "ghost" | "link"`

Rules:

- Use `tone` for semantic color intent.
- Use `variant` only for structural or action treatment.
- Use `appearance` for non-action visual treatment.
- Use `danger`, not `destructive`, in new public APIs.
- Use `size` for discrete control sizes.
- Use `density` for repeated data surfaces.
- Use `selected` for selected tabs, rows, and options.
- Use `active` for navigation-current state.
- Use `value`, `defaultValue`, and `onValueChange` for editable controlled components.
- Use specific callback names for business actions, such as `onRowSelect`, `onIssueSelect`,
  `onRepositorySelect`, `onCommentSubmit`, or `onCreateIssue`.

New components MUST NOT introduce component-local equivalents such as `small`, `large`, `spacious`,
`destructive`, `primaryTone`, or `onChangeValue` unless the component documents a necessary
compatibility reason.

## 13. Text Component Contract

### 13.1 Purpose

`Text` MUST be the primary way product components render semantic display text. It centralizes
allowed text roles, color tones, truncation, wrapping, and HTML element selection.

### 13.2 Public API

The exact TypeScript names are implementation-defined, but `Text` MUST support:

- `as?: keyof JSX.IntrinsicElements` or an equivalent constrained element prop
- `variant?: TextVariant`
- `tone?: ComponentTone | "foreground" | "muted" | "subtle" | "inherit"`
- `truncate?: boolean | "line-clamp-2" | "line-clamp-3"`
- `wrap?: "normal" | "nowrap" | "break" | "balance"`
- `align?: "start" | "center" | "end"`
- `children?: React.ReactNode`
- `className?: string`

Required `TextVariant` values:

- `pageTitle`
- `sectionTitle`
- `panelTitle`
- `body`
- `bodyCompact`
- `control`
- `meta`
- `code`

### 13.3 Usage Rules

Product organisms, pages, and templates MUST use `Text` for headings, descriptions, metadata,
empty-state text, error text, and table text unless native control semantics make a direct element
clearer.

Direct Tailwind typography classes such as `text-sm`, `text-xs`, `text-base`, `font-semibold`,
`leading-*`, and `tracking-*` SHOULD be isolated to:

- `Text`
- atom implementations that render native controls
- Markdown renderer/editor content
- code/preformatted content
- documented migration allowlists

## 14. DateTime Component Contract

### 14.1 Purpose

`DateTime` MUST provide consistent date, time, datetime, relative, compact, and ISO presentation for
all UI components.

### 14.2 Public API

The exact TypeScript names are implementation-defined, but `DateTime` MUST support:

- `value: string | Date | null | undefined`
- `timeZone?: string`
- `locale?: string | string[]`
- `format?: "date" | "time" | "datetime" | "relative" | "compactDate" | "compactDateTime" | "iso"`
- `fallback?: React.ReactNode`
- `relativeBase?: string | Date`
- `dateStyle?: Intl.DateTimeFormatOptions["dateStyle"]`
- `timeStyle?: Intl.DateTimeFormatOptions["timeStyle"]`
- `children?: never` unless a render-prop API is explicitly documented

`DateTime` MAY also accept numeric epoch values if the implementation documents whether numbers are
milliseconds or seconds. If numeric values are supported, milliseconds SHOULD be the default because
JavaScript `Date` uses milliseconds.

### 14.3 Behavior

`DateTime` MUST:

- parse valid ISO strings and `Date` instances
- render `fallback` for `null`, `undefined`, empty strings, and invalid dates
- include a valid `dateTime` attribute when rendering a `<time>` element
- use the caller-supplied `timeZone` when provided
- default to the user's runtime locale and local timezone when `locale` or `timeZone` is omitted
- avoid throwing during render for invalid input

Desktop renderer components MUST NOT duplicate date/time formatting for display once `DateTime` is
available.

### 14.4 Date Props in Product Components

Any public UI prop that represents a display date or time SHOULD accept `string | Date | null |
undefined`, unless a narrower type is required by a native input such as `<input type="date">`.

Product components that render dates SHOULD either:

- accept `dateTimeProps` or an equivalent prop bag that forwards `format`, `timeZone`, `locale`, and
  `fallback` to `DateTime`; or
- document their fixed date presentation when a component-specific format is necessary.

Desktop adapters own conversion from app-specific date fields into these UI props. UI components
MUST NOT require app DTOs solely to access date metadata.

## 15. Choice, Dropdown, Select, and Autocomplete Contract

### 15.1 Shared Foundation

`@cycle/ui` MUST provide one shared choice foundation for option normalization, popup positioning,
keyboard navigation, search filtering, item rendering, disabled items, selected indicators, section
headers, empty states, loading states, and errors.

The shared foundation MAY be public or internal. Public components built on it MUST include:

- `Select` for single-value selection.
- `DropdownMenu` for command/action menus with no persistent value.
- `Autocomplete` or `Combobox` for searchable option selection and optional free-text entry.
- `MultiSelect` or `PropertyPicker` for selecting multiple values and rendering compact trigger
  summaries.

This approach satisfies the consistency requirement without forcing one public component to carry
incompatible command, selection, and free-text semantics.

### 15.2 Option Model

The choice foundation MUST normalize options into an equivalent of:

```ts
type ChoiceOption = {
  readonly disabled?: boolean;
  readonly description?: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly id: string;
  readonly keywords?: readonly string[];
  readonly label: React.ReactNode;
  readonly rightMeta?: React.ReactNode;
  readonly textValue?: string;
  readonly tone?: ComponentTone;
  readonly value?: string;
};

type ChoiceSection = {
  readonly id: string;
  readonly label?: React.ReactNode;
  readonly options: readonly ChoiceOption[];
};
```

`textValue` MUST be used for filtering and typeahead when `label` is not a plain string.

### 15.3 Required Props

Choice components MUST support the relevant subset of:

- `sections` or `items`
- `value`
- `defaultValue`
- `onValueChange`
- `onOptionSelect`
- `open`
- `defaultOpen`
- `onOpenChange`
- `searchable`
- `searchValue`
- `defaultSearchValue`
- `onSearchValueChange`
- `placeholder`
- `disabled`
- `invalid`
- `loading`
- `error`
- `emptyState`
- `size`
- `density`
- `align`

### 15.4 Migration Requirements

The choice foundation MUST replace:

- local `useOutsideClose` menu implementations in desktop UI
- issue property option menus
- view option menus
- local searchable input-plus-menu implementations
- duplicated chip picker behavior where it can be represented with shared option sections

Existing `Select`, `ChipSelect`, and `PropertyPicker` MAY remain as public names, but their internal
behavior SHOULD converge on the shared choice foundation.

## 16. Data Display and Product Presentation Components

### 16.1 Required Reusable Components

The UI package MUST standardize these repeated presentation patterns:

- `PageHeader` or equivalent header component for title, description, icon, meta, and actions.
- `SectionHeader` for dense panel and section headings.
- `EmptyState` for no-data and setup-required states.
- `PanelState` for loading, error, empty, and unavailable panel bodies.
- `InfoList` or `MetadataList` for label/value rows.
- `DataTable` or table primitives for dense tables with loading, empty, error, selected, and
  long-content states.
- `SearchInput` for search fields with consistent icon, sizing, clear behavior, invalid state, and
  accessibility.
- `InlineActionChip` or equivalent for compact copy/open/action chips.
- `PriorityIndicator` for none, low, medium, high, and urgent priority.
- `IssueStatusIndicator` or a documented extension of `StatusIndicator` for backlog, todo,
  in-progress, done, closed, canceled, and blocked states.
- `LabelSwatch` for label color display and safe unknown-color fallback.
- `AssigneeMark` or `UserAvatarLabel` for assignee initials, unknown user, and optional metadata.

### 16.2 Domain Presentation Rules

Product organisms MAY use Cycle domain terms in their prop names. They MUST keep those props as UI
contracts rather than app schemas.

For example, an issue list row MAY accept:

```ts
type IssueListItem = {
  readonly assignee?: UserSummary | null;
  readonly date?: string | Date | null;
  readonly id: string;
  readonly labels?: readonly LabelSummary[];
  readonly priority?: string | null;
  readonly repositoryId?: string;
  readonly status?: string | null;
  readonly title: React.ReactNode;
};
```

The desktop adapter owns conversion from `TicketDocument` or API DTOs into `IssueListItem`.

## 17. Markdown Editor and Renderer Contract

### 17.1 Public Value Contract

Markdown strings MUST remain the canonical public value type for ticket bodies, create-ticket
descriptions, and comments.

The Markdown system MUST NOT require consumers to persist Lexical JSON, HTML, or editor-specific
state.

### 17.2 Required Components

The UI package MUST provide:

- a shared Markdown editor foundation
- a ticket/body editor variant
- a compact comment composer variant
- a safe Markdown renderer
- Storybook examples for standalone editor, ticket editor, comment composer, and rendered Markdown

### 17.3 Public Props

Markdown editor components MUST support the relevant subset of:

- `value?: string`
- `defaultValue?: string`
- `onValueChange?: (value: string) => void`
- `onCommit?: (value: string) => void`
- `onSubmit?: (value: string) => void`
- `placeholder?: string`
- `disabled?: boolean`
- `readOnly?: boolean`
- `autoFocus?: boolean`
- `loading?: boolean`
- `error?: React.ReactNode`
- `onError?: (error: Error) => void`
- callback-driven attachment, mention, tag, and issue-reference behavior

### 17.4 Markdown Capability Requirements

The editor and renderer MUST support:

- paragraphs and soft line breaks
- headings `#`, `##`, and `###`
- bold
- italic
- strikethrough
- inline code
- fenced code blocks with optional language tags
- blockquotes
- unordered lists
- ordered lists
- task list items using `- [ ]` and `- [x]`
- links
- automatic URL linking
- Cycle issue references

The editor SHOULD preserve images, horizontal rules, GitHub-flavored Markdown tables, and raw HTML
comments as source text when structured editing is not implemented.

### 17.5 Safety

Markdown rendering MUST treat Markdown as untrusted user content. It MUST reject unsafe protocols,
MUST NOT execute raw HTML or scripts, and MUST route external actions through callbacks where
application behavior is required.

Desktop MUST NOT import Lexical directly.

## 18. Desktop Renderer Migration Contract

### 18.1 Target Renderer Shape

Desktop renderer modules SHOULD converge on this structure:

```text
renderer/
  App.tsx                         Providers and router mount.
  Router.tsx                      Route declarations.
  screens/                        Route adapters only.
  components/                     Temporary adapter wrappers during migration.
  queries/                        React Query hooks and query keys.
  mutations/                      Mutation hooks and invalidation.
  lib/                            DTO mapping, bridge access, app helpers.
  notifications/                  Notification provider state.
  shortcuts/                      Shortcut provider state.
```

Renderer UI files that remain after migration MUST be thin adapters. They SHOULD contain little or
no Tailwind markup outside layout needed to mount UI package components.

### 18.2 Required UI Promotions

The implementation MUST evaluate and migrate reusable UI from these desktop renderer files:

- `WorkspaceScreen.tsx`
- `IssuesPanel.tsx`
- `ViewIssuePanel.tsx`
- `ViewsPanel.tsx`
- `InboxPanel.tsx`
- `RepositoryHistoryPanel.tsx`
- `RepositorySettingsPanel.tsx`
- `ApplicationSettingsPanel.tsx`
- `SetupScreen.tsx`
- `BootloaderScreen.tsx`
- `AddRepositoryStep.tsx`
- `RouteErrorScreen.tsx`
- `NotFoundScreen.tsx`

For each file, the migration MUST choose one of:

- move the reusable UI into `@cycle/ui` and leave a desktop adapter
- replace the file with an existing `@cycle/ui` component
- document why the file is desktop-specific and should remain in renderer

### 18.3 Adapter Mapping

Desktop adapters MUST map app DTOs into UI props before rendering UI components.

Example target pattern:

```tsx
const issueQuery = useIssueDetailQuery(repositoryId, issueId);
const updateIssue = useUpdateIssueMutation({ issueId, repositoryId });

return (
  <ViewIssuePage
    issue={toViewIssueModel(issueQuery.data)}
    loading={issueQuery.isLoading}
    error={toErrorMessage(issueQuery.error)}
    onTitleChange={(title) => updateIssue.mutate({ title })}
  />
);
```

UI components MUST NOT receive `issueQuery`, `updateIssue`, `queryClient`, or mutation result
objects.

## 19. Runtime Workflows

### 19.1 Component Promotion Workflow

When migrating UI from desktop to `@cycle/ui`, implementers MUST:

1. Identify runtime dependencies in the desktop component.
2. Split app state and side effects into a desktop adapter.
3. Define a plain UI prop model in `@cycle/ui`.
4. Move reusable JSX, styling, stateful controls, and layout into the appropriate UI family.
5. Replace ad hoc text with `Text` where applicable.
6. Replace ad hoc date formatting with `DateTime`.
7. Replace local menus or pickers with the shared choice foundation.
8. Add a colocated story file covering meaningful states.
9. Add behavior tests for non-trivial interaction.
10. Update desktop to render the new UI component through mapped props and callbacks.

### 19.2 Controlled and Uncontrolled Values

Editable components SHOULD support controlled and uncontrolled usage when practical.

Controlled props MUST use:

- `value`
- `onValueChange`

Uncontrolled initial props MUST use:

- `defaultValue`

Components that normalize input MUST document whether `onValueChange` emits raw input or normalized
values.

### 19.3 Loading, Empty, and Error States

List, table, panel, and page components MUST expose loading, empty, error, and unavailable states
through props. They MUST NOT infer remote loading from query objects.

Required state props SHOULD include:

- `loading?: boolean`
- `error?: React.ReactNode`
- `emptyState?: React.ReactNode`
- `disabled?: boolean`

Components MUST keep these states visually consistent through shared `EmptyState`, `PanelState`, or
equivalent components.

## 20. Styling and Layout Contract

`@cycle/ui` MUST keep Cycle's product UI quiet, dense, and work-focused.

Production components MUST:

- use tokens from `src/styles.css`
- use `cn` from `@cycle/ui/utils`
- use shared style helpers from `src/lib/styles.ts`
- use `Text` for semantic display text
- use `DateTime` for date/time display
- use lucide icons where matching icons exist
- keep card radius at `rounded-lg` or smaller unless an existing modal/dialog pattern requires
  otherwise
- define stable dimensions for rows, toolbar buttons, counters, icon buttons, grids, tables, and
  list items
- handle long labels, issue IDs, repository paths, URLs, branch names, emails, and metadata without
  overlapping
- avoid nested cards
- avoid decorative orbs, bokeh blobs, generic gradient backgrounds, and one-note palettes

Page sections SHOULD be full-width bands or unframed layouts with constrained inner content. Cards
SHOULD be reserved for repeated items, dialogs, modals, and genuinely framed tools.

## 21. Accessibility Contract

Components MUST provide accessible behavior equivalent to first-class product controls.

Requirements:

- Interactive elements MUST render as native controls or links when possible.
- Buttons MUST default to `type="button"`.
- Icon-only buttons MUST require a text label and set `aria-label`.
- Active navigation items MUST set `aria-current="page"`.
- Tabs MUST expose `role="tab"`, `aria-selected`, and a tablist parent.
- Expandable controls MUST set `aria-expanded`.
- Menu and listbox components MUST provide keyboard navigation, Escape dismissal, and selected state
  semantics.
- Invalid controls MUST set `aria-invalid`.
- Descriptions and errors MUST connect to controls with `aria-describedby`.
- Validation errors SHOULD use `role="alert"`.
- Loading indicators MUST expose a screen-reader label unless decorative.
- Popups MUST not trap focus unless they behave as dialogs.
- Disabled state MUST prevent mutation.
- Read-only state MUST allow selection and copying where text is present.

## 22. Storybook Contract

Every public atom, molecule, organism, reusable template, and reusable page MUST have one colocated
`.stories.tsx` file for that component.

That story file MUST demonstrate all meaningful states for the component, including the applicable
subset of:

- default
- loading
- empty
- error
- disabled
- invalid
- selected
- active
- read-only
- long content
- narrow viewport or constrained width
- compact and comfortable density
- light and dark theme when visual differences are meaningful

Story files MAY use multiple named stories, but they SHOULD include one high-signal `AllStates` or
`States` story when that makes visual review easier.

Stories MUST use realistic sample data without making one hard-coded product record part of the
component's production identity.

Storybook examples are not a replacement for behavior tests.

## 23. Testing and Validation Matrix

| Area                | Requirement                                                              | Validation                                                                  |
| ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Package boundary    | UI source has no app/runtime imports                                     | Extend `packages/ui/test/ui-architecture.test.ts`                           |
| Production deps     | UI package has no app/runtime production dependencies                    | Manifest scan in architecture test                                          |
| Atomic layout       | Public components live under canonical family folders                    | File-system conformance test                                                |
| Exports             | Public components export through local, family, and components barrels   | Barrel conformance test                                                     |
| Storybook coverage  | Every public component has one colocated story file                      | Existing Storybook coverage test plus family/page/template coverage         |
| Text usage          | Product organisms/pages avoid ad hoc typography classes                  | Import/style scan with documented allowlist                                 |
| DateTime usage      | Display date formatting goes through `DateTime`                          | Scan for `Intl.DateTimeFormat` and date helpers outside allowlisted modules |
| Choice consistency  | Menus/selects/autocomplete share the choice foundation                   | Component tests plus scan for local menu implementations                    |
| Desktop thinness    | Renderer UI files become adapters around UI package components           | Import and markup audit; desktop typecheck                                  |
| Controlled values   | Editable components support controlled/uncontrolled contracts            | React component tests                                                       |
| Loading/empty/error | Lists, tables, panels, and pages expose consistent state props           | Storybook stories and component tests                                       |
| Accessibility       | Controls expose labels, roles, keyboard behavior, and state attributes   | Testing Library tests and Storybook review                                  |
| Markdown safety     | Unsafe Markdown does not execute or create unsafe links                  | Markdown renderer tests                                                     |
| Markdown editor     | Markdown import/export and callbacks preserve string contracts           | Existing and expanded Markdown editor tests                                 |
| Visual regression   | Components render all states without overlap at desktop/narrow widths    | Storybook build and targeted browser screenshots where practical            |
| Desktop integration | Desktop adapters pass plain props and callbacks, not query/mutation objs | Typecheck, tests, and import scans                                          |

## 24. Failure Model and Recovery

### 24.1 Invalid Props

Components MUST avoid throwing during render for common invalid display input such as missing text,
invalid dates, empty option lists, unknown tones, unknown status values, or missing optional
metadata. They SHOULD render documented fallback states.

Developer mistakes that break required invariants MAY throw in development when that makes the
problem clear, but production UI SHOULD prefer visible fallback states for user-facing surfaces.

### 24.2 Callback Failures

`@cycle/ui` MUST NOT retry or recover app mutations. Consumers own persistence failure handling.

Components MAY expose pending, disabled, error, and draft-preservation props so adapters can keep
failed user input visible and prevent duplicate actions.

### 24.3 Formatting Failures

`DateTime` MUST render fallback content for invalid values.

`Text` MUST not alter child content beyond documented truncation, wrapping, tone, and semantic
element behavior.

Markdown import/export failures MUST preserve the last known safe Markdown string and surface
errors through `onError` where provided.

## 25. Security and Operational Safety

`@cycle/ui` MUST treat rendered user content as untrusted.

Requirements:

- Markdown MUST NOT execute raw HTML, scripts, or unsafe URLs.
- Link rendering MUST reject unsafe protocols such as `javascript:`.
- External link opening MUST be delegated through callbacks when desktop behavior is required.
- UI components MUST NOT read local files or inspect filesystem paths.
- File inputs and attachment controls MUST expose selected files only through explicit callbacks.
- Clipboard writes MUST be delegated through callbacks unless a component is explicitly documented
  as browser-only and safe.
- Error props, Storybook data, and logs MUST NOT include secrets, file contents, or private local
  paths unless explicitly supplied as display data by the consumer.

## 26. Reference Algorithms

### 26.1 Component Classification

```text
classifyComponent(component):
  if component imports query, mutation, route, Electron, API, or app runtime:
    keep or create desktop adapter
    extract presentational JSX into @cycle/ui where reusable

  if component is one semantic control or display primitive:
    place in atoms
  else if component composes controls into a compact reusable pattern:
    place in molecules
  else if component is a product region, panel, list, table, dialog, sidebar, or shell:
    place in organisms
  else if component is a slot-based reusable layout skeleton:
    place in templates
  else if component is a full-screen data-driven composition:
    place in pages
```

### 26.2 Desktop Adapter Rendering

```text
renderDesktopRoute():
  location = read route state
  queryResult = call query hooks
  mutations = create mutation hooks
  uiProps = map queryResult.data and route state into @cycle/ui prop contracts
  callbacks = map UI events into mutations, navigation, notifications, and IPC callbacks
  render @cycle/ui page or organism with uiProps, loading, error, and callbacks
```

The adapter MUST NOT pass query or mutation objects directly into UI components.

### 26.3 Choice Filtering

```text
filterChoices(sections, searchText):
  normalizedSearch = normalize(searchText)
  if normalizedSearch is empty:
    return sections

  for each option:
    searchableText = normalize(option.textValue ?? textFromReactNode(option.label))
    keywordText = normalize(join(option.keywords))
    keep option if searchableText or keywordText contains normalizedSearch

  remove empty sections unless the component explicitly renders empty sections
  preserve original option order
```

Filtering MUST NOT mutate caller-provided option objects.

### 26.4 DateTime Formatting

```text
formatDateTime(value, options):
  if value is null, undefined, or empty:
    return fallback

  date = value is Date ? value : new Date(value)
  if date is invalid:
    return fallback

  if options.format == "iso":
    return date.toISOString()

  if options.format == "relative":
    return relative formatter using options.relativeBase or now

  return Intl.DateTimeFormat(options.locale, {
    dateStyle/timeStyle or preset-derived options,
    timeZone: options.timeZone
  }).format(date)
```

The component MUST render the formatted value in a `<time>` element with `dateTime` set to the ISO
value when possible.

## 27. Implementation Checklist

Implementation is complete when:

1. `packages/ui/SPEC.md`, `packages/ui/README.md`, and `packages/ui/AGENTS.md` agree on package role,
   taxonomy, exports, and API vocabulary.
2. `Text` exists and product components use it for semantic display text.
3. `DateTime` exists and product date/time display uses it.
4. The shared choice foundation exists.
5. `Select`, `DropdownMenu`, `Autocomplete`, and multi-select/property picker components use the
   shared choice foundation.
6. Local desktop menu and picker implementations are removed or replaced by UI components.
7. Reusable status, priority, label, assignee, empty-state, panel-state, search, table, metadata,
   and inline-action components exist.
8. Desktop renderer UI surfaces listed in Section 18.2 are migrated into `@cycle/ui` or documented
   as desktop-specific adapters.
9. Desktop adapters pass plain UI props and callbacks rather than query or mutation objects.
10. Markdown editor and renderer continue to satisfy the Markdown string contract.
11. Every public component has one colocated Storybook file covering meaningful states.
12. Architecture tests enforce forbidden imports and production dependencies.
13. Conformance tests cover file layout, exports, Storybook coverage, text/date usage allowlists,
    choice behavior, controlled values, and Markdown safety.
14. `pnpm --filter @cycle/ui test` passes.
15. `pnpm --filter @cycle/ui typecheck` passes.
16. `pnpm --filter @cycle/ui storybook:build` passes.
17. `pnpm --filter @cycle/desktop typecheck` passes after desktop migration.

## 28. Optional Extensions

The following MAY be implemented after core productionization:

- visual regression testing for Storybook states
- generated component API documentation from TypeScript props
- package-level lint rules for typography and date formatting
- codemods for moving desktop UI into `@cycle/ui`
- design token documentation pages
- theming variants beyond light, dark, and system
- virtualized list and table primitives
- command palette built on the shared choice foundation
- richer Markdown editor extensions such as structured images, table editing, and mention search
