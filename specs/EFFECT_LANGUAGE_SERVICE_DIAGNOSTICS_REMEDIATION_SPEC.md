# Effect Language Service Diagnostics Remediation Specification

Status: Draft implementation specification

Version: 0.1.0

Date: 2026-07-01

Scope: All files included by the root `tsconfig.json` and checked by
`@effect/language-service@0.86.2`.

## 1. Purpose

This specification defines the codebase-wide remediation required to make the enabled Effect
Language Service diagnostics clean without suppressing diagnostics. The goal is not merely to remove
warnings. Each diagnostic MUST be treated as evidence that the local code is using Effect in a way
that weakens typed failures, service requirements, resource lifetime, async semantics, or idiomatic
Effect v4 control flow.

The current snapshot was produced with:

```sh
pnpm exec effect-language-service diagnostics --project tsconfig.json --format json
```

The command reported 144 diagnostics:

| Severity | Count |
| -------- | ----- |
| error    | 1     |
| warning  | 37    |
| message  | 106   |

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Diagnostic-clean` means `effect-language-service diagnostics --project tsconfig.json` exits with
no enabled diagnostics at any severity. It MUST NOT be achieved by removing the plugin, disabling
rules globally, adding blanket `@effect-diagnostics` comments, narrowing `tsconfig.json` includes, or
casting away errors and requirements.

`Typed failure` means an Effect error channel value is a specific tagged domain/platform/test error
or `never`, not `unknown`, `any`, or the global `Error` class.

## 3. Source Guidance

Remediation work MUST follow:

- `SPEC.md`, especially Effect runtime, service, layer, and schema-backed error requirements.
- `specs/EFFECT_SCHEMA_CONTRACTS_SPEC.md`, especially boundary validation and tagged error rules.
- Existing package error conventions:
  - public or persisted package-boundary failures SHOULD use `Schema.TaggedErrorClass`
  - local platform/service-only failures MAY use `Data.TaggedError`
- The diagnostic names and messages emitted by `@effect/language-service@0.86.2`.

## 4. Problem Statement

The codebase currently contains several classes of Effect misuse:

1. Some service/test implementations leak `unknown` into Effect error channels.
2. Several `Effect.tryPromise` catch handlers return the raw caught value, preserving `unknown`
   instead of mapping it into a typed error.
3. Several production and test paths fail with the global `Error` class, which collapses distinct
   failures into an unstructured error channel.
4. `Layer.mergeAll` is used in one place where one layer depends on another layer in the same
   parallel merge.
5. Some asynchronous work is represented with `Effect.sync`, which hides async failure, cancellation,
   and interruption semantics from Effect.
6. Several external-boundary callbacks call `Effect.runPromise` from inside an Effect construction
   path instead of preserving or explicitly capturing the surrounding runtime context.
7. A few `Effect.gen` blocks use `try/catch` rather than Effect error APIs.
8. Many terminal failures wrap yieldable tagged errors in `Effect.fail` instead of yielding the
   error directly.
9. Several no-op effects and single-statement generators use verbose forms that obscure intent and
   weaken the codebase's Effect idiom consistency.

These are conformance bugs. Some are likely runtime bugs today, especially the layer dependency,
async constructor, untyped failure, and runtime-boundary findings. Others are style-level today but
still create maintenance risk by making future Effect code harder to inspect, refactor, and typecheck.

## 5. Goals

The remediation MUST:

1. Reduce enabled Effect Language Service diagnostics from 144 to 0.
2. Preserve existing product behavior unless a diagnostic exposes behavior that is currently wrong.
3. Replace all diagnostic-triggering `unknown` and global `Error` failure channels with typed
   package-owned errors or `never`.
4. Correct every async boundary so asynchronous work is represented by `Effect.promise` or
   `Effect.tryPromise`, not `Effect.sync`.
5. Correct every layer composition where one layer requires another layer's output.
6. Preserve runtime and scope lifetimes when converting `Effect.runPromise` usages.
7. Keep tests semantically equivalent while making test doubles obey the same Effect contracts as
   production services.
8. Add a repeatable diagnostic validation command or documented validation step.

## 6. Non-Goals

This remediation MUST NOT:

1. Disable Effect Language Service diagnostics to achieve a clean run.
2. Apply blanket `@effect-diagnostics *:off` comments.
3. Patch TypeScript with `effect-language-service patch` as a prerequisite for this cleanup.
4. Redesign product workflows, storage formats, or UI behavior beyond what the diagnostics require.
5. Convert every internal helper into an Effect service.
6. Remove valid external Promise APIs where callers expect a Promise. Those boundaries MAY remain
   Promise-returning, but they MUST be backed by correctly captured Effect runtimes.

## 7. Diagnostic Snapshot

| Diagnostic                      | Severity | Count | Bug Interpretation                                                                                                    | Required Direction                                                                                                                                                |
| ------------------------------- | -------- | ----- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missingEffectContext`          | error    | 1     | A test service returns an Effect whose error channel includes `unknown` where the service contract does not allow it. | Make the test double's error type match `DatabaseServiceShape`; use a typed test/domain error or `never`.                                                         |
| `unknownInEffectCatch`          | warning  | 19    | External Promise failures are entering Effect as `unknown`.                                                           | Map caught values into typed package errors with a `cause` field.                                                                                                 |
| `globalErrorInEffectFailure`    | warning  | 12    | Failure channels use untagged global `Error`.                                                                         | Replace with package-owned tagged errors; preserve original cause.                                                                                                |
| `layerMergeAllWithDependencies` | warning  | 1     | Dependent layers are composed in parallel, so requirements can be missing at runtime.                                 | Compose dependent layers sequentially with `Layer.provide`, `Layer.provideMerge`, or an equivalent ordered composition.                                           |
| `lazyPromiseInEffectSync`       | warning  | 5     | Async or defectful work is hidden inside `Effect.sync`.                                                               | Use `Effect.promise`, `Effect.tryPromise`, `Effect.die`, or typed failure constructors as appropriate.                                                            |
| `catchUnfailableEffect`         | message  | 4     | Error handlers are attached to effects that cannot fail, so the fallback branch is dead code.                         | Either remove the catch or change the upstream operation to a fallible `Effect.tryPromise` with typed error handling.                                             |
| `runEffectInsideEffect`         | message  | 4     | Child Effects are launched with a separate runtime while already inside an Effect construction context.               | Capture the surrounding context/runtime and use `Effect.runPromiseWith`, or move Promise execution to the actual external boundary.                               |
| `tryCatchInEffectGen`           | message  | 2     | Generator bodies use JavaScript exceptions instead of Effect error values.                                            | Use `Effect.try`, `Effect.tryPromise`, schema effect decoders, and `Effect.catch*` combinators.                                                                   |
| `unnecessaryFailYieldableError` | message  | 70    | Yieldable tagged errors are wrapped in `Effect.fail`, obscuring the direct v4 yieldable-error idiom.                  | Replace terminal `return yield* Effect.fail(error)` with `return yield* error`; replace non-terminal `yield* Effect.fail(error)` with `yield* error` where valid. |
| `effectSucceedWithVoid`         | message  | 18    | `Effect.succeed(undefined)` is used for no-op success.                                                                | Use `Effect.void`.                                                                                                                                                |
| `unnecessaryEffectGen`          | message  | 6     | Generators contain only a single returned Effect.                                                                     | Return the underlying Effect directly.                                                                                                                            |
| `unnecessaryPipeChain`          | message  | 2     | Adjacent pipe calls obscure the transformation chain.                                                                 | Collapse chained `pipe` calls into one.                                                                                                                           |

