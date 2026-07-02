# Desktop Settings Specification

Status: Draft implementation specification

Version: 0.1.0

Target package: `packages/desktop`

## 1. Purpose

This specification defines the target Settings area for the Cycle desktop app. Settings MUST become
the developer-facing control surface for user preferences, integration and harness management,
global defaults, repository-level configuration, endpoint status, and advanced diagnostics.

The implementation target is the existing Electron desktop app. It MUST prioritize settings that can
be backed by current desktop, API, repository, agent, bootstrap, and logging code. Future modules
such as connectors, notification preferences, external MCP server management, and skill management
MAY be added later, but they MUST NOT be represented as editable settings until a real owner and
runtime contract exists.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

Implementation-defined means the implementation may choose the internal mechanism, but it MUST
document the choice and expose enough information for tests and future maintainers to reason about
it.

## 3. Current Implementation Baseline

The current desktop implementation already has these relevant surfaces:

1. `packages/desktop/src/shared/AppConfig.ts` defines schema version 3 and persists
   `profile`, `theme`, `api`, `agentProviders`, `onboarding`, and
   `localWorkspace.repositories`.
2. `packages/desktop/src/main/AppConfigLive.ts` owns `~/.cycle/app-config.json`, validates and
   salvages config, generates a static API token when missing, and writes atomically.
3. `packages/desktop/src/renderer/screens/workspace/navigation.tsx` exposes application settings
   sections for `general`, `profile`, `appearance`, `configuration`, `personalisation`,
   `keyboard-shortcuts`, `agents`, `connectors`, `mcp-servers`, and `skills`.
4. Only `general`, `profile`, `appearance`, and `agents` have meaningful settings today. The
   remaining sections are placeholders or future-module labels.
5. Repository settings are currently contextual at `/repositories/:repositoryId/settings`, not part
   of the top-level Settings sidebar.
6. Repository records already contain `autoSync`, `commitStyle`, and `sidebarExpanded`
   preferences, though the current repository settings UI only exposes `commitStyle`.
7. The local API exposes repository status, sync, and push endpoints:
   `GET /v1/repositories/:repositoryId`, `POST /v1/repositories/:repositoryId/sync`, and
   `POST /v1/repositories/:repositoryId/push`.
8. The desktop bootstrap service exposes per-repository stage, remote metadata, active snapshot,
   warning count, and last error through `BootstrapStatus`.
9. The local API exposes agent provider detection and capabilities through
   `GET /v1/agents/providers`.
10. The local API exposes global agent settings through `GET/PATCH /v1/agent-settings` and
    repository agent settings through `GET/PATCH /v1/repositories/:repositoryId/agent-settings`.
11. The only concrete agent provider ID in the current contracts is `codex`, but the provider model
    already includes capability reporting.
12. The desktop API hosts an MCP endpoint at `/mcp` when the local API is enabled and writes runtime
    discovery data containing `baseUrl`, `mcpPath`, and `mcpUrl`.
13. The desktop bridge exposes API connection details, bootstrap status, backend log path, cache
    clearing, theme state, and repository folder selection.
14. Logs are written to `~/.cycle/logs/cycle.jsonl`, app config to `~/.cycle/app-config.json`,
    the local database to `~/.cycle/cycle.db`, and agent worktrees under
    `~/.cycle/agent-worktrees`.

## 4. Problem Statement

Settings is currently a partial navigation surface rather than a complete product area. Application
settings, agent settings, repository preferences, endpoint status, and diagnostics are split across
different pages, hidden implementation details, or placeholders. The current structure creates these
problems:

1. Developers cannot see the local API and MCP endpoint status from the Settings area.
2. Developers cannot manage registered repositories from one top-level Settings section.
3. Per-repository actions such as remove, resync, pull, push, and last error inspection are not
   represented as a coherent settings workflow.
4. Harness management is not clear enough. Detection, availability, enablement, capability-driven
   defaults, and provider-specific options need one global location.
5. Placeholder Settings sections imply future functionality that is not backed by runtime modules.
6. Advanced details such as config paths, log path, database path, runtime discovery path, bootstrap
   state, and repository errors are useful to the developer audience but not organized.

