# @cycle/ui Lexical Markdown Editor Specification

Status: Draft implementation specification

Version: 0.1.0

Package: `@cycle/ui`

## 1. Purpose

`@cycle/ui` MUST provide a reusable Lexical-backed Markdown editor for Cycle ticket bodies and
comments. The editor MUST replace the current textarea-centered editing behavior while preserving
the existing application contract: tickets and comments are read from and written to consumers as
Markdown strings.

The implementation MUST live in `@cycle/ui`. Consuming applications such as `@cycle/desktop` MAY
adapt app data, mutations, notifications, and routing around the editor, but they MUST NOT own the
editor runtime, Markdown conversion, toolbar behavior, slash menu behavior, or editor examples.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means an implementation may choose the behavior, but it MUST document that
choice and expose enough information for callers, tests, and future maintainers to reason about it.

## 3. Source Guidance

Editor implementation work MUST follow these local and external sources:

- `packages/ui/AGENTS.md`
- `packages/ui/README.md`
- `packages/desktop/ARCHITECTURE.md`
- `packages/database/SPEC.md`
- Lexical API documentation: `https://lexical.dev/docs/api/`
- Lexical Markdown package documentation: `https://lexical.dev/docs/packages/lexical-markdown`
- Lexical serialization documentation: `https://lexical.dev/docs/concepts/serialization`
- Lexical React plugin documentation: `https://lexical.dev/docs/react/plugins`

Where this specification and `packages/ui/AGENTS.md` differ on component placement, exports, or UI
package boundaries, `packages/ui/AGENTS.md` wins and this specification SHOULD be revised.

## 4. Problem Statement

Cycle currently exposes Markdown ticket bodies and comment bodies through plain string contracts, but
the shared UI edits those strings with textarea-based components. The current `IssueEditor` manually
wraps selected text in Markdown syntax, and `IssueCommentComposer` is a separate textarea composer.
This creates duplicated editing behavior, limits keyboard and accessibility affordances, and makes
future editor features such as structured lists, slash commands, history, auto-linking, and richer
paste handling harder to maintain consistently.

Cycle needs one reusable editor system in `@cycle/ui` that:

- edits Markdown ticket descriptions and comments with the same Lexical runtime
- preserves existing Markdown persistence and desktop RPC contracts
- gives ticket pages a full editor surface with toolbar, slash commands, attachments, and preview
- gives comments a compact submit-focused editor surface
- remains presentational and data-driven so desktop renderer code only passes values and callbacks

## 5. Goals

The Lexical Markdown editor MUST:

1. Keep Markdown strings as the canonical public value type for ticket bodies and comment bodies.
2. Use Lexical as the editing runtime for ticket descriptions, create-ticket descriptions, and
   comment composition.
3. Live entirely inside `@cycle/ui` except for consuming-app integration code that passes props and
   callbacks.
4. Preserve the existing `@cycle/desktop` persistence contract where `TicketDocument.body`,
   `CreateTicketInput.body`, `UpdateTicketPatch.body`, and comment payload `body` remain strings.
5. Provide one shared editor foundation that can render ticket and comment variants without
   duplicating Markdown conversion or command behavior.
6. Support controlled and uncontrolled React usage with `value`, `defaultValue`, `onValueChange`,
   and commit/submit callbacks.
7. Support the Cycle Markdown subset defined in Section 9.
8. Provide accessible toolbar, slash menu, keyboard shortcut, focus, disabled, read-only, and error
   states.
9. Keep editor UI visually consistent with existing Cycle dense product surfaces and design tokens.
10. Reuse `MarkdownRenderer` for preview/read-only rendering unless a replacement renderer is
    explicitly specified and covered by equivalent tests.
11. Include Storybook examples for both a ticket page/editor flow and a comment input flow.
12. Provide deterministic tests for Markdown import/export, public callbacks, keyboard submit
    behavior, and package-boundary conformance.

## 6. Non-Goals

The Lexical Markdown editor v0.1 MUST NOT:

1. Persist Lexical JSON, HTML, or editor-specific state in ticket or comment records.
2. Change `@cycle/contracts`, `@cycle/database`, `@cycle/rpc`, or `@cycle/desktop` domain schemas to
   add editor-specific payload fields.
