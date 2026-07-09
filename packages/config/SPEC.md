# @cycle/config Effect-Native Refactor Specification

Status: draft

## 1. Purpose

This specification defines the target implementation for `@cycle/config` as a self-contained,
Effect v4-native configuration package. The package owns Cycle configuration contracts, codecs,
filesystem persistence, runtime API connection resolution, runtime discovery files, typed errors,
and test layers.

The implementation MUST follow the package layout style used by `@cycle/git-store` and
`@cycle/git-worktrees`: service files live directly in `src/`, each service file contains its
service and live layer, low-level mechanics live under `src/internal/`, and test-only layers live
under `src/testing/`.

## 2. Normative Language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in
RFC 2119. "Implementation-defined" means the implementation may choose the exact internal
mechanism as long as the public contract, failure behavior, and validation requirements in this
specification are satisfied.

## 3. Problem Statement

The current configuration package is only partially self-contained. Durable app configuration
schemas are still owned by `@cycle/contracts`, runtime API discovery is implemented as an
imperative helper, source files import runtime-specific packages, package subpaths preserve legacy
entrypoints, and invalid persisted configuration can be silently salvaged.

The refactor must make `@cycle/config` the canonical configuration boundary. Configuration must be
implemented with Effect v4 primitives, especially `Config`, `ConfigProvider`, `Schema` codecs,
`Context.Service`, `Layer`, and typed schema-backed errors. Missing fields may default through
codecs. Present but invalid values must fail with typed errors.

## 4. Goals

1. `@cycle/config` MUST be self-contained and MUST own all config-domain schemas, codecs, defaults,
   services, layers, errors, and test layers.
2. Source files under `src/`, including `src/testing/`, MUST import only from `effect` and
   package-local relative files.
3. Source files under `src/` MUST NOT import `@cycle/contracts`, `@effect/platform-node`,
   `node:*`, or any higher-level Cycle package.
4. Each public service MUST live in a PascalCase service file directly under `src/` and MUST export
   the service class, service shape type, and live layer from that same file.
5. Low-level filesystem, JSON, path, string, token, and config-provider helpers MUST live under
   `src/internal/`.
6. Test-only layers and fixtures MUST live under `src/testing/`.
7. Public consumers MUST import from `@cycle/config` only. The package MUST NOT expose subpath
   exports such as `@cycle/config/app-config`, `@cycle/config/discovery`, or
   `@cycle/config/testing`.
8. The implementation MUST use schema codecs directly for durable app config JSON decoding,
   encoding, defaulting, normalization, and validation.
9. Missing persisted app config fields MAY default through `Schema.withDecodingDefaultTypeKey` or
   `Schema.withDecodingDefaultType`. `Config.withDefault` MUST be used only for Effect `Config`
   inputs such as environment variables and path settings, not for persisted app config JSON fields.
   Present invalid values MUST fail.
10. Runtime API discovery MUST be replaced by an Effect-native `CycleApiConnection` service whose
    result is derived from composed config sources.
11. Effect `Config` and `ConfigProvider` MUST be used for environment and runtime source
    composition. They MUST NOT be the canonical decoder for persisted app config JSON unless the
    implementation supplies a custom provider that preserves the difference between missing fields
    and present invalid values.

## 5. Non-Goals

1. This refactor MUST NOT preserve legacy package subpaths or shim files.
2. This refactor MUST NOT provide Promise-returning convenience APIs from package source.
3. This refactor MUST NOT use zero-argument thunks that only return an `Effect`.
4. This refactor MUST NOT silently salvage invalid persisted values.
5. This refactor MUST NOT make `@cycle/config` own Git, worktree, database, desktop, API server, or
   agent workflow behavior.
6. This refactor MUST NOT provide platform runtime layers. Application entrypoints and tests remain
   responsible for providing platform services such as filesystem, path, and crypto layers.

## 6. Source Layout

The target source tree MUST be:

```text
packages/config/src/
  AppConfig.ts
  AppConfigFile.ts
  AppConfigSchemas.ts
  ConfigErrors.ts
  ConfigSources.ts
  CycleApiConnection.ts
  CycleApiConnectionSchemas.ts
  RuntimeDiscovery.ts
  RuntimeDiscoverySchemas.ts
  index.ts

  internal/
    atomicFile.ts
    paths.ts
    strings.ts
    token.ts

  testing/
    index.ts
```