Cycle needs a Settings area that is explicit about what can be configured, what is read-only
diagnostic state, what is repository-scoped, what is harness-scoped, and what is intentionally not
implemented yet.

## 5. Goals

The desktop Settings area MUST:

1. Provide top-level sections for `General`, `Profile`, `Agents`, `Repositories`, `Endpoints`, and
   `Advanced`.
2. Move repository settings into the top-level Settings hierarchy while preserving existing
   repository-specific entry points through redirects or compatible navigation.
3. Expose only settings and actions with a real backing contract in the current desktop, API,
   repository, agent, bootstrap, or logging runtime.
4. Treat developer diagnostics as first-class, always-visible settings content, not as a hidden
   mode.
5. Let developers inspect local API, MCP, harness, repository, bootstrap, database, log, and config
   status without exposing secrets.
6. Let developers manage local agent harness enablement and defaults from one global Agents section.
7. Support capability-driven harness settings so each provider can expose the correct controls.
8. Support per-repository settings and actions for repository preferences, agent overrides, sync
   operations, push operations, removal, status, logs, and last errors.
9. Define deterministic setting precedence for global defaults, harness defaults, repository
   overrides, and per-thread or per-job overrides.
10. Keep `@cycle/ui` presentational and keep API, Electron, config, and route ownership in the
    desktop renderer/main adapter layers.
11. Make conformance testable through route tests, schema tests, mutation tests, UI component tests,
    and API/IPC integration tests.

## 6. Non-Goals

This specification MUST NOT:

1. Require a hosted account system or cloud-backed settings sync.
2. Add settings for connectors, notification preferences, external MCP server management, or skill
   management before those modules have a real owner.
3. Allow editing raw `app-config.json` directly from the Settings UI.
4. Require users to configure local API host, port, or token from Settings.
5. Expose full secret values, bearer tokens, or provider credentials in the renderer.
6. Move reusable presentational settings UI into `@cycle/desktop` when it can live in `@cycle/ui`.
7. Duplicate repository, agent, bootstrap, or endpoint state in a second settings-only persistence
   store.
8. Add every possible debug knob solely because the app is developer-focused.

Optional future modules MAY define connector settings, notification settings, external MCP server
settings, skill settings, token rotation, raw config export/import, and local database reset in
separate specifications.

## 7. Settings Information Architecture

### 7.1 Top-Level Sections

The Settings sidebar MUST expose these top-level sections in this order:

1. `General`
2. `Profile`
3. `Agents`
4. `Repositories`
5. `Endpoints`
6. `Advanced`

The sidebar SHOULD group sections visually, but the route and settings identifiers MUST remain
stable. A recommended grouping is:

```text
User
  General
  Profile

Automation
  Agents

Workspace
  Repositories

Diagnostics
  Endpoints
  Advanced
```

### 7.2 Routes

The desktop renderer MUST support these application settings routes:

```text
/settings
/settings/general
/settings/profile
/settings/agents
/settings/repositories
/settings/repositories/:repositoryId
/settings/endpoints
/settings/advanced
```

`/settings` MUST resolve to `/settings/general`.

Existing repository settings entry points such as `/repositories/:repositoryId/settings` SHOULD
redirect or navigate to `/settings/repositories/:repositoryId` after the new hierarchy exists.

Unknown settings sections MUST route to a not-found state or back to `/settings/general` with no
config mutation.

### 7.3 Section Summaries

`General` MUST contain baseline app behavior, local maintenance, and appearance settings. In the
current scope it MUST include renderer cache clearing, interface theme, and interface density.

`Profile` MUST contain the local identity used by Cycle records and fallback Git identity behavior:
display name and email.

`Agents` MUST contain global agent and harness settings: harness detection, enablement, provider
defaults, model defaults, concurrency defaults, and capability-specific harness settings.

`Repositories` MUST contain a registered repository index plus one settings page per repository.

`Endpoints` MUST contain read-only local endpoint status: Cycle API endpoint, MCP endpoint, auth
presence, runtime discovery state, and availability.