3. Add Electron, React Query, RPC, Effect runtime, filesystem, upload, or network logic to
   `@cycle/ui`.
4. Implement collaborative editing, remote cursors, Yjs sync, or live multi-user comments.
5. Execute raw HTML, scripts, embedded iframes, or user-provided Markdown code.
6. Own attachment storage, file upload, image hosting, or mention search data fetching.
7. Require a full document-editor feature set such as page layout, drag handles, complex table
   builders, comments-on-selections, or cross-document embeds.
8. Remove `MarkdownRenderer` before all current Markdown rendering behavior has an equivalent
   tested replacement.

## 7. System Overview

### 7.1 Layer Position

The editor sits in the presentation layer:

```text
@cycle/database
  TicketDocument.body: string
  TicketDocument.bodyFormat: "markdown"
  LinkedRecord payload body: string for comments

@cycle/contracts / @cycle/rpc
  Create/update/comment payload validation and transport

@cycle/desktop renderer
  React Query, mutations, notifications, route state, desktop bridge

@cycle/ui
  Lexical Markdown editor components, renderer, examples, styling
```

`@cycle/ui` MUST remain free of runtime application packages. Production source files in `@cycle/ui`
MUST NOT import `@cycle/contracts`, `@cycle/database`, `@cycle/desktop`, `@cycle/rpc`,
`@tanstack/react-query`, `effect`, `electron`, or `react-router`.

### 7.2 Main Components

The implementation MUST provide these component responsibilities. Exact file names are
implementation-defined, but public exports MUST be stable and documented by local `index.ts` files.

- Markdown editor foundation: owns `LexicalComposer`, registered nodes, plugins, Markdown
  transformers, import/export utilities, controlled value reconciliation, and editor error handling.
- Markdown editor surface: renders the editable area, placeholder, focus frame, disabled/read-only
  state, preview toggle, optional toolbar, optional slash menu, and optional footer actions.
- Toolbar: exposes formatting commands for the supported Markdown subset through accessible icon
  buttons with labels and tooltips/titles.
- Slash menu: exposes block and insert commands with keyboard navigation, dismissal, and callback
  hooks.
- Ticket editor adapter: preserves or replaces the existing `IssueEditor` public role for ticket
  descriptions while delegating editing to the shared Markdown editor foundation.
- Comment composer adapter: upgrades `IssueCommentComposer` to use the shared Markdown editor in a
  compact submit-focused configuration.
- Renderer integration: continues to render saved Markdown through `MarkdownRenderer` or an
  equivalent shared renderer.
- Storybook examples: demonstrate the editor alone, ticket-page usage, create-ticket usage where
  applicable, and comment composer usage.

### 7.3 External Dependencies

`@cycle/ui` MUST add Lexical dependencies only to the UI package. The minimum dependency set SHOULD
include:

- `lexical`
- `@lexical/react`
- `@lexical/markdown`
- `@lexical/rich-text`
- `@lexical/list`
- `@lexical/link`
- `@lexical/code`
- `@lexical/selection`
- `@lexical/utils`

The implementation MAY add `@lexical/table`, `@lexical/html`, or `@lexical/overflow` when required
for the compatibility behavior in this specification. Lexical package versions MUST be kept aligned
with each other.

## 8. Core Domain Model

### 8.1 Markdown String

The public document value is a UTF-16 JavaScript string containing Markdown.

Required invariants:

- Empty editor content MUST export as `""`.
- Comment submit callbacks MUST receive a trimmed, non-empty Markdown string.
- Ticket body save callbacks MUST receive the Markdown string as edited, except for normalization
  defined in Section 8.4.
- Consumers MUST NOT need to read Lexical `EditorState` to persist a ticket body or comment.
- Editor internals MUST NOT expose mutable Lexical node instances through public component props.

### 8.2 Editor State

Lexical `EditorState` is an internal runtime representation.

The editor foundation MUST:

- initialize Lexical state from the Markdown string value
- export Markdown after user-visible content changes
- preserve undo/redo history during normal editing
- reset or re-import state when the controlled `value` changes to a materially different Markdown
  string
- avoid re-importing on every render when the controlled `value` is equivalent to the last exported
  Markdown value

