# KBar Specification

Status: Draft implementation specification

Version: 0.1.0

Date: 2026-07-03

Scope: `@cycle/contracts`, `@cycle/usecases`, `@cycle/api`, `@cycle/database`,
`@cycle/desktop`, `@cycle/ui`, and renderer tests required to support the Cycle KBar and the
shared search contract that powers it.

## 1. Purpose

Cycle MUST provide a global KBar command and search surface opened by `Command+K`, `Meta+K`, or
`Control+K`. The KBar MUST let users search across repository resources, navigate application pages
and settings, and run common actions such as creating a ticket or adding a repository without
leaving the current workflow.

The backend search capability built for KBar MUST be a reusable `/v1/search` endpoint. It MUST
return entities and resources only. UI-local commands, routes, settings entries, shortcuts, dialog
openers, and action execution MUST be assembled by the desktop renderer.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means the implementation may choose the internal mechanism, but it MUST
document the choice and expose enough information for tests and maintainers to reason about the
behavior.

## 3. Source Context

This specification is based on the current repository architecture and these local contracts:

- Root `SPEC.md` package-boundary rules.
- `packages/ui/SPEC.md` and `packages/ui/AGENTS.md` for presentational UI ownership.
- `packages/desktop/src/renderer/Router.tsx` route definitions.
- `packages/desktop/src/renderer/screens/WorkspaceScreen.tsx` shell, dialog, shortcut, route, and
  mutation wiring.
- `packages/desktop/src/renderer/shortcuts/ShortcutProvider.tsx` shortcut registry.
- `packages/ui/src/molecules/command-field/command-field.tsx` existing shell search trigger.
- `packages/api/src/http/handlers/v1/autocomplete.ts` and `packages/api/src/http/schemas.ts`
  existing autocomplete behavior.
- `packages/contracts/src/contracts/Contracts.ts` and `packages/contracts/src/schemas/Inputs.ts`
  current usecase and query schemas.

Where this specification conflicts with root `SPEC.md` on package ownership, root `SPEC.md` wins and
this specification SHOULD be revised.

## 4. Problem Statement

Cycle already has route surfaces, settings surfaces, issue creation dialogs, repository import
flows, usecase contracts, and a narrow `/v1/autocomplete` endpoint for repositories and tickets.
Those pieces are not yet composed into a single global command/search workflow.

The current gaps are:

1. The app shell has a `CommandField`, but no global floating command dialog.
2. The renderer `ShortcutProvider` ignores modifier shortcuts, so it cannot currently dispatch
   `Command+K`, `Meta+K`, or `Control+K`.
3. `/v1/autocomplete` only supports `repository` and `ticket`, and its contract is too narrow to
   become the general search substrate for KBar, mentions, pickers, and future search surfaces.
4. Pages, settings, and local actions are route and renderer concepts, not backend resources, but
   they need to appear in the same KBar result list as backend search results.
5. Users need global cross-repository search by default, not only active-repository search.
6. Common creation and repository actions already exist behind dialogs or mutations, but there is no
   unified command registry that can expose them consistently.

## 5. Goals

The KBar feature MUST:

1. Open from anywhere in the desktop renderer through `Command+K`, `Meta+K`, or `Control+K`,
   including when focus is inside text inputs, search boxes, textareas, comboboxes, or rich text
   editors.
2. Render a floating, accessible dialog with a search input and keyboard-navigable results.
3. Show local actions on an empty query, including at minimum create ticket, create initiative where
   supported by existing create-ticket options, add repository, and common settings destinations.
4. Search all registered repositories by default.
5. Use a new `/v1/search` endpoint for backend entity/resource results.
6. Keep `/v1/search` reusable for KBar, mention suggestions, picker dialogs, and future search
   surfaces through an explicit `context` parameter.
7. Keep backend search results limited to entities and resources. The backend MUST NOT return
   UI-local commands, desktop routes, settings actions, or dialog openers.
8. Let the desktop renderer merge backend resources with local pages, settings destinations, recent
   selections, and action commands.