`Advanced` MUST contain read-only diagnostics and lower-level developer details: filesystem paths,
log path, database path, config path, runtime discovery path, agent worktree path, bootstrap state,
repository stage summary, and recent failure summaries where available.

Settings pages MUST use a single-column panel flow. A page MUST NOT place two card or panel
surfaces side by side in the main content area; dense information SHOULD be clustered inside one
full-width panel when horizontal grouping is useful.

## 8. Domain Model

### 8.1 Setting Scope

Every setting MUST have exactly one scope:

| Scope              | Meaning                                         | Examples                                 |
| ------------------ | ----------------------------------------------- | ---------------------------------------- |
| `application`      | Applies to the local desktop profile.           | theme, density, profile, cache clear     |
| `agent-global`     | Applies to all agent work unless overridden.    | global pause, max jobs                   |
| `harness`          | Applies to one detected agent harness/provider. | enabled, default model, reasoning effort |
| `repository`       | Applies to one registered repository.           | commit style, auto sync, repo actions    |
| `repository-agent` | Applies to agent work for one repository.       | repo pause, provider override            |
| `diagnostic`       | Read-only runtime or filesystem status.         | API URL, log path, bootstrap phase       |

Settings with different scopes MUST NOT be persisted through the same mutation unless the mutation
is explicitly an aggregate adapter that delegates to each scope owner.

### 8.2 Setting Record

Each rendered setting SHOULD be representable by a record with these fields:

- `id`: stable kebab-case identifier unique within its scope.
- `scope`: one of the scopes in section 8.1.
- `title`: short user-facing label.
- `description`: concise user-facing explanation.
- `value`: current value or diagnostic state.
- `defaultValue`: default when known.
- `source`: source of the current value, such as `app-config`, `agent-settings`,
  `repository-agent-settings`, `bootstrap`, `runtime-discovery`, or `ipc`.
- `mutability`: `editable`, `action`, or `read-only`.
- `requiresConfirmation`: boolean for destructive or externally visible actions.
- `lastUpdatedAt`: timestamp when available.
- `validation`: local validation metadata when editable.

The UI MAY render settings directly from bespoke component props, but tests SHOULD assert the same
semantic contract.

### 8.3 Harness

A harness is a local agent provider detected on the developer machine.

Required fields:

- `id`: stable provider ID from the agent provider contract.
- `displayName`: human-readable harness name.
- `status`: `available`, `missing`, `degraded`, `disabled`, or `unsupported` when available from
  the API contract.
- `executableName`: command name used for detection.
- `executablePath`: absolute path when detected.
- `checkedAt`: timestamp for the latest detection result.
- `capabilities`: capability object reported by the provider.
- `models`: known models when reported by the provider.
- `configuration`: provider-reported configuration metadata.
- `message`: optional human-readable status or failure message.

The current implementation only supports the concrete provider ID `codex`. The Settings UI MUST be
implemented so additional providers can be added without redesigning the top-level Agents page.

### 8.4 Repository Settings Entity

A repository settings page MUST be keyed by `repository.id`.

Required fields:

- `repositoryId`
- `displayName`
- `path`
- `addedAt`
- `lastOpenedAt`
- `preferences.autoSync`
- `preferences.commitStyle`
- `preferences.sidebarExpanded`
- `status.stage` from bootstrap when available
- `status.currentBranch` when available
- `status.defaultRemote` and `status.defaultRemoteUrl` when available
- `status.activeSnapshotId` when available
- `status.warningCount` when available
- `status.error` when available
- `agentSettings` when available from the repository agent settings endpoint

The implementation MUST tolerate missing bootstrap status for a registered repository and show an
`Unavailable` diagnostic state rather than failing the page.

### 8.5 Endpoint Diagnostic Entity

Endpoint diagnostics MUST include:

- `api.enabled`
- `api.baseUrl`
- `api.status`: `available`, `unavailable`, or `unknown`
- `api.auth`: `configured`, `missing`, or `unknown`
- `mcp.enabled`
- `mcp.url`
- `mcp.path`
- `mcp.status`: `available`, `unavailable`, or `unknown`
- `runtimeFile.path`
- `runtimeFile.status`: `present`, `missing`, or `unreadable`
- `specUrl` when reported by runtime discovery
- `startedAt` when reported by runtime discovery
- `pid` when reported by runtime discovery