## 8. Remediation Workstreams

### 8.1 Typed Failure Model

All remediations for `unknownInEffectCatch`, `globalErrorInEffectFailure`,
`missingEffectContext`, and `tryCatchInEffectGen` MUST use typed failures.

Requirements:

- Public package-boundary errors MUST be schema-backed when they cross package, persistence, or
  transport boundaries.
- Local platform errors MAY use `Data.TaggedError` when they do not need schema encoding.
- Catch handlers for `Effect.tryPromise` MUST NOT return `cause` directly.
- Typed wrappers MUST include enough context for operations and tests:
  - `operation`
  - human-readable `message`
  - optional original `cause`
  - stable domain identifiers such as `repositoryId`, `ticketId`, `path`, or `requestId` when known
- Test-only failures MUST also be tagged or mapped to existing package errors. Tests MUST NOT use
  the global `Error` class in Effect failure channels merely because the failure is synthetic.

Suggested package ownership:

| Package Area                               | Required Error Owner                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| API server and MCP server startup/disposal | `@cycle/api` API/MCP server error types                                                                                                    |
| HTTP handlers and WebSocket handlers       | `@cycle/api` route or protocol error types                                                                                                 |
| Desktop API startup/disposal               | `@cycle/desktop` platform or desktop API error types                                                                                       |
| Desktop bootstrap repository workflow      | `@cycle/desktop` bootstrap/repository operation errors                                                                                     |
| Git and GitDB tests                        | existing `@cycle/git` and `@cycle/git-db` error types or small test-local tagged errors                                                    |
| Database materialization warnings          | existing `DatabaseValidationError`, `DatabaseStorageError`, `DatabaseMaterializationError`, or a more specific database warning cause type |

