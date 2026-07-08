# @cycle/config Refactor Specification

Status: draft

## 1. Purpose

This specification defines the requirements for applying the Cycle package refactor pattern to
`@cycle/config`. The package MUST become the canonical owner of Cycle configuration contracts,
configuration file persistence, CLI/API discovery helpers, app-config typed errors, and
package-local validation tests.

## 2. Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119. "Implementation-defined" means the implementation may choose the exact internal structure
as long as the public contract and validation requirements in this specification are satisfied.

## 3. Problem Statement

Configuration behavior is currently being extracted from `@cycle/desktop` into `@cycle/config`.
Consumers already import subpaths such as `@cycle/config/app-config`,
`@cycle/config/discovery`, and `@cycle/config/testing`, but test coverage and compatibility wrappers
still live mainly in downstream packages. The refactor must complete the package boundary, align the
source layout with the `@cycle/git` and `@cycle/git-store` service-file convention, and avoid changing
persisted config semantics or forcing consumers to import desktop internals.

## 4. Goals

1. `@cycle/config` MUST expose stable package entrypoints for all public configuration contracts.
2. `@cycle/config` MUST own schema-first app config models, defaults, parsing, recovery, migration,
   and persistence behavior.
3. `@cycle/config` MUST resolve the canonical app config path by using Effect `Config` and
   `Path.Path`; it MUST NOT expose a separate path service.
4. `@cycle/config` MUST own CLI/API discovery helpers shared by `@cycle/api`, `@cycle/cli`, and
   desktop runtime code.
5. Config-related errors MUST be typed Effect/Schema errors with `@cycle/config/...` tags.
6. Tests for app config parsing, persistence, recovery, and discovery MUST
   live in `packages/config/test`.
7. Downstream packages MUST import config behavior from `@cycle/config` exports, not from copied
   desktop files or relative package internals.
8. Every `Context.Service` owned by `@cycle/config` MUST live in a source file named after the base
   service and MUST export the service, live layer, and optional test layer from that same file.

## 5. Non-Goals

1. This refactor MUST NOT redesign the app config file format beyond compatibility migrations
   explicitly required here.
2. This refactor MUST NOT move Git repository orchestration, repository identity creation, agent
   provider executable detection, or desktop-specific profile/workspace workflows into
   `@cycle/config`.
3. This refactor MUST NOT make `@cycle/config` depend on `@cycle/desktop`, `@cycle/database`,
   `@cycle/git`, `@cycle/git-store`, `@cycle/api`, or `@cycle/cli`.
4. This refactor MUST NOT remove downstream compatibility wrappers in `@cycle/desktop` unless all
   consumers are migrated in the same change.

## 6. System Overview

`@cycle/config` is a shared configuration package used by desktop, CLI, API/MCP discovery, database
path helpers, and tests. It is a lower-level package than desktop runtime code. It owns durable
configuration schemas and file IO, while higher layers own workflows that interpret configuration
into application behavior.

### Components

- App config contracts: schema version, defaults, schema codecs, type exports, parser, and
  `AppConfig` service.
- App config live layer: filesystem-backed `AppConfigLive` implementation using Effect
  `FileSystem`, `Path.Path`, and `Config`.
- API discovery helpers: resolution of base URL and token from explicit inputs, environment,
  canonical app config, and runtime discovery file.
- Agent provider contracts: config-facing provider IDs and provider defaults derived from
  `@cycle/contracts`.
- Testing layers: in-memory `AppConfigTest`.
- Errors: typed recoverable configuration errors.

### External Dependencies

`@cycle/config` MAY depend on:

- `effect`
- `@effect/platform-node`
- `@cycle/contracts`

It MUST NOT depend on packages above it in the application stack.

## 7. Public Package Contract

Source files that define services MUST use PascalCase service names. Public package subpaths MAY
keep existing kebab-case names for compatibility, but the implementation source of truth MUST be the
service-named file.

The package manifest MUST expose these public subpaths when the corresponding files exist:

- `@cycle/config`
- `@cycle/config/AppConfig`
- `@cycle/config/AppConfigError`
- `@cycle/config/AppConfigSchema`
- `@cycle/config/AgentProviders`
- `@cycle/config/CycleApiDiscovery`
- `@cycle/config/agent-providers`
- `@cycle/config/app-config`
- `@cycle/config/app-config-schema`
- `@cycle/config/discovery`
- `@cycle/config/errors`
- `@cycle/config/testing`

The root `src/index.ts` MUST be a public barrel for stable config APIs. It SHOULD export the same
durable contracts available through subpaths, but it SHOULD NOT expose implementation-only helpers
whose names or behavior are not intended for consumers.