`src/internal/` is singular to match `@cycle/git-store` and `@cycle/git-worktrees`.

The package manifest MUST expose the runtime API separately from test layers:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/index.ts"
  }
}
```

Runtime consumers MUST import from `@cycle/config`. Tests MAY import deterministic layers from
`@cycle/config/testing`. Consumers MUST NOT import package source files.

## 7. System Overview

### 7.1 Components

- `AppConfigSchemas.ts` owns the app config schema, codecs, defaults, encoded/decoded types,
  constants, and codec-level normalization.
- `AppConfigFile.ts` owns the persisted app config file boundary.
- `AppConfig.ts` owns the high-level app config service used by the rest of the application.
- `ConfigSources.ts` owns reusable Effect `Config` and `ConfigProvider` helpers for environment,
  runtime, and explicit-input source composition. It MUST NOT own persisted app config decoding.
- `RuntimeDiscoverySchemas.ts` owns the runtime discovery file codec.
- `RuntimeDiscovery.ts` owns runtime discovery file read/write/delete behavior.
- `CycleApiConnectionSchemas.ts` owns the codec for resolving a usable API connection.
- `CycleApiConnection.ts` replaces imperative API discovery with an Effect service that composes
  explicit input, active config values, runtime discovery, app config, and defaults while retaining
  source provenance.
- `ConfigErrors.ts` owns all schema-backed recoverable errors.
- `src/internal/*` owns implementation mechanics only and MUST NOT be imported by consumers.
- `src/testing/*` owns deterministic test layers and fixtures only.

### 7.2 External Dependencies

Source under `src/`, including `src/testing/`, MUST depend only on:

- `effect`
- package-local relative modules

Package-local tests under `packages/config/test` MAY depend on `@effect/platform-node`, `vitest`,
and Node built-ins. Application entrypoints outside this package MAY provide platform services from
`@effect/platform-node` or another runtime.

## 8. Core Domain Model

### 8.1 AppConfigState

`AppConfigState` MUST be owned by `AppConfigSchemas.ts`. The current decoded model MUST contain:

- `schemaVersion`: finite number matching `CURRENT_APP_CONFIG_SCHEMA_VERSION`.
- `onboarding`: onboarding completion state.
- `profile`: display name and email settings.
- `agentProviders`: config-facing provider preferences.
- `theme`: interface density and theme preference.
- `api`: local API enablement and authentication settings.
- `localWorkspace`: remembered repository records.

The package MUST own config-facing agent provider identifiers and provider preference schemas. It
MUST NOT import provider schemas from `@cycle/contracts`. Decoded authentication secrets in
`AppConfigState` MUST be represented as `Redacted.Redacted<string>` or a package-owned opaque token
type backed by `Redacted`. Encoded persisted JSON MAY store those values as plain strings.

### 8.2 Defaults

Defaults MUST be expressed through functions and codecs, not mutable shared objects.

Missing persisted JSON fields MAY default through schema defaults. Present invalid values MUST NOT
default. App config codecs MUST be decoded with `Schema.decodeUnknownEffect` or
`Schema.decodeEffect`, not through `Config.schema(ConfigProvider.fromUnknown(...))`, so present
`null`, wrong-type objects, wrong-type arrays, and invalid scalars remain validation failures.

Examples:

- Missing `theme.preference` MAY default to `"system"`.
- Missing `theme.density` MAY default to `"compact"`.
- Missing `api.port` MAY default to `4738`.
- Missing `api.staticToken` MUST generate a token through an effectful schema default that is run by
  direct schema decoding with the required `Crypto` service, or by an immediately adjacent
  `AppConfig.read` effect before persistence. If the codec owns token generation, it MUST NOT be
  decoded through `Config.schema`.
- Present `theme.preference: "sepia"` MUST fail.
- Present `api.port: "auto"` MUST fail unless `"auto"` is explicitly part of the current schema.
- Present `api.staticToken: ""` MUST fail.

### 8.3 RuntimeDiscoveryFile

`RuntimeDiscoveryFile` MUST be owned by `RuntimeDiscoverySchemas.ts`. It MUST support:

- `baseUrl`
- `mcpPath`
- `mcpUrl`
- `pid`
- `specUrl`
- `startedAt`

Runtime discovery MAY accept unknown fields so that API server writers can add metadata without
breaking older readers. Known fields with invalid values MUST fail strict decoding.

### 8.4 CycleApiConnection

`CycleApiConnection` is the Effect-native replacement for the old discovery helper. Its purpose is
to answer: "How should this process connect to the local Cycle API right now?"

The resolved value MUST include:

- `baseUrl`: normalized API base URL without trailing slashes.
- `token`: `Redacted.Redacted<string>` or a package-owned opaque token type backed by `Redacted`.
- `source`: metadata describing which source supplied `baseUrl` and which source supplied `token`.
  Source values MUST be explicit tagged values such as `"explicit"`, `"env"`,
  `"runtimeDiscovery"`, `"appConfig"`, and `"default"`.

`CycleApiConnection` MUST NOT start the API server. It only resolves connection configuration from
available config sources.

## 9. File and Config Contracts

### 9.1 App Config File

The canonical app config file MUST be:

```text
$HOME/.cycle/app-config.json
```

`HOME` MUST be read through Effect `Config`, not through `process.env`. Path construction MUST use
Effect `Path.Path`.

`AppConfigFile` MUST expose file-boundary operations. The exact shape MAY be refined during
implementation, but it MUST support:

- resolving the canonical config path;
- reading the raw persisted document as optional unknown JSON;
- writing encoded canonical app config JSON atomically;
- reporting typed errors for path, read, parse, encode, and write failures.

Persisted app config JSON MUST be decoded directly with `Schema.decodeUnknownEffect(AppConfigCodec)`
or `Schema.decodeEffect(AppConfigCodec)`. The implementation MUST NOT decode persisted app config
by building `ConfigProvider.fromUnknown(raw)` and running `Config.schema(AppConfigCodec)` because
Effect `ConfigProvider` semantics treat `null` and `undefined` as missing data and can erase the
difference between an absent key and an invalid present value.

Effect `Config` and `ConfigProvider` MAY still be used to read process/runtime inputs such as
`HOME`, `TMPDIR`, `CYCLE_API_URL`, and `CYCLE_API_TOKEN`, where missing-only fallback through
`Config.withDefault` or `ConfigProvider.orElse` is intentional.

### 9.2 Runtime Discovery File

The runtime discovery file path MUST be resolved in this order:

1. `CYCLE_API_RUNTIME_FILE` from Effect `Config`;
2. a temp directory from `TMPDIR`, `TMP`, or `TEMP` through Effect `Config`;
3. `/tmp` when no temp directory config is present.

The default filename SHOULD be stable for the current user without reading `process` directly. The
implementation MAY use config values such as `CYCLE_USER_ID` or `USER` to derive a suffix. The
fallback suffix MUST be `"user"`.

### 9.3 Public Imports

All public symbols MUST be imported from:

```ts
import { AppConfig, AppConfigLive } from "@cycle/config";
import { AppConfigTest } from "@cycle/config/testing";
```

The following imports MUST NOT be valid after the refactor:

```ts
import { AppConfig } from "@cycle/config/app-config";
import { CycleApiDiscovery } from "@cycle/config/discovery";
```

## 10. Runtime Workflows

### 10.1 App Config Read

`AppConfig.read` MUST:

1. Resolve the canonical app config path.
2. Read the persisted JSON document if it exists.
3. If the file is missing, decode an empty encoded document through the app config codec with
   `Schema.decodeUnknownEffect`, write the canonical encoded config, and return the decoded value.
4. If the file exists but is not valid JSON, fail with a typed error.
5. Decode the parsed JSON directly through `Schema.decodeUnknownEffect(AppConfigCodec)` or
   `Schema.decodeEffect(AppConfigCodec)`.
6. Provide any schema decoding services required by app config defaults, including `Crypto` when
   token generation is codec-owned.
7. Default only missing fields.
8. Fail on present invalid values, including explicit `null`, wrong-type objects, wrong-type arrays,
   invalid enum values, empty tokens, and out-of-range numbers.
9. Encode the decoded value with `Schema.encodeEffect(AppConfigCodec)`.
10. If encoding differs from the persisted canonical representation because missing fields were
    filled, write the canonical encoded config atomically.
11. Return the decoded app config.

The read workflow MUST NOT back up invalid JSON and write defaults as a recovery path. Explicit
repair tooling MAY be added later, but it is out of scope for this refactor.

### 10.2 App Config Update

`AppConfig.update` MUST:

1. Acquire the service's update semaphore.
2. Read the current config and persist any canonical defaults.
3. Run a pure mutator inside `Effect.try`, or run an effectful mutator through `updateEffect`.
4. Encode and validate the complete result.
5. Write it atomically before releasing the semaphore.

The service MUST NOT persist partial updates when the mutator, validation, encoding, or write fails.

### 10.3 Runtime Discovery Read and Write

`RuntimeDiscovery.write` MUST encode the supplied value through `RuntimeDiscoveryFile` and write it
atomically. `RuntimeDiscovery.read` MUST decode the file strictly when present. Missing files MUST
return an explicit missing state or `Option.none`; malformed files MUST fail with a typed error.

### 10.4 Cycle API Connection Resolution

`CycleApiConnection.resolve` MUST derive a connection from independent base URL and token sources.
This is the improved replacement for the old `discoverCycleApi` helper.

Base URL precedence MUST be:

1. explicit input;
2. `CYCLE_API_URL`;
3. runtime discovery file `baseUrl`;
4. `CYCLE_API_URL_DEFAULT`;
5. app config host and fixed port when app config supplies the token;
6. built-in default `http://127.0.0.1:4738`.

Token precedence MUST be:

1. explicit input;
2. `CYCLE_API_TOKEN`;
3. `AppConfig.api.staticToken`.

The resolver MUST normalize `baseUrl` by removing trailing slashes. If no token is available, it
MUST fail with a typed unavailable error.

The resolver SHOULD use Effect `Config` and `ConfigProvider` for reading environment-backed inputs,
including `Config.redacted` or an equivalent redacted schema for token values. The resolver MUST
retain source provenance. Plain `ConfigProvider.orElse` composition MUST NOT be used by itself for
values whose source must be reported, because fallback providers do not carry provenance metadata.
If provider composition is used, provenance MUST be encoded in the value or captured before the
fallback is applied.

The resolver SHOULD be implemented as small tagged source effects:

```ts
type ConnectionSource = "explicit" | "env" | "runtimeDiscovery" | "appConfig" | "default";

type TaggedValue<A> = {
  readonly source: ConnectionSource;
  readonly value: A;
};
```

The implementation MAY then decode and normalize the selected `TaggedValue` through a
`CycleApiConnectionConfig` schema. This keeps schema validation central without hiding source
selection inside open-coded nested branching.

## 11. Service Contracts

### 11.1 AppConfig

`AppConfig.ts` MUST export:

- `AppConfig`
- `AppConfigLayer`
- `AppConfigLive`

The service shape MUST expose effect values for zero-argument operations and functions only when
input is required.

Required operations:

- `configPath: Effect.Effect<string, AppConfigError>`
- `read: Effect.Effect<AppConfigState, AppConfigError>`
- `update(mutator): Effect.Effect<AppConfigState, AppConfigError>`
- `updateEffect(mutator): Effect.Effect<AppConfigState, AppConfigError | E, R>`

### 11.2 AppConfigFile

`AppConfigFile.ts` is an internal supporting service and MUST provide:

- `AppConfigFile`
- `AppConfigFileLive`

Required operations:

- `path: Effect.Effect<string, AppConfigFileError>`
- `read: Effect.Effect<Option.Option<string>, AppConfigFileError>`
- `write(text: string): Effect.Effect<void, AppConfigFileError>`

This service owns the persisted app config file boundary and delegates native mechanics to
`src/internal/*`.

### 11.3 ConfigSources

`ConfigSources.ts` MUST export package-owned helpers for reading and composing non-persisted config
sources. It is not required to be a `Context.Service`.

The exact helper names MAY be refined during implementation, but the module MUST support:

- reading optional and required string, URL, port, temp-directory, and redacted-token values through
  Effect `Config`;
- building testable `ConfigProvider.fromEnv` or `ConfigProvider.fromUnknown` values for runtime
  and environment sources;
- tagging source provenance before fallback when provenance is part of the public result;
- applying `Config.withDefault` only where missing-data fallback is intended.

`ConfigSources.ts` MUST NOT expose an `AppConfigProvider` service and MUST NOT use
`ConfigProvider.fromUnknown` plus `Config.schema` to decode persisted app config JSON.

### 11.4 RuntimeDiscovery

`RuntimeDiscovery.ts` MUST export:

- `RuntimeDiscovery`
- `defaultRuntimeDiscoveryPath`
- `RuntimeDiscoveryLive`

This service owns the runtime discovery file boundary.

Required operations:

- `path: Effect.Effect<string, RuntimeDiscoveryError>`
- `read: Effect.Effect<Option.Option<RuntimeDiscoveryFile>, RuntimeDiscoveryError>`
- `write(file: RuntimeDiscoveryFile): Effect.Effect<void, RuntimeDiscoveryError>`
- `remove: Effect.Effect<void, RuntimeDiscoveryError>`

### 11.5 CycleApiConnection

`CycleApiConnection.ts` MUST export:

- `CycleApiConnection`
- `CycleApiConnectionLayer`
- `CycleApiConnectionLive`

This service replaces `discoverCycleApi` and `discoverCycleApiEffect`. It MUST expose Effect-native
operations only.

Required operations:

- `current: Effect.Effect<CycleApiConnectionResult, CycleApiConnectionError>`
- `resolve(input: CycleApiConnectionInput): Effect.Effect<CycleApiConnectionResult, CycleApiConnectionError>`

`CycleApiConnectionInput` MAY accept explicit token input as either a plain string or a redacted
token wrapper. Plain explicit token strings MUST be wrapped in `Redacted` before they leave the
resolver boundary. `CycleApiConnectionResult.token` MUST always be redacted or package-opaque.

`current` is an Effect value for the default no-explicit-input case. `resolve` is a function because
it requires caller input. Neither operation is a zero-argument thunk.

## 12. Error Model

Recoverable errors MUST use `Schema.TaggedErrorClass`.

The package SHOULD define a small set of error classes in `ConfigErrors.ts`, for example:

- `AppConfigError`
- `ConfigFileError`
- `RuntimeDiscoveryError`
- `CycleApiConnectionError`

File and app config errors MUST include:

- `message`
- `operation`
- optional `cause`

Connection errors MUST include a stable `code`, a safe message, and an optional cause.

Errors involving secrets MUST NOT include token values. If a schema or platform error may stringify
the offending token, the package MUST map it to a sanitized package error before exposing it.

## 13. Implementation Rules

1. Multi-step Effect code MUST use `Effect.gen`.
2. Functions that return effects SHOULD use `Effect.fn("name")` when practical.
3. `Effect.fn` names SHOULD match the function name.
4. Zero-argument thunks that only return an Effect MUST NOT be used.
5. Boundary code MUST be wrapped deliberately:
   - `Effect.succeed` for already-available values;
   - `Effect.sync` for non-throwing synchronous side effects;
   - `Effect.try` for throwing synchronous code;
   - `Effect.tryPromise` for Promise APIs.
6. All thrown or rejected causes MUST be mapped into typed package errors.
7. Services MUST be defined with `Context.Service`.
8. Live implementations MUST use `Service.of`.
9. Layers MUST remain focused and composed with `Layer.provide`, `Layer.provideMerge`, or
   `Layer.mergeAll`.
10. Dynamic layer selection from config MUST use `Layer.unwrap`.
11. Source under `src/` MUST NOT read `process.env`, `globalThis.process`, or Node globals directly.
    Runtime values MUST come from Effect services such as `Config`, `Clock`, `Random`, `Crypto`,
    `FileSystem`, or `Path`.
12. Durable app config JSON MUST be decoded with `Schema.decodeUnknownEffect` or
    `Schema.decodeEffect`, not with `Config.schema` over `ConfigProvider.fromUnknown`.
13. `Config.withDefault` MUST be used only for missing Effect `Config` inputs. It MUST NOT be used
    to recover invalid persisted app config values.
14. `ConfigProvider.orElse` and `ConfigProvider.layerAdd` MAY be used for missing-only runtime
    fallback, but MUST NOT be the only mechanism for public source provenance.

## 14. Security and Safety

1. API tokens MUST never be logged in full.
2. Error messages MUST NOT include token values.
3. Decoded token values MUST be carried as `Redacted.Redacted<string>` or a package-owned opaque
   wrapper backed by `Redacted`. Plain token strings MAY exist only at persistence, config-provider,
   and HTTP/auth boundary code, and MUST be unwrapped in the smallest practical scope.
4. Config writes containing tokens SHOULD use owner-only file permissions where supported by the
   active filesystem implementation.
5. Writes MUST be atomic: write a temporary file in the same directory, then rename it over the
   target file.
6. The implementation MUST create parent directories recursively when needed.
7. The implementation MUST NOT delete user config files as part of normal read or write workflows.
8. Invalid persisted config MUST fail visibly instead of being silently replaced.

## 15. Observability

The package does not need metrics. Typed errors MUST include stable operation names so callers can
log failures without parsing messages.

Recommended operation prefixes:

- `AppConfig.*`
- `AppConfigFile.*`
- `ConfigSources.*`
- `RuntimeDiscovery.*`
- `CycleApiConnection.*`

Logs, when added by callers, MUST redact API tokens. Package-owned errors and service results MUST
be safe to log without revealing full token values.

## 16. Validation Matrix

| Area                   | Required validation                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package boundary       | Runtime code is exported from `"."`; deterministic test layers are exported from `"./testing"`.                                                         |
| Source imports         | `packages/config/src` imports only `effect` and relative files.                                                                                         |
| Self-contained schemas | `packages/config/src` does not import `@cycle/contracts`.                                                                                               |
| Platform independence  | `packages/config/src` does not import `@effect/platform-node`, `node:*`, or read `process.env` / `globalThis.process`.                                  |
| App config defaults    | Missing file creates canonical config with generated token.                                                                                             |
| Missing fields         | Missing fields default through codecs and canonical config is persisted.                                                                                |
| Persisted JSON decode  | App config reads use direct `Schema.decodeUnknownEffect` or `Schema.decodeEffect`, not `Config.schema(ConfigProvider.fromUnknown(...))`.                |
| Invalid fields         | Invalid enum, invalid port, empty token, explicit `null`, wrong-type object, wrong-type array, or malformed section fails without writing defaults.     |
| Effectful defaults     | Missing `api.staticToken` is generated with required Effect services and does not rely on `Config.schema` accepting serviceful schema defaults.         |
| Invalid JSON           | Malformed app config JSON fails with a typed error and is not replaced.                                                                                 |
| Update                 | Pure and effectful updates are serialized; failing mutators do not write.                                                                               |
| Atomic write           | Writes use temp file plus rename in the target directory.                                                                                               |
| Runtime discovery      | Missing runtime file is represented as missing; malformed runtime file fails strict read.                                                               |
| API connection         | Explicit URL and token win independently.                                                                                                               |
| API connection         | Explicit URL can combine with env or app config token.                                                                                                  |
| API connection         | Env URL and token are honored.                                                                                                                          |
| API connection         | Runtime base URL can combine with explicit, env, or app config token.                                                                                   |
| API connection         | Default URL is used only when no higher-priority URL exists.                                                                                            |
| API connection         | Missing token fails with typed unavailable error.                                                                                                       |
| API connection         | Source metadata correctly reports the selected base URL source and token source for every precedence path.                                              |
| Secrets                | App config and API connection decoded tokens are redacted values; service result stringification, JSON output, and errors do not reveal token contents. |
| Testing layers         | Test layers provide deterministic in-memory behavior through `@cycle/config/testing`.                                                                   |

## 17. Definition of Done

The refactor is complete when:

1. `packages/config/SPEC.md` matches the implemented package boundary.
2. `packages/config/package.json` exposes runtime and testing entrypoints separately.
3. All config-domain schemas and defaults are owned by `packages/config/src`.
4. `packages/config/src` imports only `effect` and package-local relative files.
5. No source file under `packages/config/src` imports `@cycle/contracts`, `@effect/platform-node`,
   `node:*`, or higher-level Cycle packages.
6. Public services and live layers follow the service-file convention in this spec.
7. Low-level mechanics live under `src/internal/`.
8. Test layers live under `src/testing/` and are exported from `@cycle/config/testing`.
9. Downstream consumers import config APIs only from `@cycle/config`.
10. The old `discoverCycleApi` / `discoverCycleApiEffect` API is replaced by
    `CycleApiConnection`.
11. Invalid persisted config fails instead of being silently salvaged.
12. Durable app config JSON is decoded directly with `Schema`, while Effect `Config` and
    `ConfigProvider` are used only for runtime and environment source composition.
13. Tokens exposed from decoded services are redacted or package-opaque redacted wrappers.
14. API connection source provenance is preserved and tested.
15. The package-local test suite covers the validation matrix.
16. These commands pass:

```bash
pnpm --filter @cycle/config typecheck
pnpm --filter @cycle/config test
pnpm --filter @cycle/backend typecheck
pnpm --filter @cycle/api typecheck
pnpm --filter @cycle/cli typecheck
pnpm --filter @cycle/desktop typecheck
```