### 8.2 Layer Composition

`packages/api/src/CycleApi.ts:141` MUST be corrected before broader cleanup because it is a likely
runtime composition bug.

Current issue:

- `Layer.mergeAll(SystemApiHandlers, V1ApiHandlers)` composes both layers in parallel.
- The diagnostics report that one layer provides `ApiGroup<"cycle-api", "system">`, which another
  layer requires.
- Parallel merge does not satisfy dependencies between sibling layers.

Required behavior:

- The providing API group layer MUST be built before the dependent layer is provided.
- The final `handlers` layer MUST have the same public output and required runtime inputs as the
  current intended API handler layer.
- The fix MUST use ordered Effect layer composition, not `as any` casts or wider requirement types.
- A regression test SHOULD exercise the full API layer startup path enough to fail if the system API
  group is no longer provided to v1 handlers.

### 8.3 Async Boundary Semantics

All `lazyPromiseInEffectSync` diagnostics MUST be fixed according to the actual behavior of the
thunk.

Requirements:

- If the thunk returns a Promise, use `Effect.promise` when rejection is impossible or intentionally
  defectful, and `Effect.tryPromise` when rejection is recoverable.
- If the thunk currently throws to represent an impossible state, use `Effect.die` or
  `Effect.dieMessage` when the failure is a defect.
- If the impossible state can occur from normal input or lifecycle order, define a typed error and
  return a failing Effect instead of a defect.
- Test fakes that need to return asynchronous usecase results MUST model those results as Effects,
  not as Promise values inside successful synchronous Effects.

Specific attention:

- `packages/git-db/src/Store.ts:362` currently reports against the uninitialized structure
  cache path. The implementation MUST decide whether reading an uninitialized cache is an internal
  defect or a typed store lifecycle error, then represent it explicitly.
- `packages/api/test/api.test.ts:77,1639,2810,2867` MUST stop returning Promise-shaped values from
  `Effect.sync` test fakes.

### 8.4 Runtime Launch Boundaries

All `runEffectInsideEffect` diagnostics MUST be reviewed as runtime ownership bugs.

Requirements:

- Promise-returning callback APIs MAY remain Promise-returning when required by HTTP, WebSocket,
  CLI, or external JavaScript contracts.
- Those callbacks MUST be backed by the Effect runtime/context that was active when the callback was
  created, not by a fresh detached service provision unless the boundary explicitly owns a new
  runtime.
- When a callback is built inside an Effect, the implementation SHOULD capture `Effect.context` or a
  managed runtime and use `Effect.runPromiseWith`.
- Any acquired `Scope` closed by a callback MUST remain tied to the resource that created it.
- Shutdown callbacks MUST be idempotent or clearly safe to call once.

Affected locations:

- `packages/api/src/server.ts:123`
- `packages/api/src/http/handlers/v1/chat/ws.ts:208`
- `packages/api/src/mcp/server/runtime.ts:141`
- `packages/cli/src/services/CliRuntime.ts:71`

### 8.5 Fallibility and Dead Catches

All `catchUnfailableEffect` diagnostics MUST be evaluated by asking whether the code intended to
swallow failures.

Requirements:

- If the upstream operation truly cannot fail, remove the catch and keep the success channel direct.
- If the code intended best-effort behavior, convert the upstream operation to a fallible Effect
  constructor with a typed error and then decide whether to log, downgrade, or recover.
- Silent recovery MUST NOT hide operationally important failures. Best-effort event emission MAY
  recover to `Effect.void`, but SHOULD log with enough context for debugging if the failure is not
  expected.

Affected locations:

- `packages/api/src/agents/services/AgentProviderProfiles.ts:23`
- `packages/api/src/http/handlers/v1/agentWorkEvents.ts:26,70,97`

### 8.6 Generator and Yieldable Error Cleanup

All `unnecessaryFailYieldableError`, `unnecessaryEffectGen`, `effectSucceedWithVoid`, and
`unnecessaryPipeChain` diagnostics MUST be cleaned after the higher-risk correctness fixes.