9. Open existing dialogs for creation flows rather than collecting create-ticket or add-repository
   form fields inside KBar v1.
10. Allow useful destructive or externally visible actions only through explicit KBar actions with
    confirmation rules defined in this specification.
11. Track recent and frequent selections locally in the renderer so ranking improves without adding
    backend persistence.
12. Preserve Cycle package boundaries: `@cycle/ui` owns reusable presentational KBar UI, while
    `@cycle/desktop` owns app state, routing, API calls, mutations, and action execution.

## 6. Non-Goals

KBar v1 MUST NOT:

1. Treat the term "features" as a search category.
2. Replace the existing create ticket dialog, create initiative behavior, add repository flow, or
   settings panels.
3. Persist KBar recents or frequency data in the backend, GitDB, or repository data.
4. Include deleted tickets in backend search results.
5. Require natural-language command parsing, AI command execution, or command aliases beyond
   keyword matching.
6. Execute arbitrary shell commands, scripts, hooks, agent tools, or unregistered commands.
7. Expose backend-only usecase names directly as user-facing command labels.
8. Require a hosted search service or remote index.
9. Block future dedicated command-search endpoints if `/v1/search` later proves insufficient, but
   v1 MUST implement `/v1/search` as the reusable baseline.

## 7. System Overview

### 7.1 Package Responsibilities

`@cycle/contracts` MUST own shared search schemas:

- search query input
- search context
- search resource type
- search resource result
- search warning
- search output

`@cycle/database` MUST expose repository/resource query capabilities needed by search. It MAY reuse
existing ticket, repository, saved view, template, user, and label query paths, but it MUST NOT know
about KBar actions or desktop routes.

`@cycle/usecases` MUST expose a named search usecase, tentatively `ResourceSearch`, backed by the
shared search schemas. The usecase MUST apply state-independent validation through schemas and
delegate durable query semantics to `@cycle/database`.

`@cycle/api` MUST expose `GET /v1/search` and validate request/response data with shared schemas.
The existing `/v1/autocomplete` endpoint MAY remain as a compatibility endpoint, but it SHOULD be
implemented as a thin adapter over the same search capability once `/v1/search` exists.

`@cycle/ui` MUST provide reusable presentational components for the KBar dialog, search input,
result rows, result sections, empty state, loading state, error state, confirmation prompt, and
keyboard hints. `@cycle/ui` MUST NOT import API clients, router hooks, Electron bridges, React
Query, or non-UI Cycle runtime packages.

`@cycle/desktop` renderer MUST own:

- KBar open/closed state
- shortcut registration and global key handling
- local command, page, settings, and route registries
- API calls to `/v1/search`
- result merging and renderer-local ranking
- local recents/frequency persistence
- action execution
- confirmation decisions
- dialog opening and route navigation

### 7.2 Runtime Flow

```text
User presses Command/Meta/Ctrl+K
  -> desktop shortcut handler opens KBar
  -> KBar focuses input
  -> empty query shows local actions, settings, pages, recents
  -> non-empty query debounces local filter and /v1/search request
  -> desktop merges local results + backend resources
  -> user selects result
     -> resource result navigates to canonical route
     -> route result navigates
     -> dialog action opens existing dialog
     -> mutation action runs existing mutation path, with confirmation when required
  -> selection is recorded in renderer-local recents/frequency
  -> KBar closes unless the selected action explicitly keeps it open
```

## 8. Core Domain Model

### 8.1 Search Context

`SearchContext` identifies the frontend surface requesting search results.

Required v1 values:

- `kbar`: global command/search dialog.
- `mention`: inline mention/reference suggestions.
- `picker`: generic picker dialogs.
- `autocomplete`: compatibility behavior for existing autocomplete callers.

Unknown contexts MUST be accepted as strings only when the implementation treats them as
implementation-defined extension contexts. If strict enum validation is used, unknown contexts MUST
produce a 400 response with a stable error code.

### 8.2 Search Resource Type