### 8.3 Editor Modes

The editor MUST support these modes:

- `ticket`: full description editing for issue detail and create-ticket surfaces.
- `comment`: compact comment composition with submit behavior.
- `readOnly`: rendered, selectable content with no mutation.
- `disabled`: visibly inactive editing surface where user input and submit controls are disabled.

Mode names in public props are implementation-defined, but the capabilities above MUST be expressible
without application-specific wrappers.

### 8.4 Markdown Normalization

Markdown export MAY normalize syntax when the rendered meaning is unchanged. Examples include
trailing whitespace trimming on submit, consistent list marker spacing, and consistent fenced-code
backticks.

The exporter MUST NOT silently delete user-authored text. Unsupported Markdown syntax MUST remain
visible and editable as text, or MUST be converted to a semantically equivalent supported node.

## 9. Markdown Capability Requirements

### 9.1 Core Supported Subset

The editor MUST support import, editing, shortcut insertion, toolbar or command insertion, rendering,
and export for:

- paragraphs and soft line breaks
- headings `#`, `##`, and `###`
- bold
- italic
- strikethrough
- inline code
- fenced code blocks, preserving the optional language tag when present
- blockquotes
- unordered lists
- ordered lists
- task list items using `- [ ]` and `- [x]`
- links
- automatic URL linking in the editor and renderer
- issue references matching Cycle's existing `#ABC-12345`-style reference pattern

### 9.2 Compatibility Markdown

The editor SHOULD preserve the following Markdown forms when loaded from existing ticket bodies or
comments:

- images using `![alt](url)`
- horizontal rules
- GitHub-flavored Markdown tables
- raw HTML comments

The editor MAY expose these forms as plain Markdown text rather than structured rich nodes in v0.1,
but it MUST NOT drop their source text on load or export. Structured image, table, and horizontal-rule
editing MAY be implemented as optional extensions after the core subset passes validation.

### 9.3 Excluded Formatting

The core editor MUST NOT expose underline, text color, font family, font size, arbitrary HTML blocks,
or alignment controls as first-class formatting actions unless a later spec defines a safe Markdown
serialization and renderer contract for them.

Existing UI affordances that imply unsupported formatting SHOULD be removed, hidden, or converted to
plain Markdown-compatible behavior during the upgrade.

### 9.4 Attachments and Mentions

Attachment and mention UI MUST remain callback-driven.

- The editor MAY render attachment, image, or mention buttons.
- `@cycle/ui` MUST NOT upload files, inspect local filesystem paths, or fetch mention suggestions.
- Consumers MAY pass callbacks or option lists for attachments and mentions.
- If an attachment callback returns a Markdown URL, the editor MAY insert link or image Markdown.
- If no provider is supplied, mention insertion MUST degrade to plain `@` text.

## 10. Public Component Contract

### 10.1 Shared Editor Props

The shared Markdown editor public API MUST support:

- `value?: string`
- `defaultValue?: string`
- `onValueChange?: (value: string) => void`
- `onCommit?: (value: string) => void`
- `placeholder?: string`
- `disabled?: boolean`
- `readOnly?: boolean`
- `autoFocus?: boolean`
- `onError?: (error: Error) => void`
- `onAttach?: (...args: unknown[]) => void`
- variant or mode selection for ticket and comment layouts

The exact TypeScript names are implementation-defined, but `IssueEditor` and
`IssueCommentComposer` MUST continue to expose backwards-compatible string callbacks for current
desktop usage.

### 10.2 Ticket Body Contract

Ticket body editing MUST support the current `ViewIssue` flow:

- `ViewIssue` receives `description` or `defaultDescription` as a Markdown string.
- The ticket editor displays that Markdown through Lexical.
- Editing updates local editor state without requiring a desktop mutation on every keystroke.
- The editor calls `onDescriptionSave(markdown)` on commit according to Section 11.3.
- `@cycle/desktop` maps that string to `UpdateTicketPatch.body` without editor-specific conversion.

Create-ticket description editing SHOULD use the same shared editor foundation so new tickets and
existing tickets have consistent Markdown behavior.

### 10.3 Comment Contract

Comment composition MUST support the current `ViewIssue` flow:

- `IssueCommentComposer` receives optional `defaultValue` as Markdown.
- The composer submits only when the trimmed Markdown is non-empty.
- `onSubmit(markdown)` receives the trimmed Markdown string.
- After a successful synchronous `onSubmit` call, the uncontrolled composer clears itself.
- Controlled composers MUST let the parent decide when to clear `value`.

If `onSubmit` may fail asynchronously, the consuming application owns pending/error state and MAY
control the editor value. `@cycle/ui` MUST provide disabled and pending-ready visual states, but it
MUST NOT perform the mutation.

## 11. Runtime Workflows

### 11.1 Initialization

On mount, the editor MUST:

1. Build the Lexical initial config with a stable namespace per editor component family.
2. Register every node required by the supported Markdown subset.
3. Import the initial Markdown string using the shared transformer set.
4. Render the editable surface with placeholder text when the imported document is empty.
5. Register Markdown shortcuts and command plugins after nodes are available.

### 11.2 Editing and Export

On user edits, the editor MUST:

1. Let Lexical update its internal state.
2. Export the current state to Markdown with the shared transformer set.
3. Call `onValueChange` when the exported Markdown differs from the previous exported value.
4. Keep toolbar and slash-menu state synchronized with the current selection.

Markdown export SHOULD be debounced only for expensive derived UI. Public `onValueChange` semantics
MUST be documented if batching or debouncing is used.

### 11.3 Ticket Commit

Ticket body editors MUST commit when:

- the editor loses focus and the Markdown value changed
- the user triggers an explicit save command, if one is rendered

Ticket body editors SHOULD NOT submit on `Enter` or `Mod+Enter` by default because ticket
descriptions are multiline documents. Escape MAY blur the editor or close the current popup before
blur behavior runs.

### 11.4 Comment Submit

Comment editors MUST submit when:

- the submit button is activated
- `Mod+Enter` is pressed inside the editor

Comment editors MUST insert a normal line break for plain `Enter`. `Shift+Enter` MAY insert a line
break explicitly and MUST NOT submit.

### 11.5 Preview and Read-Only Rendering

Ticket editors SHOULD keep an explicit preview mode because existing issue pages expose preview
behavior. Preview mode MUST render the same Markdown string that would be committed.

Comment composers MAY omit preview mode in the compact default layout. If preview is available for
comments, it MUST be driven by the same Markdown string and renderer as ticket preview.

### 11.6 Paste and Drop

The editor MUST treat pasted text as untrusted input.

- Plain text paste MUST preserve user text.
- Markdown text paste SHOULD remain Markdown-compatible after export.
- HTML paste MAY use Lexical HTML import behavior, but persisted output MUST still be Markdown.
- Dangerous protocols and raw executable content MUST NOT become clickable or executable content in
  preview/rendered output.
- File drop behavior MUST be disabled by default or delegated through `onAttach`.

## 12. Keyboard and Accessibility Contract

The editor MUST provide accessible behavior equivalent to other first-class `@cycle/ui` controls:

- The editable region MUST expose a label through `aria-label`, `aria-labelledby`, or visible field
  structure.
- Placeholder text MUST not be the only accessible name when a better label is available.
- Toolbar buttons MUST be native buttons with text labels via `aria-label`.
- Slash-menu items MUST support keyboard navigation, selection, and Escape dismissal.
- Popups MUST not trap focus unless they behave as dialogs.
- Disabled state MUST prevent editing and submit.
- Read-only state MUST allow selection and copying.
- `Mod+B`, `Mod+I`, and `Mod+K` SHOULD map to bold, italic, and link insertion.
- Undo and redo MUST use Lexical history behavior.
- The desktop shortcut registry MUST continue to ignore active editor targets because it already
  treats `[contenteditable='true']` and `[role='textbox']` as editable.

## 13. Styling and Layout Contract

The editor MUST match Cycle UI conventions:

- Use `cn`, `focusRing`, `typography`, and design tokens from `src/lib`.
- Use lucide icons for toolbar and action buttons where matching icons exist.
- Keep controls compact and dense; do not create a marketing-style editor surface.
- Define stable dimensions for toolbar buttons, footer buttons, and composer actions.
- Avoid nested cards. Ticket page sections and comment composers MUST remain visually consistent with
  the existing `ViewIssue` layout.