Secrets MUST be represented by presence and redacted previews only. Full tokens MUST NOT be shown by
default.

## 9. Persistence and Ownership

### 9.1 App Config

`app-config.json` MUST remain the owner for:

- onboarding completion
- profile display name and email
- theme preference
- interface density preference
- local API static configuration
- registered repositories
- repository preferences currently stored on `RepositoryRecord`

Settings implementations MUST mutate app config only through existing or new validated desktop/API
services. They MUST NOT write JSON directly from renderer code.

### 9.2 Agent Runtime Settings

The local API agent settings endpoints MUST remain the owner for:

- global agent enabled/disabled state
- global max concurrent jobs or unlimited concurrency
- default provider/harness
- default model
- enabled provider list until a migration replaces it
- repository agent pause
- repository agent disabled state
- repository agent concurrency
- repository provider and model overrides

The Settings UI MUST NOT duplicate agent runtime settings into `app-config.json`.

Mention authority MUST NOT be a configurable Settings value. The runtime MUST choose mention
authority through its fixed policy for the trigger and provider capabilities.

### 9.3 Harness Enablement Compatibility

The app config field `agentProviders.preferences` exists today and may be used by onboarding. New
Settings work SHOULD treat the local API agent settings `enabledProviders` value as the canonical
runtime enablement source until a migration explicitly reconciles these fields.

If both fields are displayed or synchronized, the implementation MUST document the reconciliation
rule and MUST test it. Silent divergence between onboarding preferences and active agent settings is
not acceptable.

### 9.4 Repository Removal

Repository removal MUST remove the repository registration from app config. It MUST NOT delete the
user's source repository directory.

Repository removal MAY leave local projection, job, or log data in place unless a separate cleanup
action is explicitly specified. If data is retained, the UI MUST describe that removal only
unregisters the repository.

### 9.5 Diagnostic State

Endpoint status, bootstrap status, log paths, runtime paths, and filesystem locations are
diagnostic state. They SHOULD be read live through IPC, API runtime discovery, bootstrap status,
and path services. They MUST NOT be cached as editable settings.

## 10. Settings Requirements by Section

### 10.1 General

The General page MUST include `General` and `Appearance` groups.

The `General` group MUST include:

- `Clear renderer cache`: action backed by Electron session cache clearing.

The clear cache action MUST:

1. Clear Electron renderer cache only.
2. Preserve repositories, app config, local database, logs, and agent runtime data.
3. Show pending, success, and failure states.
4. Be safe to retry.

The `Appearance` group MUST include:

- `Interface theme`: `system`, `light`, or `dark`
- `Density`: `compact` or `spacious`

`compact` MUST be the default density. Density MUST be persisted in app config and applied by the
renderer without requiring app restart. Invalid density values MUST fall back to `compact`.

Changing the theme MUST:

1. Persist the selected preference.
2. Sync Electron native theme source.
3. Update renderer theme state without requiring app restart.
4. Ignore invalid values.

General MAY later include additional app behavior settings when backed by config and tests.

### 10.2 Profile

The Profile section MUST include:

- `Display name`
- `Email`

Profile values MUST be validated before save:

- `displayName` MUST contain at least two non-whitespace characters.
- `email` MUST be syntactically email-like and non-empty.

Saving profile changes MUST call the validated profile update path. On failure, the UI MUST keep the
draft visible and show an error without mutating the cached query state to the failed value.

### 10.3 Agents

The Agents section MUST include these groups:

1. `Global agent work`
2. `Harnesses`
3. `Provider defaults`
4. `Harness-specific settings`

`Global agent work` MUST appear first on the Agents page and MUST include:

- global enabled/disabled control
- global concurrency, with `unlimited` and positive integer options

`unlimited` MUST be supported as an explicit value, not encoded as a large number.