The backend search contract MUST distinguish resource types from UI action types.

Required v1 backend resource types:

- `repository`: a registered local repository.
- `ticket`: a Cycle ticket or issue, including initiative-like tickets. Ticket results MUST include
  enough metadata for the renderer to label initiative-type tickets as initiatives when appropriate.
- `savedView`: a repository saved view, where saved views are queryable from the current projection.

Optional v1 resource types:

- `template`
- `label`
- `user`
- `record`

Settings pages, app pages, command actions, dialog openers, and route-only destinations MUST NOT be
backend search resource types in v1. They belong to the desktop local registry.

### 8.3 Search Resource Result

Every backend search result MUST include:

- `id`: stable identifier for the resource within its type and repository scope.
- `type`: search resource type.
- `title`: primary display title.
- `uri`: canonical application URI or app-route URI.
- `score`: finite numeric score where higher means more relevant.

Search results SHOULD include:

- `repositoryId`: required for repository-scoped resources.
- `subtitle`: compact secondary text.
- `description`: longer result context or excerpt.
- `updatedAt`: ISO timestamp when known.
- `archived`: boolean when the resource has an archived state.
- `metadata`: JSON object for type-specific renderer hints.
- `highlights`: matched snippets or ranges for query display.

Search result `metadata` MUST be JSON-serializable and MUST NOT contain secrets, raw file contents,
private tokens, or unbounded payloads.

For `ticket` results, `metadata` SHOULD include:

- `ticketType`
- `status`
- `priority`
- `labels`
- `assignee`

For `repository` results, `metadata` SHOULD include:

- `status`
- `warningCount`
- `worktreePath` or `gitDir` only when already exposed elsewhere in the app.

### 8.4 KBar Local Item

The desktop renderer MUST normalize local items and backend resources into one KBar item shape.

Each KBar item MUST include:

- `id`: stable renderer-local identifier.
- `kind`: `resource`, `route`, `setting`, or `action`.
- `title`: primary label.
- `section`: display grouping such as `Actions`, `Settings`, `Pages`, `Repositories`, or `Work`.
- `keywords`: zero or more searchable aliases.
- `disabled`: boolean or equivalent disabled state.
- `run`: renderer-owned selection handler.

Each item SHOULD include:

- `subtitle`
- `icon`
- `shortcut`
- `source`: `local`, `search`, or `recent`
- `sideEffect`: `none`, `navigate`, `open-dialog`, `write`, `destructive`, or `external`
- `confirmation`: confirmation metadata when a second user decision is required.

Backend resources MUST be wrapped as `kind: "resource"` items by the desktop renderer.

## 9. Backend Search Contract

### 9.1 Endpoint

`@cycle/api` MUST expose:

```text
GET /v1/search
```

The endpoint MUST require the same local API authorization posture as existing v1 API endpoints.

### 9.2 Query Parameters

The endpoint MUST support:

- `q`: optional search query string.
- `context`: optional search context. Default: `kbar`.
- `types`: optional comma-separated list of resource types.
- `repositoryIds`: optional comma-separated list of repository IDs. Default: all registered
  repositories visible to the current local workspace.
- `limit`: optional integer from 1 to 100. Default: 25.
- `cursor`: optional pagination cursor.
- `includeArchived`: optional boolean. Default: `false`.

The endpoint MAY support future extension parameters, but unknown parameters MUST be ignored unless
strict API validation across v1 endpoints requires rejecting them.

### 9.3 Query Semantics

When `repositoryIds` is omitted, `/v1/search` MUST search all registered repositories by default.

When `q` is empty or absent, `/v1/search` MAY return recent or high-value resources, but the KBar
desktop implementation MUST NOT depend on backend empty-query results for its default display. KBar
empty state MUST be powered by local actions, settings, pages, and recents.

The endpoint MUST NOT include deleted tickets. Archived tickets MUST NOT be returned unless
`includeArchived=true` or an implementation-defined exact identifier match policy explicitly
requires showing an archived result. If exact-match archived behavior is implemented, it MUST be
documented and covered by tests.