- Long Markdown content, code blocks, links, and table text MUST not overflow the viewport without an
  intentional scroll or wrap behavior.

## 14. Integration Contracts

### 14.1 `@cycle/ui`

The UI package MUST own:

- Lexical dependencies in `packages/ui/package.json`
- Markdown transformers and editor utilities
- editor components and adapters
- editor styles
- Storybook stories and examples
- unit tests for editor behavior

New public components MUST export from their local `index.ts`, the relevant atomic group barrel, and
`src/components/index.ts` according to `packages/ui/AGENTS.md`.

### 14.2 `@cycle/desktop`

Desktop renderer integration MUST remain thin:

- pass ticket `issue.body` into `ViewIssue`
- receive `onDescriptionSave(markdown)` and call `ticket.issue.update` with `patch.body`
- receive `onCommentCreate(markdown)` and call `ticket.record.add` with payload `{ body: markdown }`
- pass pending, disabled, or error props only where the UI component exposes them
- keep query invalidation, notifications, route state, and Electron bridge usage in desktop code

Desktop MUST NOT import Lexical directly for ticket or comment editing.

### 14.3 Renderer

Saved Markdown MUST render through `MarkdownRenderer` or a replacement that preserves:

- safe link protocol handling
- external link callback behavior
- Cycle issue reference link behavior
- GFM task list and table rendering where currently supported
- code block overflow handling

If the editor uses a different internal renderer for editing, it MUST still export Markdown that the
shared renderer can display correctly.

## 15. Failure Model and Recovery

### 15.1 Lexical Runtime Errors

The editor MUST provide a Lexical `onError` handler. Runtime errors MUST:

- call the public `onError` callback when provided
- avoid throwing uncaught errors during normal React rendering
- preserve the last known Markdown string in component state
- render a recoverable error state or fallback editor surface instead of a blank editor

### 15.2 Markdown Conversion Failures

Import or export failures MUST NOT commit partial empty content over a non-empty existing value.

When conversion fails, the editor SHOULD:

1. keep the previous exported Markdown string
2. expose the error through `onError`
3. keep user input visible if possible
4. disable commit/submit only when the current value cannot be safely exported

### 15.3 Unsupported Content

Unsupported Markdown MUST be treated as content, not as an error. The implementation MAY normalize
unsupported structures to plain text, but it MUST NOT silently discard user text.

### 15.4 Consumer Mutation Failures

`@cycle/ui` MUST NOT retry desktop or RPC mutations. Consumers own persistence failure handling.
Components SHOULD support controlled values and disabled/pending props so consumers can keep failed
comment drafts visible and prevent duplicate submits.

## 16. Security and Safety

The editor and renderer MUST treat Markdown as untrusted user content.

- Raw HTML MUST NOT execute.
- Link rendering MUST reject unsafe protocols such as `javascript:`.
- External links MUST use safe `target` and `rel` behavior when rendered as anchors.
- The UI package MUST NOT read local files from pasted or dropped content.
- Attachment file lists MUST only be exposed through explicit callback props.
- Error callbacks and logs MUST NOT include file contents or full pasted payloads unless the user
  explicitly supplied them to that callback.

## 17. Reference Algorithms

### 17.1 Controlled Markdown Reconciliation

```text
state lastImportedMarkdown = normalizeForComparison(initialValue)
state lastExportedMarkdown = initialValue

onExternalValueChange(nextValue):
  nextComparable = normalizeForComparison(nextValue)
  if nextComparable == normalizeForComparison(lastExportedMarkdown):
    return
  if editorHasFocus and localContentDirty:
    markPendingExternalValue(nextValue)
    return
  importMarkdownIntoLexical(nextValue)
  lastImportedMarkdown = nextComparable
  lastExportedMarkdown = nextValue

onLexicalChange(editorState):
  nextMarkdown = exportMarkdown(editorState)
  if nextMarkdown != lastExportedMarkdown:
    lastExportedMarkdown = nextMarkdown
    onValueChange(nextMarkdown)
```

If a pending external value exists when the editor blurs, the implementation MUST either import it or
surface an implementation-defined conflict policy. It MUST NOT overwrite local focused edits without
documented behavior.