Every package export in `package.json` MUST resolve to a real file. Every public module that is used
by another package MUST be reachable through `package.json` exports.

Compatibility subpaths such as `@cycle/config/app-config`, `@cycle/config/app-config-live`, and
`@cycle/config/testing` MAY remain, but they MUST either map
directly to the service-named source files or be thin re-export wrappers. They MUST NOT contain
independent service, live-layer, or test-layer implementations.

## 8. Service File Convention

Each `Context.Service` MUST be defined in exactly one service-named source file. That file MUST
export:

- The service class, for example `AppConfig`.
- The service shape type, for example `AppConfigService` or `AppConfigServiceShape`.
- The live layer, for example `AppConfigLive`.
- Test or fixture layers when the service has package-owned test implementations, for example
  `AppConfigTest`.
- Closely coupled schemas, default values, and helper functions that form the public contract for
  that service.

Service implementations MUST NOT be split into separate `*Live.ts` files unless the base service
file re-exports the live layer and remains the public source of truth. Prefer the single-file pattern
used by `@cycle/git/GitRepository.ts` and `@cycle/git/WorktreeService.ts`.

Required service files:

- `src/AppConfig.ts` MUST export `AppConfig`, `AppConfigLive`, `AppConfigTest`, and the service
  shape. It MAY re-export app config schema contracts for compatibility, but it MUST NOT be the
  schema implementation source of truth.
- `src/AppConfigSchema.ts` MUST export the app config schemas, defaults, parser, and config-facing
  types.
- `src/CycleApiDiscovery.ts` MUST read API tokens from explicit input, environment, or
  `AppConfig.api.staticToken`; it MUST NOT read or write a separate CLI config file.

Function-only public modules MAY use service-style PascalCase filenames when they define a coherent
public API boundary:

- `src/AgentProviders.ts` for provider definitions and provider schema re-exports.
- `src/CycleApiDiscovery.ts` for API runtime discovery helpers.
- `src/AppConfigError.ts` for app config error classes and the config package error classes they
  depend on.

These function-only modules MUST NOT introduce `Context.Service` classes unless they also follow the
same service file convention.

## 9. Domain Model

### App Config

`AppConfigState` MUST remain schema-first and include:

- `schemaVersion`
- `onboarding`
- `profile`
- `agentProviders`
- `theme`
- `api`
- `localWorkspace`

The implementation MUST define defaults through functions rather than mutable shared objects for
state that can be copied or modified by consumers.

`parseAppConfig` MUST validate unknown input through Effect `Config.schema` and
`ConfigProvider.fromUnknown`. It MUST map validation failure to `AppConfigError`.

### Agent Provider Config

`@cycle/config` MUST re-export config-facing agent provider schemas and types derived from
`@cycle/contracts`. Provider defaults MUST remain centralized in `supportedAgentProviders`.

Agent provider preference recovery MUST ignore unknown provider IDs and preserve only JSON-compatible
provider config values.

### Filesystem Paths

`AppConfigLive` MUST resolve the canonical app config path as
`$HOME/.cycle/app-config.json`, using Effect `Config` to read `HOME` and Effect `Path.Path` to join
segments.

Database paths, log paths, API runtime discovery paths, and agent worktree paths are owned by the
packages that use them. `@cycle/config` MUST NOT expose a shared `CyclePaths` service or path helper
module.

### Runtime Discovery

`RuntimeDiscoveryFile` MUST accept unknown fields and support at least:

- `baseUrl`
- `mcpPath`
- `mcpUrl`
- `pid`
- `specUrl`
- `startedAt`

API discovery MUST return a normalized base URL without trailing slashes.

## 10. Runtime Workflows

### App Config Read

`AppConfigLive.read` MUST:

1. Resolve the config path from Effect `Config` and `Path.Path`.
2. Create and persist a default app config when the file is missing.
3. Generate and persist a non-empty API static token when missing.
4. Convert `api.port: "auto"` to the static default port.
5. Back up invalid JSON before writing defaults.
6. Salvage valid sections from partially invalid older config files where possible.
7. Return a value that conforms to the current `AppConfigState` schema.

### App Config Write

`AppConfigLive.replace` and `AppConfigLive.update` MUST validate the full next config before it is
persisted. Writes SHOULD be atomic by writing a temporary file in the config directory and then
renaming it over the target file.

`update` MUST map throwing mutators to `AppConfigError` and MUST NOT persist a partial update when
the mutator or validation fails.

### CLI/API Discovery

API discovery MUST use this precedence:

1. Explicit URL and explicit token.
2. `CYCLE_API_URL` and `CYCLE_API_TOKEN`.
3. Explicit token, environment token, or app config token plus runtime discovery `baseUrl`.
4. Any available token plus `CYCLE_API_URL_DEFAULT` or `http://127.0.0.1:4738`.
5. Typed unavailable error when no usable token is available.

Discovery MUST ignore unreadable or invalid runtime discovery and app config files unless the caller
invoked a lower-level strict read API.

## 11. Error Model

Recoverable config errors MUST be represented with `Schema.TaggedErrorClass` or an equivalent typed
Schema error class.

Required error tags:

- `@cycle/config/AppConfigError`
  Every error instance MUST include:

- `message`
- `operation`
- optional `cause`

Discovery-specific plain error objects MAY remain implementation-defined only if all downstream
wrappers preserve a typed `_tag`, stable `code`, and message.

## 12. Package Layout

The implementation SHOULD use this package-local layout unless a simpler equivalent is justified:

```text
packages/config/
  SPEC.md
  package.json
  src/
    AgentProviders.ts
    AppConfigError.ts
    AppConfigSchema.ts
    AppConfig.ts
    CycleApiDiscovery.ts
    index.ts
  test/
    app-config.test.ts
    discovery.test.ts
```

If implementation files are renamed, exports and consumers MUST be updated in the same change.
Stale subpath exports MUST NOT remain in `package.json`.

Legacy lower-case or kebab-case source files SHOULD be removed after consumers are migrated. If they
are temporarily retained, they MUST be wrappers that only re-export from the PascalCase source files.

## 13. Consumer Migration

Consumers MUST import public config APIs from `@cycle/config` package exports. The refactor MUST
remove or replace duplicated config logic from downstream packages.

Compatibility wrapper files in `@cycle/desktop` MAY remain when they only re-export
`@cycle/config` APIs. Wrappers MUST NOT contain independent config parsing, path derivation, or file
write logic.

Known consumer areas that MUST be checked:

- `@cycle/desktop` main/runtime config imports
- desktop renderer app-config type imports
- `@cycle/api` MCP discovery
- `@cycle/cli` discovery
- `@cycle/database` path helpers

## 14. Security and Safety

Config file writes that contain API tokens SHOULD use owner-only file permissions where supported.
Secrets MUST NOT be logged in full. Errors MAY include operation names and paths, but MUST NOT include
API token values.

The implementation MUST create config directories recursively when needed. It MUST NOT delete user
config files except by replacing the target config through the validated write flow. Invalid or
unsupported app config files MUST be renamed to timestamped backup files before defaults are written.

## 15. Observability

The package does not need metrics. Error objects MUST include stable `operation` values so callers
can log failures without parsing messages.

Recommended operation prefixes:

- `AppConfig.*`
- `CycleApiDiscovery.*`

## 16. Validation Matrix

The implementation MUST add package-local tests that cover:

| Area              | Required validation                                                                   |
| ----------------- | ------------------------------------------------------------------------------------- |
| App config schema | valid defaults parse; invalid enum values fail                                        |
| First run         | missing app config creates current defaults with generated token                      |
| API defaults      | `api.port: "auto"` migrates to default static port                                    |
| Atomic writes     | replace/update persists validated formatted JSON                                      |
| Invalid JSON      | invalid file is backed up and defaults are written                                    |
| Salvage           | valid profile/onboarding/workspace sections survive partially invalid config          |
| Theme recovery    | missing density defaults to compact; invalid preference defaults to system            |
| Agent providers   | unknown IDs are ignored; known IDs recover default/null fields                        |
| Discovery         | all precedence branches return expected base URL/token or unavailable error           |
| Service files     | service class, live layer, and optional test layer export from the service-named file |
| Testing layers    | `AppConfigTest` provides deterministic in-memory behavior                             |

Downstream packages SHOULD keep only integration tests that prove their wrappers and workflows still
compose with `@cycle/config`.

## 17. Definition of Done

The refactor is complete when:

1. `packages/config/SPEC.md` exists and matches the implemented package boundary.
2. `packages/config/package.json` exports match real files and required public modules.
3. `AppConfig.ts` exports its service, live layer, service shape, and package-owned test layer.
4. Config-owned tests live under `packages/config/test`.
5. No downstream package contains duplicate config parsing, app config persistence, Cycle path
   derivation, CLI token config, or API discovery logic.
6. Desktop compatibility files either re-export `@cycle/config` APIs or are removed after all
   imports are migrated.
7. The following commands pass:

```bash
pnpm --filter @cycle/config typecheck
pnpm --filter @cycle/config test
pnpm --filter @cycle/desktop test
pnpm --filter @cycle/api test
pnpm --filter @cycle/cli test
pnpm --filter @cycle/database test
```