The endpoint MUST return deterministic results for the same indexed state, query, filters, and
cursor. Ties MAY be broken by updated timestamp and stable identifier.

### 9.4 Response Shape

The response MUST be schema-backed and MUST include:

```ts
type SearchOutput = {
  readonly results: readonly SearchResourceResult[];
  readonly warnings: readonly SearchWarning[];
  readonly page: {
    readonly nextCursor: string | null;
  };
};
```

The HTTP envelope SHOULD follow the existing API resource-envelope conventions. If a collection
envelope is used instead, the result array and warnings MUST remain explicitly represented and
schema-backed.

`SearchWarning` MUST include:

- `code`: stable machine-readable warning code.
- `message`: operator-readable message.

`SearchWarning` SHOULD include:

- `repositoryId` when the warning is repository-specific.
- `retryable` when the user can retry the search.
- `details` for bounded JSON diagnostic context.

Required warning codes:

- `REPOSITORY_UNAVAILABLE`
- `PROJECTION_STALE`
- `SEARCH_PARTIAL`

### 9.5 Error Mapping

The endpoint MUST map failures into existing API error envelopes.

Required error classes:

- Invalid query shape: HTTP 400, `INVALID_SEARCH_QUERY`, not retryable.
- Unsupported resource type: HTTP 400, `UNSUPPORTED_SEARCH_TYPE`, not retryable.
- Unauthorized request: existing v1 authorization error.
- Search dependency unavailable: HTTP 503, `SEARCH_UNAVAILABLE`, retryable.
- Response schema violation: HTTP 500, `INVALID_SEARCH_OUTPUT`, not retryable.

Repository-specific failures during global search SHOULD produce partial results plus warnings
instead of failing the entire request, unless no requested repository can be searched.

### 9.6 Ranking

Backend ranking MUST prioritize:

1. Exact identifier matches.
2. Exact normalized title matches.
3. Prefix matches on identifiers and titles.
4. Token matches across title, identifier, and aliases.
5. Body or description matches.
6. Recency where textual relevance is otherwise equal.

The backend MUST return a finite `score` for every result. The absolute score scale is
implementation-defined, but ordering MUST be stable for a given query and indexed state.

The backend MUST NOT use renderer-local recents/frequency data.

## 10. Desktop KBar Contract

### 10.1 Local Registries

The desktop renderer MUST define local registries for:

- app pages
- settings sections
- repository-scoped route destinations
- global actions
- context actions derived from the current route or selected resource

The app page registry MUST include:

- Inbox
- Chat
- Issues
- Initiatives
- Views

The settings registry MUST include:

- General
- Profile
- Agents
- Repositories
- Endpoints
- Advanced

The action registry MUST include:

- Create ticket.
- Create initiative, when the existing create-ticket options can preselect an initiative-compatible
  ticket type.
- Add repository.

The action registry SHOULD include:

- Sync repository for the active or selected repository.
- Push repository for the active or selected repository.
- Open repository settings for the active or selected repository.
- Archive current ticket when the current route has a ticket context.

The renderer MAY add more actions when they use existing mutation/dialog/navigation paths and have
explicit `sideEffect` metadata.

### 10.2 Empty Query Behavior

When KBar opens with an empty query, it MUST show local items without waiting for backend search.

The empty-query list MUST include:

- primary actions
- settings destinations
- recent/frequent selections when available

The empty-query list SHOULD include:

- top-level app pages
- active repository destinations
- recently used repositories

### 10.3 Non-Empty Query Behavior

For non-empty queries, the desktop renderer MUST:

1. Filter local pages, settings, and actions synchronously.
2. Debounce backend `/v1/search` calls.
3. Search all repositories unless the user explicitly narrows scope in a future UI.
4. Cancel or ignore stale backend responses.
5. Merge local and backend results into one keyboard-navigable list.
6. Preserve local actions in results when their labels or keywords match the query.