`Harnesses` MUST show every provider returned by `GET /v1/agents/providers` or the fallback
provider catalog when the API is unavailable. Each harness row MUST show:

- display name
- executable name
- executable path when available
- detected status
- last checked timestamp
- status message when available
- capability summary
- enable/disable control when the provider is supported

Enable/disable changes MUST update the canonical runtime enablement source. A missing or
unsupported harness MUST NOT be enableable unless a provider-specific install/setup workflow exists.

`Provider defaults` MUST include:

- preferred provider/harness
- default model when supported or accepted by the provider

`Harness-specific settings` MUST be capability-driven. If a harness reports support for a setting,
the UI MAY render provider-specific controls such as:

- reasoning effort
- include harness-provided skills
- model family
- workspace mode
- provider-local session behavior
- host, port, or auth status for future providers that need them

Provider-specific controls MUST have stable setting IDs and typed validation. They MUST NOT appear
as editable controls when the provider does not report the required capability or configuration
schema.

The Agents page MUST NOT expose a Mention authority setting. Mention authority is implementation
policy owned by the agent runtime.

### 10.4 Repositories

The Repositories section MUST include an index page and one detail page per registered repository.

The repository index MUST show:

- display name
- path
- bootstrap stage
- current branch when available
- default remote when available
- warning count
- last error when available
- quick actions for settings, sync/pull, and push when available

Each repository detail page MUST include these groups:

1. `Repository status header`
2. `Preferences`
3. `Agent work`
4. `Remote operations`
5. `Diagnostics`
6. `Danger zone`

`Repository status header` MUST present path, current branch, default remote, default remote URL,
remotes, active Cycle snapshot, status, and warnings as clustered summary information near the top
of the page. It MUST NOT be a plain key/value table when a structured header layout can communicate
status more clearly.

`Preferences` MUST expose:

- `Commit style`: `descriptive` or `compact`
- `Auto sync`: boolean, backed by `RepositoryRecord.preferences.autoSync`
- `Sidebar expanded`: boolean, backed by `RepositoryRecord.preferences.sidebarExpanded`, when it is
  still part of the renderer navigation model

`Agent work` MUST expose repository agent settings:

- repository pause/running
- disable agent work
- max concurrent jobs
- provider override
- model override
- running, queued, waiting, and failed job counts
- health and last error when available

`Remote operations` MUST expose:

- `Resync` or `Pull`: action backed by repository sync
- `Push`: action backed by repository push

Remote operation actions MUST:

1. Be disabled while the same repository has an in-flight remote operation.
2. Surface accepted, pending, success, and failure states.
3. Refresh repository status, history, warnings, and bootstrap status after completion or accepted
   operation state.
4. Show a clear unavailable state when the repository has no default remote.

`Diagnostics` MUST show bootstrap stage, last bootstrap error, active snapshot, warning count,
materialization warnings summary, and recent repository history/log context when available.

`Danger zone` MUST include:

- `Remove repository`: unregisters the repository from Cycle desktop without deleting source files.

Remove repository MUST require confirmation and MUST clearly state that the source checkout remains
on disk.

### 10.5 Endpoints

The Endpoints section MUST be read-only in the initial implementation.

It MUST show:

- Cycle API enabled state
- Cycle API base URL
- Cycle API availability
- Cycle API spec URL when known
- MCP enabled state
- MCP URL
- MCP path
- MCP availability
- runtime discovery file path
- runtime discovery file status
- process ID and start time when known
- auth/token presence as redacted status only

The Endpoints section MUST NOT include host, port, or token editing in this version.

Rows that show openable URLs, including Cycle API, MCP, and OpenAPI spec URLs, MUST include a small
right-aligned action button that opens the URL through the desktop shell bridge. Non-URL diagnostic
rows MUST NOT show an open action.

Availability checks SHOULD be lightweight. They MAY use the runtime discovery file, the desktop
bridge API connection, and existing API client discovery. They SHOULD NOT poll aggressively when the
settings page is not visible.

### 10.6 Advanced

The Advanced section MUST always be visible.

It MUST show:

- Cycle home directory
- app config path
- database path
- log path
- agent worktree storage path
- API runtime discovery path
- CLI config path when known
- bootstrap phase
- bootstrap message
- bootstrap start and completion timestamps when available
- repository bootstrap summary
- provider detection summary
- app config schema version
- desktop package/runtime version when available

Advanced MAY include read-only previews of recent errors from bootstrap status and provider status.
It MUST NOT stream or display arbitrary full logs unless log viewing has a bounded, redacted, and
tested contract.

Advanced actions MAY include:

- reveal config file in folder
- reveal log file in folder
- reveal database file in folder
- reveal repository path

Reveal actions MUST use main-process shell APIs and MUST validate target paths.

## 11. Precedence Rules

Settings that affect agent behavior MUST resolve in this order, from lowest to highest precedence:

1. Built-in defaults
2. Global agent defaults
3. Harness-specific defaults
4. Repository agent overrides
5. Per-thread or per-job overrides

The effective value used for a job MUST be explainable by the UI or logs. When a repository uses an
inherited value, the UI SHOULD label it as inherited and show the source value.

Repository non-agent preferences MUST resolve as:

1. Built-in repository preference defaults
2. Persisted `RepositoryRecord.preferences`
3. Temporary UI state for unsaved form drafts

Endpoint and advanced diagnostics have no override precedence because they are read-only snapshots.

## 12. Workflows

### 12.1 Open Settings

When the user opens Settings, the renderer MUST:

1. Navigate to the requested settings route.
2. Load app config.
3. Load endpoint diagnostics only for `Endpoints` or `Advanced`.
4. Load agent provider and agent settings only for `Agents` or pages that render agent controls.
5. Load repository status only for visible repository settings content.

Loading failures MUST be scoped to the affected section. A failed provider query MUST NOT prevent
Profile or General from rendering.

### 12.2 Update Editable Setting

Editable setting updates MUST follow this workflow:

1. Validate locally.
2. Send mutation to the owning service.
3. Show pending state for the affected control or group.
4. On success, update or invalidate the relevant query cache.
5. On failure, preserve the user's draft when applicable and show a scoped error.

Settings mutations MUST be idempotent when the target value already equals the current value.

### 12.3 Repository Remote Operation

Repository sync/pull and push actions MUST follow this workflow:

1. Confirm the repository exists in app config.
2. Confirm the API/runtime can address the repository.
3. Submit the sync or push request.
4. Show accepted or pending state.
5. Poll or refetch repository status until the operation is no longer in a syncing stage or the
   implementation-defined timeout is reached.
6. Surface success, remote skipped, no remote, failed, and last error states.

Concurrent sync/push operations for the same repository MUST be prevented or deduplicated by the
runtime. The UI MUST not start multiple operations from repeated button clicks.

### 12.4 Remove Repository

Repository removal MUST follow this workflow:

1. Show a confirmation that includes repository display name and path.
2. On confirmation, call a validated mutation that unregisters the repository.
3. Invalidate app config, repository status, history, warnings, repository agent settings, and
   relevant workspace navigation state.
4. Navigate to `/settings/repositories` if the removed repository page was active.
5. Preserve source files on disk.

Removal failure MUST leave the repository visible and show a scoped error.

### 12.5 Harness Enablement

Harness enablement MUST follow this workflow:

1. Read detected providers and current agent settings.
2. Disable controls for missing or unsupported harnesses.
3. Persist enablement changes through the canonical agent settings mutation.
4. Recompute effective provider defaults after the enabled set changes.
5. Prevent disabling the last enabled harness if doing so would leave required agent features
   unusable, unless global agents are explicitly disabled by the same action.

The implementation MAY choose a different last-harness policy, but it MUST document and test it.

## 13. Integration Contracts

### 13.1 Desktop Renderer

The desktop renderer MUST own:

- route parsing and navigation
- query and mutation hooks
- DTO-to-UI mapping
- IPC bridge calls
- local form draft state
- settings section orchestration

The renderer MUST NOT perform direct filesystem writes or direct Electron calls outside the preload
bridge.

### 13.2 Desktop Main and Preload