Requirements:

- Yieldable tagged errors MUST be yielded directly.
- Single-return generators MUST be removed unless the implementation adds additional generator
  steps as part of a correctness fix.
- No-op successful Effects MUST use `Effect.void`.
- Chained pipe expressions MUST be collapsed where the resulting code is not less readable.
- Mechanical cleanup MUST preserve tracing, logging, spans, and annotations.

The large `unnecessaryFailYieldableError` cluster is concentrated in:

- `packages/database/src/services/DatabaseService.ts`
- `packages/git-db/src/Store.ts`
- `packages/git/src/object-store/*`
- `packages/git/src/repository/GitRepositoryLive.ts`
- `packages/git/src/worktree/WorktreeServiceLive.ts`

These changes SHOULD be implemented with focused package-by-package commits because they are mostly
mechanical but high volume.

## 9. Complete Diagnostic Inventory

Each listed location MUST be resolved or re-evaluated by re-running the diagnostic command after
nearby code changes.

| Diagnostic                      | File                                                        | Lines                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `catchUnfailableEffect`         | `packages/api/src/agents/services/AgentProviderProfiles.ts` | 23                                                                                                                         |
| `catchUnfailableEffect`         | `packages/api/src/http/handlers/v1/agentWorkEvents.ts`      | 26, 70, 97                                                                                                                 |
| `effectSucceedWithVoid`         | `packages/agents/src/executables.ts`                        | 221, 247                                                                                                                   |
| `effectSucceedWithVoid`         | `packages/agents/src/runtime/policy.ts`                     | 113                                                                                                                        |
| `effectSucceedWithVoid`         | `packages/api/src/agents/services/AgentProviderProfiles.ts` | 23                                                                                                                         |
| `effectSucceedWithVoid`         | `packages/api/src/mcp/discovery.ts`                         | 128, 145                                                                                                                   |
| `effectSucceedWithVoid`         | `packages/api/src/mcp/server/runtime.ts`                    | 247                                                                                                                        |
| `effectSucceedWithVoid`         | `packages/cli/src/discovery.ts`                             | 107, 124                                                                                                                   |
| `effectSucceedWithVoid`         | `packages/desktop/src/main/AppConfigLive.ts`                | 139                                                                                                                        |
| `effectSucceedWithVoid`         | `packages/desktop/src/main/DesktopApi.ts`                   | 86                                                                                                                         |
| `effectSucceedWithVoid`         | `packages/desktop/src/main/DesktopIpc.ts`                   | 170                                                                                                                        |
| `effectSucceedWithVoid`         | `packages/desktop/src/shared/DesktopConfigLive.ts`          | 25                                                                                                                         |
| `effectSucceedWithVoid`         | `packages/git-db/src/Store.ts`                              | 1505                                                                                                                       |
| `effectSucceedWithVoid`         | `packages/git/src/object-store/GitFilesystemObject.ts`      | 149                                                                                                                        |
| `effectSucceedWithVoid`         | `packages/git/src/object-store/GitInMemory.ts`              | 47, 64, 219                                                                                                                |
| `globalErrorInEffectFailure`    | `packages/api/src/mcp/server/runtime.ts`                    | 167                                                                                                                        |
| `globalErrorInEffectFailure`    | `packages/desktop/src/main/DesktopBootstrapLive.ts`         | 525, 545, 592, 684, 689, 694, 823                                                                                          |
| `globalErrorInEffectFailure`    | `packages/desktop/test/desktop-bootstrap.test.ts`           | 186, 206, 220                                                                                                              |
| `globalErrorInEffectFailure`    | `packages/desktop/test/main-program.test.ts`                | 68                                                                                                                         |
| `layerMergeAllWithDependencies` | `packages/api/src/CycleApi.ts`                              | 141                                                                                                                        |
| `lazyPromiseInEffectSync`       | `packages/api/test/api.test.ts`                             | 77, 1639, 2810, 2867                                                                                                       |
| `lazyPromiseInEffectSync`       | `packages/git-db/src/Store.ts`                              | 362                                                                                                                        |
| `missingEffectContext`          | `packages/desktop/test/desktop-bootstrap.test.ts`           | 300                                                                                                                        |
| `runEffectInsideEffect`         | `packages/api/src/http/handlers/v1/chat/ws.ts`              | 208                                                                                                                        |
| `runEffectInsideEffect`         | `packages/api/src/mcp/server/runtime.ts`                    | 141                                                                                                                        |
| `runEffectInsideEffect`         | `packages/api/src/server.ts`                                | 123                                                                                                                        |
| `runEffectInsideEffect`         | `packages/cli/src/services/CliRuntime.ts`                   | 71                                                                                                                         |
| `tryCatchInEffectGen`           | `packages/database/src/services/DatabaseService.ts`         | 3110                                                                                                                       |
| `tryCatchInEffectGen`           | `packages/desktop/src/main/DesktopApi.ts`                   | 90                                                                                                                         |
| `unknownInEffectCatch`          | `packages/api/src/http/handlers/v1/agents.ts`               | 18                                                                                                                         |
| `unknownInEffectCatch`          | `packages/api/src/http/handlers/v1/chat.ts`                 | 108                                                                                                                        |
| `unknownInEffectCatch`          | `packages/api/src/http/handlers/v1/chat/store.ts`           | 45                                                                                                                         |
| `unknownInEffectCatch`          | `packages/api/src/http/handlers/v1/chat/ws.ts`              | 213                                                                                                                        |
| `unknownInEffectCatch`          | `packages/api/src/mcp/bin.ts`                               | 42                                                                                                                         |
| `unknownInEffectCatch`          | `packages/api/src/mcp/server/runtime.ts`                    | 97                                                                                                                         |
| `unknownInEffectCatch`          | `packages/api/src/server.ts`                                | 67, 140                                                                                                                    |
| `unknownInEffectCatch`          | `packages/desktop/src/main/DesktopApi.ts`                   | 211, 291                                                                                                                   |
| `unknownInEffectCatch`          | `packages/desktop/test/desktop-api.test.ts`                 | 229, 239, 249, 253                                                                                                         |
| `unknownInEffectCatch`          | `packages/desktop/test/desktop-bootstrap.test.ts`           | 469, 484                                                                                                                   |
| `unknownInEffectCatch`          | `packages/git-db/test/git-db.test.ts`                       | 30                                                                                                                         |
| `unknownInEffectCatch`          | `packages/git/test/git.test.ts`                             | 22                                                                                                                         |
| `unknownInEffectCatch`          | `packages/git/test/worktree.test.ts`                        | 20                                                                                                                         |
| `unnecessaryEffectGen`          | `packages/database/test/database-benchmark.test.ts`         | 194                                                                                                                        |
| `unnecessaryEffectGen`          | `packages/database/test/database.test.ts`                   | 23                                                                                                                         |
| `unnecessaryEffectGen`          | `packages/desktop/src/main/DesktopApi.ts`                   | 65                                                                                                                         |
| `unnecessaryEffectGen`          | `packages/desktop/src/main/DesktopBootstrapLive.ts`         | 245, 261                                                                                                                   |
| `unnecessaryEffectGen`          | `packages/usecases/test/usecases.test.ts`                   | 55                                                                                                                         |
| `unnecessaryFailYieldableError` | `packages/database/src/services/DatabaseService.ts`         | 845, 922, 1050, 1107, 1182, 1308, 1359, 1410, 1465, 1468, 1477, 1479, 1572, 1580, 1658, 1752, 1803, 1990, 2099, 2156, 2256 |
| `unnecessaryFailYieldableError` | `packages/desktop/src/main/DesktopApi.ts`                   | 186                                                                                                                        |
| `unnecessaryFailYieldableError` | `packages/desktop/src/main/DesktopIpc.ts`                   | 279                                                                                                                        |
| `unnecessaryFailYieldableError` | `packages/desktop/src/main/LocalWorkspaceLive.ts`           | 102                                                                                                                        |
| `unnecessaryFailYieldableError` | `packages/git-db/src/Event.ts`                              | 83                                                                                                                         |
| `unnecessaryFailYieldableError` | `packages/git-db/src/Store.ts`                              | 537, 593, 672, 729, 791, 806, 821, 1062, 1112, 1140, 1422, 1473, 1572                                                      |
| `unnecessaryFailYieldableError` | `packages/git/src/command/GitCommand.ts`                    | 127                                                                                                                        |
| `unnecessaryFailYieldableError` | `packages/git/src/object-store/GitFilesystem.ts`            | 98, 166                                                                                                                    |
| `unnecessaryFailYieldableError` | `packages/git/src/object-store/GitFilesystemObject.ts`      | 54, 82, 91, 101                                                                                                            |
| `unnecessaryFailYieldableError` | `packages/git/src/object-store/GitFilesystemRef.ts`         | 22                                                                                                                         |
| `unnecessaryFailYieldableError` | `packages/git/src/object-store/GitFilesystemTree.ts`        | 20, 28, 37                                                                                                                 |
| `unnecessaryFailYieldableError` | `packages/git/src/object-store/GitPackDelta.ts`             | 14, 36, 49, 61, 69                                                                                                         |
| `unnecessaryFailYieldableError` | `packages/git/src/object-store/GitPackIndex.ts`             | 70, 78, 112                                                                                                                |
| `unnecessaryFailYieldableError` | `packages/git/src/object-store/GitPackObject.ts`            | 66, 94, 118, 131, 143, 164, 196, 207                                                                                       |
| `unnecessaryFailYieldableError` | `packages/git/src/repository/GitRepositoryLive.ts`          | 81, 107                                                                                                                    |
| `unnecessaryFailYieldableError` | `packages/git/src/worktree/WorktreeServiceLive.ts`          | 321, 328, 338                                                                                                              |
| `unnecessaryPipeChain`          | `packages/desktop/electron.vite.config.ts`                  | 218                                                                                                                        |
| `unnecessaryPipeChain`          | `packages/desktop/src/shared/DesktopConfigLive.ts`          | 6                                                                                                                          |