The debounce interval SHOULD be between 100 ms and 250 ms. Request timeouts and retry policy are
implementation-defined, but stale or failed requests MUST NOT block local results.

### 10.4 Result Merge and Renderer Ranking

The renderer MUST merge result sources in a deterministic order.

Recommended merge order for empty query:

1. Recent/frequent selections.
2. Primary actions.
3. Settings destinations.
4. Pages.
5. Active repository destinations.

Recommended merge order for non-empty query:

1. Exact local action or route matches.
2. Exact backend identifier matches.
3. Backend resource results by score.
4. Fuzzy local matches.
5. Recent/frequent matches.

Renderer-local recents/frequency MAY boost items, but MUST NOT hide exact backend matches.

### 10.5 Selection Behavior

Selecting a backend resource MUST navigate to its canonical route when the renderer can map the
resource URI. If the URI cannot be mapped, the renderer MUST show an operator-visible error and MUST
NOT silently drop the selection.

Required mappings:

- `repository` -> repository issues or repository overview destination.
- `ticket` -> `/repositories/:repositoryId/issues/:issueId`.
- `savedView` -> `/repositories/:repositoryId/views/:viewId`.

Selecting create-ticket actions MUST close KBar and open the existing `CreateIssueDialog`.

Selecting add-repository MUST close KBar and open or navigate to the existing add repository flow.

Selecting settings destinations MUST close KBar and navigate to the existing settings route.

### 10.6 Destructive and Externally Visible Actions

KBar v1 MAY expose destructive or externally visible actions when they are common and useful.

Actions that MUST require confirmation:

- delete ticket
- remove repository
- push repository

Actions that MAY execute without a second confirmation when the label is explicit:

- archive current ticket
- sync repository
- open dialog
- navigate

Every action MUST declare its `sideEffect` metadata. Actions with `sideEffect: "destructive"` MUST
declare confirmation metadata. The confirmation UI MUST show the action label and target object when
known.

## 11. Keyboard and Focus Behavior

### 11.1 Global Open Shortcut

The desktop renderer MUST support these bindings:

- `Meta+K`
- `Control+K`

On macOS, `Command+K` is represented as `Meta+K`. On Windows keyboards, the Windows key is
represented as `Meta` by browsers and Electron. The implementation MUST treat `Meta+K` and
`Control+K` as valid open shortcuts regardless of platform.

The shortcut MUST work when focus is inside editable elements. The handler MUST prevent the browser
or editor default behavior for the open shortcut and MUST NOT insert `k` into the active editor.

The implementation MAY extend the existing `ShortcutProvider` to support modifier bindings, or it
MAY add a dedicated KBar global key listener. If a dedicated listener is used, it MUST coexist with
the shortcut provider without duplicate dispatch.

### 11.2 Dialog Keyboard Behavior

When KBar is open:

- `Escape` MUST close KBar or dismiss an active confirmation step.
- `ArrowDown` and `ArrowUp` MUST move the highlighted item.
- `Enter` MUST select the highlighted item.
- `Tab` SHOULD preserve accessible focus behavior and MUST NOT trap users in an unusable state.
- Repeating the open shortcut SHOULD close KBar when no confirmation step is active.

Focus MUST move to the KBar search input when the dialog opens and MUST return to the previously
focused element when the dialog closes, unless the selected command intentionally navigates or opens
another dialog.

## 12. UI Component Contract

`@cycle/ui` MUST expose a presentational KBar component family under the atomic-design structure.
The exact component names are implementation-defined, but the public organism SHOULD be named
`KBarDialog` unless an existing naming convention makes `CommandDialog` clearer.

The public component contract MUST support:

- controlled `open` state
- controlled `query` value
- highlighted item state or callbacks sufficient for desktop control
- result sections
- item rows with title, subtitle, icon, shortcut, metadata, disabled state, and loading affordances
- empty state
- loading state
- error state
- confirmation prompt state
- callback props for query change, close, highlight change, and item selection

The component MUST be presentation-first. It MUST NOT fetch search results, call mutations, read
routes, read local storage, or use Electron APIs.