Desktop main/preload MUST own:

- secure IPC for diagnostics and reveal actions
- app config path and log path lookup
- cache clearing
- API connection discovery
- bootstrap status
- shell reveal/open actions

New IPC methods MUST validate sender frame, input payloads, and target paths.

### 13.3 Local API

The local API MUST own:

- app config reads where already exposed
- profile update
- theme update
- repository open/status/sync/push
- repository preferences update
- agent provider profile listing
- agent settings
- repository agent settings
- agent jobs and job logs

Settings MUST consume API errors through normalized error envelopes and present user-meaningful
messages.

### 13.4 UI Package

`@cycle/ui` SHOULD own reusable presentational settings components:

- settings layout and section shell
- setting row
- info row
- read-only diagnostic row
- repository settings panel
- agent harness row
- endpoint status panel
- advanced diagnostics panel

`@cycle/ui` MUST NOT import `@cycle/desktop`, `@cycle/api`, Electron, React Query, or app config
services.

## 14. Failure Model and Recovery

Settings MUST handle these failure classes:

| Failure                       | Required behavior                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| App config read fails         | Show blocking settings load error with retry.                                         |
| Section query fails           | Show scoped error and keep other sections usable.                                     |
| Mutation fails                | Keep previous persisted value, preserve draft where applicable, show scoped error.    |
| Provider detection fails      | Show provider status unavailable and keep saved agent settings visible when possible. |
| API unavailable               | Show endpoint unavailable and disable API-backed actions.                             |
| Repository status unavailable | Show repository registered but status unavailable.                                    |
| Repository sync/push fails    | Show last error and leave action retryable.                                           |
| Bootstrap failed              | Show phase and error in Advanced and affected repository pages.                       |
| Runtime discovery missing     | Show endpoint status unknown or unavailable without crashing.                         |
| Invalid route repository ID   | Navigate to repository index or show not-found state.                                 |

Failures in diagnostic sections MUST NOT corrupt persisted settings.

## 15. Security and Safety

Settings MUST obey these safety rules:

1. Full API tokens, MCP tokens, provider credentials, and auth headers MUST NOT be rendered by
   default.
2. Token presence MAY be shown as `configured`, `missing`, or a short redacted preview.
3. Renderer code MUST NOT read arbitrary filesystem paths.
4. Reveal/open path actions MUST go through main-process shell services.
5. Repository removal MUST NOT delete source files.
6. Cache clearing MUST NOT delete app config, repositories, local database, logs, or agent work
   data.
7. Remote push actions MUST be explicit user actions and MUST show which repository is affected.
8. Dangerous future actions such as database reset, token rotation, and raw config import MUST
   require separate confirmation and tests before inclusion.

## 16. Observability

Settings mutations and actions SHOULD emit structured logs with:

- action name
- setting ID or operation ID
- setting scope
- repository ID when applicable
- provider ID when applicable
- success/failure status
- normalized error code/message when applicable

Logs MUST NOT include full secrets or provider credential payloads.

The Advanced section SHOULD expose the active log path so developers can inspect full logs outside
the renderer.

## 17. Reference Algorithms

### 17.1 Effective Agent Setting

```text
function effectiveAgentSetting(key, repositoryId, threadOrJobOverride):
  value = builtInDefaults[key]
  source = "built-in"

  if globalAgentSettings[key] is set:
    value = globalAgentSettings[key]
    source = "global"

  providerId = resolveProvider(repositoryId, threadOrJobOverride)
  if harnessSettings[providerId][key] is set:
    value = harnessSettings[providerId][key]
    source = "harness"

  if repositoryId is set and repositoryAgentSettings[repositoryId][key] is set:
    value = repositoryAgentSettings[repositoryId][key]
    source = "repository"

  if threadOrJobOverride[key] is set:
    value = threadOrJobOverride[key]
    source = "override"

  return { value, source }
```

### 17.2 Settings Route Resolution