### 17.2 Comment Submit

```text
submitComment():
  markdown = exportCurrentMarkdown()
  trimmed = trim(markdown)
  if trimmed.length == 0:
    keep focus in editor
    return
  onSubmit(trimmed)
  if uncontrolled:
    clear editor state
```

### 17.3 Ticket Blur Commit

```text
onTicketEditorBlur(event):
  if focus moved into toolbar or slash menu:
    return
  markdown = exportCurrentMarkdown()
  if markdown == lastCommittedMarkdown:
    return
  onCommit(markdown)
  lastCommittedMarkdown = markdown
```

## 18. Test and Validation Matrix

| Area                   | Requirement                                                                             | Validation                                                        |
| ---------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Package boundary       | UI source has no desktop/runtime imports                                                | Extend or keep `packages/ui/test/ui-architecture.test.ts` passing |
| Dependencies           | Lexical packages are added only to `@cycle/ui` and versions align                       | Package manifest review and install lockfile review               |
| Markdown import/export | Core subset round-trips through the shared transformer set                              | Vitest table-driven tests for every Section 9.1 construct         |
| Compatibility Markdown | Images, horizontal rules, tables, and HTML comments are not dropped                     | Vitest fixture tests with existing Markdown examples              |
| Controlled value       | External `value` changes import once without render loops                               | React component test                                              |
| Uncontrolled value     | `defaultValue` initializes editor and local edits call `onValueChange`                  | React component test                                              |
| Ticket commit          | Blur commits changed ticket Markdown and does not commit unchanged content              | React component test                                              |
| Comment submit         | Button and `Mod+Enter` submit trimmed non-empty Markdown                                | React component test                                              |
| Empty comments         | Empty or whitespace-only comments do not call `onSubmit`                                | React component test                                              |
| Slash menu             | `/` opens commands, Escape closes, selection inserts Markdown-compatible blocks         | React component test or Storybook interaction test                |
| Toolbar                | Bold, italic, link, list, quote, and code controls mutate selection                     | React component test                                              |
| Accessibility          | Editor labels, toolbar labels, disabled/read-only states, and keyboard navigation exist | Testing Library queries plus manual Storybook review              |
| Renderer safety        | Unsafe links are not clickable and issue references still route through callbacks       | Existing or new `MarkdownRenderer` tests                          |
| Desktop integration    | Desktop passes strings and does not import Lexical                                      | Typecheck plus import scan                                        |
| Storybook              | Editor, ticket page, and comment input examples exist                                   | `pnpm --filter @cycle/ui storybook:build`                         |

## 19. Implementation Checklist

An implementation is complete when:

1. `packages/ui/package.json` includes the required Lexical dependencies.
2. A shared Lexical Markdown editor foundation exists in `@cycle/ui`.
3. The shared transformer set covers the core Markdown subset and compatibility fixtures.
4. `IssueEditor` uses the Lexical foundation while preserving existing public string callbacks.
5. `IssueCommentComposer` uses the Lexical foundation and supports compact comment submission.
6. `ViewIssue` composes the upgraded ticket and comment editors without desktop-specific state.
7. Create-ticket description editing uses the shared editor foundation or has a documented migration
   reason if deferred.
8. `MarkdownRenderer` remains compatible with editor output.
9. Storybook includes standalone editor stories, ticket page examples, and comment input examples.
10. Unit tests cover import/export, callbacks, keyboard behavior, and safety requirements.
11. `pnpm --filter @cycle/ui test` passes.
12. `pnpm --filter @cycle/ui typecheck` passes.
13. `pnpm --filter @cycle/ui storybook:build` passes.
14. `pnpm --filter @cycle/desktop typecheck` passes after desktop integration.

## 20. Optional Extensions

The following features MAY be implemented after v0.1 core conformance:

- structured image nodes with caller-provided upload/URL insertion
- structured GFM table editing
- mention suggestions with caller-provided local option lists
- reusable Markdown diff rendering from Lexical state
- character or byte limits using Lexical overflow behavior
- a read-only Lexical renderer if it fully replaces `MarkdownRenderer` safety behavior
- collaborative editing through Lexical/Yjs in a separate storage and sync specification