Accessibility requirements:

- The surface MUST be exposed as a modal dialog.
- The input SHOULD use combobox/searchbox semantics when practical.
- Results MUST be keyboard navigable and screen-reader understandable.
- Disabled items MUST be announced as disabled and MUST NOT execute.
- Loading and error states MUST be announced without causing focus loss.
- Icon-only controls MUST have accessible labels.

Storybook coverage MUST include:

- empty query with local actions
- mixed local and backend results
- loading search
- search failure with local results still visible
- disabled action
- destructive confirmation
- long titles and repository names
- narrow viewport

## 13. Recents and Frequency

The desktop renderer SHOULD persist KBar recents/frequency in local browser storage using a versioned
key such as `cycle.kbar.recents.v1`.

The persisted record MUST be renderer-local and MUST NOT be written to GitDB, repository data, or
the backend.

Persisted entries SHOULD include:

- item identity
- item kind
- URI or route when applicable
- last selected timestamp
- selection count
- minimal display snapshot

Persisted entries MUST NOT include raw search query strings, secret values, API tokens, full ticket
bodies, or unbounded metadata.

The renderer SHOULD cap stored entries to 100 items and SHOULD tolerate malformed storage by
discarding invalid records.

## 14. Observability

Backend search MUST emit structured logs or spans with:

- request ID
- search context
- query length, not raw query text
- requested types
- repository count
- result count
- warning count
- duration
- terminal error code when failed

Backend search MUST NOT log raw search text by default because search text may contain ticket
content, paths, names, or other sensitive project information.

Desktop KBar SHOULD emit renderer diagnostics or debug logs for:

- open shortcut received
- search request started
- stale search response ignored
- item selected
- action failed

Renderer diagnostics SHOULD avoid raw query text by default. Selection logs MAY include item kind
and stable item ID when that ID is already visible elsewhere in the app.

## 15. Failure Model and Recovery

If `/v1/search` fails while KBar is open, the renderer MUST keep local actions and routes visible and
show a concise error state for backend results.

If one repository cannot be searched during all-repository search, the backend SHOULD return partial
results with a warning instead of failing the whole request.

If the selected resource no longer exists, the renderer MUST show an operator-visible error. It MAY
offer to refresh search results.

If a local action fails, the renderer MUST surface the failure through the existing notification or
panel-state pattern and MUST NOT leave KBar in an ambiguous executing state.

If local recents storage is unavailable or invalid, KBar MUST continue to work without recents.

## 16. Security and Safety

KBar MUST execute only registered actions. It MUST NOT evaluate user-entered text as code, shell
commands, URLs, prompts, or usecase names.

All backend search requests MUST use the existing local API authorization path.

Actions MUST call existing renderer mutations, dialog openers, route navigation, or API clients.
They MUST NOT bypass existing validation, confirmation, authorization, or repository-scope checks.

Destructive action confirmations MUST be explicit enough for the user to know the action and target.

Search result metadata MUST be bounded and JSON-serializable. It MUST NOT expose secrets or
provider credentials.

## 17. Reference Algorithms

### 17.1 KBar Query Flow

```text
onKBarOpen:
  open = true
  query = ""
  highlightedIndex = first enabled empty-query item
  focus search input

onQueryChange(nextQuery):
  query = nextQuery
  localResults = filterLocalRegistry(nextQuery)

  if trim(nextQuery) is empty:
    cancel active search request
    backendResults = []
    show mergeEmptyResults(localResults, recents)
    return

  debounce:
    requestId = nextSearchRequestId()
    activeRequestId = requestId
    call GET /v1/search?q=nextQuery&context=kbar&limit=25

    on success(response):
      if requestId != activeRequestId:
        ignore response
        return
      backendResults = response.results
      warnings = response.warnings
      show mergeSearchResults(localResults, backendResults, recents)

    on failure(error):
      if requestId != activeRequestId:
        ignore error
        return
      backendError = error
      show localResults plus backend error state
```