```text
function resolveSettingsRoute(path):
  if path == "/settings":
    return { section: "general" }

  if path matches "/settings/repositories/:repositoryId":
    if repositoryId exists in appConfig.localWorkspace.repositories:
      return { section: "repositories", repositoryId }
    return notFound

  if path matches "/settings/:section":
    if section is one of general/profile/agents/repositories/endpoints/advanced:
      return { section }
    return notFound

  if path matches "/repositories/:repositoryId/settings":
    return redirect("/settings/repositories/:repositoryId")
```

### 17.3 Endpoint Snapshot

```text
function endpointSnapshot():
  apiConnection = readDesktopApiConnection()
  runtimeFile = readRuntimeDiscoveryFileIfKnown()

  apiBaseUrl = runtimeFile.baseUrl ?? apiConnection.baseUrl
  mcpUrl = runtimeFile.mcpUrl ?? join(apiBaseUrl, runtimeFile.mcpPath ?? "/mcp")

  return {
    api: {
      enabled: apiConnection.enabled,
      baseUrl: apiBaseUrl,
      auth: apiConnection.tokenPresent ? "configured" : "missing",
      status: healthCheck(apiBaseUrl)
    },
    mcp: {
      enabled: runtimeFile.mcpUrl is present,
      url: mcpUrl,
      path: runtimeFile.mcpPath,
      status: mcpUrl is present ? "unknown" : "unavailable"
    },
    runtimeFile
  }
```

Implementations MAY avoid active network health checks and derive status from existing API client
discovery when that is more reliable in Electron.

## 18. Test and Validation Matrix

| Area                   | Required validation                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Settings routes        | `/settings` defaults to General; known sections render; unknown sections fail safely; legacy repository settings route redirects.        |
| Sidebar hierarchy      | Sections appear in required order and repository pages are reachable.                                                                    |
| Profile                | Valid save updates config; invalid input blocks save; failed mutation preserves draft.                                                   |
| General                | Clear cache calls bridge/API once, reports pending/success/error, preserves config; theme and density persist and apply without restart. |
| Agents                 | Provider detection renders available/missing states; enablement mutation updates agent settings; missing harness controls are disabled.  |
| Capability UI          | Provider-specific controls appear only when capabilities/config schema allow them.                                                       |
| Repositories index     | Registered repos render with status, branch, remote, warnings, and error state.                                                          |
| Repository preferences | Commit style, auto sync, and sidebar preference mutations persist correctly.                                                             |
| Repository actions     | Sync/pull, push, and remove call the correct API/service and invalidate affected queries.                                                |
| Repository removal     | Requires confirmation, unregisters only, and navigates away from removed detail page.                                                    |
| Endpoints              | Shows API/MCP URLs and redacted auth status without token leakage.                                                                       |
| Advanced               | Shows config, database, log, runtime, and worktree paths from services.                                                                  |
| Failure isolation      | Provider/API/repository failures do not break unrelated sections.                                                                        |
| Security               | Tests assert secrets are redacted and renderer has no direct filesystem writes.                                                          |

## 19. Implementation Checklist

An implementation conforming to this specification MUST:

1. Replace placeholder settings sections with the required top-level hierarchy.
2. Add `/settings/repositories` and `/settings/repositories/:repositoryId` route handling.
3. Keep legacy repository settings navigation compatible.
4. Add repository index and repository detail settings views.
5. Expose repository removal through a validated service/API path.
6. Wire repository sync/pull and push actions into Settings.
7. Expose `autoSync` and `sidebarExpanded` preferences if they remain active product behavior.
8. Expand Agents into global enablement, global concurrency, harness detection, harness
   enablement, defaults, and capability-specific groups.
9. Add read-only Endpoints diagnostics for API and MCP.
10. Add always-visible Advanced diagnostics for paths, bootstrap state, provider status, and schema
    version.
11. Remove or hide connectors, external MCP server management, skills, keyboard shortcut, and
    notification settings until backed by real modules.
12. Add `@cycle/ui` presentational components where reusable settings UI is not desktop-specific.
13. Add route, schema, mutation, component, and integration tests matching section 18.
14. Document any implementation-defined behavior, especially endpoint health checks, last-harness
    disable policy, retained repository data after removal, and provider-specific setting schemas.