## 10. Implementation Order

Implementation SHOULD proceed in this order:

1. Fix `layerMergeAllWithDependencies` in `@cycle/api`.
2. Fix `missingEffectContext` in the desktop bootstrap test double.
3. Define or reuse typed error wrappers for API, MCP, desktop API, desktop bootstrap, and tests.
4. Replace all `unknownInEffectCatch` and `globalErrorInEffectFailure` locations.
5. Fix `lazyPromiseInEffectSync` locations and add regression coverage for any behavior changes.
6. Fix `runEffectInsideEffect` locations while preserving callback ownership and cleanup semantics.
7. Replace `try/catch` inside Effect generators with Effect-native error handling.
8. Apply yieldable error and no-op cleanup package by package.
9. Collapse unnecessary generators and pipe chains.
10. Re-run diagnostics, typecheck, targeted package tests, and the full check suite as appropriate.

## 11. Validation Matrix

| Validation              | Required Command or Check                                                                                                                        | Acceptance Criteria                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Effect diagnostics      | `pnpm exec effect-language-service diagnostics --project tsconfig.json --format text`                                                            | No diagnostics at any severity.                                           |
| TypeScript              | `pnpm typecheck`                                                                                                                                 | Passes.                                                                   |
| API layer startup       | API tests or targeted startup test covering `makeCycleApiLayer`                                                                                  | Fails if API handler layers are composed in the wrong order.              |
| Desktop bootstrap tests | `pnpm --filter @cycle/desktop test -- desktop-bootstrap` or matching local test command                                                          | Desktop test doubles no longer leak `unknown` or global `Error` failures. |
| API tests               | `pnpm --filter @cycle/api test`                                                                                                                  | Async test fakes and API runtime boundaries preserve existing behavior.   |
| Git/GitDB tests         | `pnpm --filter @cycle/git test` and `pnpm --filter @cycle/git-db test`                                                                           | Yieldable error cleanup and typed test failures preserve Git behavior.    |
| Formatting              | `pnpm format:check` after unrelated pre-existing format drift is resolved, or targeted `oxfmt --check` for touched files during incremental work | Touched files are formatted.                                              |

## 12. Definition of Done

This remediation is complete only when:

1. The root diagnostic command reports zero enabled diagnostics.
2. No diagnostic is suppressed without a narrow comment explaining a deliberate false positive.
3. Every Promise catch mapped by this work returns a typed error.
4. No new public service method or test double leaks `unknown` where the service contract expects a
   narrower error type.
5. The API handler layer composition is ordered and covered by a regression test.
6. Runtime callbacks converted from `Effect.runPromise` preserve scope cleanup and logging behavior.
7. All touched package tests and `pnpm typecheck` pass.

## 13. Open Questions

1. Should the repository add a root script such as `"effect:diagnostics"` for the diagnostic command,
   and should `pnpm check` eventually include it?
2. Should message-level diagnostics be enforced in CI immediately, or should CI initially gate only
   errors and warnings while the mechanical cleanup is underway?
3. Should test-only tagged errors live inline in test files or in shared test helpers per package?