### 17.2 Selection Flow

```text
onSelect(item):
  if item.disabled:
    return

  if item.confirmation is required:
    show confirmation prompt
    return

  executeItem(item)

executeItem(item):
  state = executing

  result = item.run()

  if result succeeds:
    recordRecent(item)
    close KBar unless item.keepOpen
    return

  state = failed
  show notification or inline error
```

## 18. Test and Validation Matrix

### 18.1 Contracts and API

- Search schemas accept valid `kbar`, `mention`, `picker`, and `autocomplete` contexts.
- Search query rejects invalid limits, unsupported types, and malformed booleans.
- `/v1/search` defaults to all registered repositories when `repositoryIds` is omitted.
- `/v1/search` excludes deleted tickets.
- `/v1/search` excludes archived tickets by default.
- `/v1/search` returns repository and ticket results with stable IDs, URIs, titles, and scores.
- Repository-specific search failures produce warnings when partial results are available.
- Response schema violations map to `INVALID_SEARCH_OUTPUT`.

### 18.2 Desktop Behavior

- `Meta+K` opens KBar when focus is in normal document body.
- `Control+K` opens KBar when focus is in normal document body.
- `Meta+K` and `Control+K` open KBar when focus is in an input, textarea, combobox, or editor.
- Empty query shows local actions without waiting for backend search.
- Non-empty query shows matching local actions and backend results.
- Stale backend responses are ignored.
- Backend search failure leaves local actions usable.
- Selecting create ticket opens the existing create issue dialog.
- Selecting add repository opens or navigates to the existing add repository flow.
- Selecting a settings result navigates to the existing settings route.
- Selecting a ticket result navigates to the repository ticket route.
- Destructive actions requiring confirmation cannot execute without confirmation.
- Recents update after successful selection and are used on the next empty-query open.
- Invalid recents storage does not break KBar.

### 18.3 UI

- KBar dialog traps and restores focus correctly.
- Arrow keys and Enter operate on enabled results.
- Escape closes confirmation first, then closes KBar.
- Loading and error states are accessible.
- Long titles, repository names, IDs, and subtitles truncate or wrap without overlap.
- Storybook builds with KBar stories for default, loading, error, confirmation, and narrow
  viewport states.

### 18.4 Package Boundaries

- `@cycle/ui` KBar components do not import `@cycle/api`, `@cycle/contracts`, `@cycle/usecases`,
  `@cycle/database`, `@cycle/desktop`, React Query, Electron, or router hooks.
- Desktop renderer owns all API calls, mutations, navigation, dialog opening, and local storage.
- API handlers depend on usecases and contracts, not desktop renderer code.
- Usecases depend on contracts and database services, not HTTP or UI packages.

## 19. Implementation Checklist

1. Add search schemas to `@cycle/contracts`.
2. Add database search gateway operations needed for repository, ticket, and saved view results.
3. Add `ResourceSearch` or equivalent named usecase in `@cycle/usecases`.
4. Add `GET /v1/search` to `@cycle/api`.
5. Decide whether `/v1/autocomplete` stays independent or delegates to the new search usecase.
6. Add presentational KBar components and Storybook coverage in `@cycle/ui`.
7. Extend or complement `ShortcutProvider` so `Meta+K` and `Control+K` work inside editable fields.
8. Add desktop KBar controller, local registries, result merging, action execution, and recents.
9. Wire the existing app shell `CommandField` to open KBar.
10. Wire create ticket, create initiative where supported, add repository, settings, and page
    commands to existing routes/dialogs.
11. Add confirmation handling for delete, remove repository, and push repository actions if exposed.
12. Add contract, API, desktop, UI, and package-boundary tests from the validation matrix.

## 20. Open Questions

No critical v1 questions remain. Optional future design decisions include:

- Whether to add a dedicated command-search endpoint after `/v1/search` has real KBar and mention
  usage.
- Whether backend search should index comments/records and expose them as first-class resources.
- Whether repository or workspace configuration should allow users to customize KBar actions.
