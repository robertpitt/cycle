# Cycle Package Architecture Specification

Status: Draft architecture migration specification

Version: 0.1.0

Scope: `packages/*` aligned with `vendor/effect-v4/ai-docs` and
`vendor/effect-v4/.patterns`

## 1. Purpose

This specification defines the architecture-level changes required to make the Cycle packages plug
together as one Effect-first system. It does not replace `CYCLE_SPEC.md`,
`packages/git-db/TARGET_ARCHITECTURE.md`, `packages/database/SPEC.md`, or
`packages/usecases/SPEC.md`; it defines the cross-package rules those package specs MUST conform to.

The target system is a layered local-first application where storage, projection, workflow policy,
transport, desktop runtime, and UI presentation have explicit ownership boundaries. Package APIs
MUST be schema-backed, service/layer composed, observable, testable, and aligned with the Effect v4
patterns vendored in this repository.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means the implementation may choose the behavior, but it MUST document the
choice and expose enough information for tests, package consumers, and future maintainers to reason
about it.

## 3. Source Guidance

Architecture and implementation work covered by this specification MUST follow these local sources:

- `vendor/effect-v4/.patterns/effect.md`
- `vendor/effect-v4/.patterns/testing.md`
- `vendor/effect-v4/.patterns/jsdoc.md`
- `vendor/effect-v4/ai-docs/src/01_effect/02_services/*`
- `vendor/effect-v4/ai-docs/src/01_effect/03_errors/*`
- `vendor/effect-v4/ai-docs/src/01_effect/04_resources/*`
- `vendor/effect-v4/ai-docs/src/01_effect/05_running/*`
- `vendor/effect-v4/ai-docs/src/03_integration/10_managed-runtime.ts`
- `vendor/effect-v4/ai-docs/src/08_observability/*`
- `vendor/effect-v4/ai-docs/src/09_testing/*`

Where this specification and those sources differ, the vendored Effect guidance SHOULD be treated
as the pattern reference and this specification SHOULD be revised.

## 4. Problem Statement

Cycle already has the right coarse package set:

- `@cycle/git`
- `@cycle/git-db`
- `@cycle/database`
- `@cycle/contracts`
- `@cycle/usecases`
- `@cycle/rpc`
- `@cycle/desktop`
- `@cycle/ui`

The current implementation does not yet enforce the package boundaries as a system contract. Several
surfaces duplicate domain schemas, expose storage DTOs to frontend code, run background work through
detached promises, use broad service interfaces, and rely on placeholder `Schema.Unknown` success
schemas. These gaps make packages harder to compose, test, and evolve independently.

Cycle needs one architecture contract that defines:

- which package owns each responsibility
- which package may depend on which other packages
- which schemas and services are canonical
- how Effects cross external framework boundaries
- how background work, resources, errors, logs, and tests are standardized
- which migration steps are required before new feature work builds more coupling on top

## 5. Goals

The package architecture MUST:

1. Preserve `@cycle/git-db` as the durable repository-scoped storage layer.
2. Preserve `@cycle/database` as the repository domain projection and persistence gateway.
3. Make `@cycle/contracts` the canonical schema and application contract package.
4. Make `@cycle/usecases` the canonical workflow execution and policy layer.
5. Make `@cycle/rpc` a transport adapter derived from usecase contracts, not a second contract
   registry.
6. Keep `@cycle/desktop` as a composition and platform package, not a domain policy package.
7. Keep `@cycle/ui` presentation-first and free of persistence, RPC execution, Electron, and Effect
   runtime ownership.
8. Standardize all runtime dependencies through `Context.Service` classes and `Layer` composition.
9. Use schema-backed domain models, inputs, outputs, and tagged errors at public package boundaries.
10. Supervise all background work through Effect scopes, layers, fibers, or managed runtimes.
11. Validate package contracts with deterministic tests that follow the vendored Effect testing
    patterns.
12. Make architecture conformance checkable by dependency, schema, runtime, and test assertions.

## 6. Non-Goals

This specification MUST NOT:

1. Redefine Cycle product behavior already covered by `CYCLE_SPEC.md`.
2. Redefine the GitDB object model already covered by `packages/git-db/TARGET_ARCHITECTURE.md`.
3. Specify visual component details already covered by `packages/ui/AGENTS.md`.
4. Require a hosted backend, account system, or remote service.
5. Require all internal pure helpers to be Effect services.
6. Require a new package if existing public contract exports can be made sufficient.
7. Require immediate implementation of future agent execution, worktree orchestration, or external
   ticket-system sync.

## 7. Target Package Graph

### 7.1 Dependency Direction

The allowed dependency graph is:

```text
@cycle/git
  -> effect, @effect/platform-node where needed

@cycle/git-db
  -> @cycle/git
  -> effect, @effect/platform-node where needed

@cycle/database
  -> @cycle/git-db
  -> effect and Effect SQL/platform services

@cycle/contracts
  -> @cycle/database public domain type aliases during the transition to schema-backed database DTOs
  -> @cycle/git-db public sync result type aliases where surfaced as workflow output
  -> effect

@cycle/usecases
  -> @cycle/contracts schemas and usecase contracts
  -> @cycle/database public gateway service contracts
  -> effect

@cycle/rpc
  -> @cycle/contracts schemas and usecase contracts
  -> @cycle/usecases runner service
  -> effect

@cycle/desktop main/preload
  -> @cycle/rpc, @cycle/usecases, @cycle/database, @cycle/git-db, @cycle/git
  -> Electron and Effect platform/runtime services

@cycle/desktop renderer
  -> @cycle/rpc client/protocol or the canonical application contract surface
  -> @cycle/ui
  -> React libraries

@cycle/ui
  -> React, styling, component primitives, visual utility dependencies
```

No package MAY import a package from a higher layer. In particular:

- `@cycle/git` MUST NOT import any other `@cycle/*` package.
- `@cycle/git-db` MUST NOT import `@cycle/database`, `@cycle/usecases`, `@cycle/rpc`,
  `@cycle/desktop`, or `@cycle/ui`.
- `@cycle/database` MUST NOT import `@cycle/contracts`, `@cycle/usecases`, `@cycle/rpc`,
  `@cycle/desktop`, or `@cycle/ui`.
- `@cycle/contracts` MUST NOT import `@cycle/usecases`, `@cycle/rpc`, `@cycle/desktop`, or
  `@cycle/ui`.
- `@cycle/usecases` MUST NOT import `@cycle/rpc`, `@cycle/desktop`, or `@cycle/ui`.
- `@cycle/rpc` MUST NOT import `@cycle/database` or `@cycle/git-db` domain types directly.
- `@cycle/desktop` renderer code MUST NOT import `@cycle/database`, `@cycle/git-db`, or
  `@cycle/git`.
- `@cycle/ui` MUST NOT import any non-UI Cycle runtime package.

### 7.2 Package Ownership

Each package MUST have one primary responsibility:

| Package            | Owns                                                                                                        | Must not own                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `@cycle/git`       | Git repository inspection, Git object/ref/transport service contracts, Git schemas, Git errors              | GitDB collection semantics, ticket documents, usecase policy, UI contracts                     |
| `@cycle/git-db`    | Git-backed document store, snapshots, refs, collections, transactions, sync                                 | Cycle issue workflow, SQLite projections, RPC aliases, Electron state                          |
| `@cycle/database`  | Repository registry, GitDB source adapter, projection store, ticket/domain persistence, query read model    | Human approval policy, transport envelopes, Electron IPC, React state                          |
| `@cycle/contracts` | Shared application schemas, usecase contract metadata, usecase constructors, renderer-safe DTO type aliases | Workflow execution, durable storage, transport envelopes, Electron callbacks                   |
| `@cycle/usecases`  | Workflow execution, validation, policy, orchestration, usecase failure mapping                              | Durable storage internals, transport envelopes, Electron callbacks, canonical schema ownership |
| `@cycle/rpc`       | Request/response envelopes, alias compatibility, client/server transport adapter                            | Canonical business operation definitions, database DTO ownership                               |
| `@cycle/desktop`   | Electron platform services, runtime composition, IPC registration, app config, bootstrap orchestration      | Storage schemas, workflow policy, reusable presentational components                           |
| `@cycle/ui`        | Presentational React components and design-system contracts                                                 | App state, RPC execution, Electron APIs, persistence, Effect runtime ownership                 |

## 8. Effect Runtime and Service Contract

### 8.1 Services

Public runtime capabilities MUST be defined with `Context.Service` class syntax. Service identifiers
MUST include the package and module path, for example `@cycle/database/DatabaseService`.

Each service SHOULD expose:

- `layerNoDeps` when the implementation needs dependencies supplied by callers
- `layer` or `Live` when the package can provide the required dependencies itself
- `layerTest` or a test constructor when deterministic test state is part of the contract
- exported `ServiceShape` or `Service` type only where consumers need it

Reusable service methods and hot library functions SHOULD use `Effect.fn` or
`Effect.fnUntraced` rather than functions that only wrap `Effect.gen`.

Terminal failure, interruption, or early-return paths inside `Effect.gen` MUST use
`return yield*`.

### 8.2 Layers and Resources

Packages MUST compose dependencies with `Layer.provide`, `Layer.provideMerge`, and
`Layer.mergeAll`. Constructors that allocate resources MUST be represented as scoped layers or use
`Effect.acquireRelease` so teardown is automatic.

Background work MUST be one of:

- a scoped fiber created with `Effect.forkScoped`
- a `Layer.effectDiscard` background layer
- a service method that returns a scoped acquisition
- an external framework callback executed through a managed runtime owned by the composition root

Background work MUST NOT be started with detached `Effect.runPromise` calls from package service
implementations unless the call is at an explicitly documented external framework boundary and the
runtime lifecycle is managed and disposed.

### 8.3 Application Entry Points

Long-running entry points SHOULD use `Layer.launch` and platform runtime helpers where possible. For
Electron, where callbacks are framework-owned, the desktop composition root MUST own one managed
runtime and bridge event handlers through that runtime. Runtime disposal MUST be tied to Electron
shutdown.

The desktop main process MUST NOT create multiple unsupervised Effect runtimes inside service
layers. Callback bridges MUST preserve request IDs, cancellation/deadline information where
available, and structured failure mapping.

## 9. Schema and Contract Ownership

### 9.1 Domain Schemas

Public data that crosses package boundaries MUST have an Effect `Schema` value and exported TypeScript
type derived from that schema. This applies to:

- Git object, ref, identity, transport, and repository inspection types
- GitDB store options, collection entries, snapshots, sync results, and errors
- Database documents, pages, records, repository status, warnings, diffs, and query inputs
- Usecase inputs, successes, failures, metadata, and automation reports
- RPC envelopes and transport errors
- Desktop IPC payloads that cross the preload boundary

Schema values MUST live with the package that owns the domain meaning. Higher packages MAY compose
or re-export lower package schemas but MUST NOT redefine incompatible shapes.

### 9.2 Usecase Contracts

`@cycle/contracts` MUST be the canonical application contract registry. `@cycle/usecases` MUST
consume those contracts when executing workflows and MAY re-export them for compatibility. Each usecase contract MUST
include:

- canonical name
- compatibility aliases
- category
- input schema
- success schema
- failure schema
- side-effect classification
- repository scope
- idempotency posture
- version

`Schema.Unknown` MUST NOT remain as a success schema for implemented usecases. Placeholder schemas
MAY exist only for usecases marked experimental and excluded from conformance.

Usecase contracts MUST be capable of deriving:

- RPC payload validation
- RPC success validation
- renderer/client TypeScript payload and result types
- API or CLI validation in future adapters
- documentation tables
- conformance tests

### 9.3 RPC Contracts

`@cycle/rpc` MUST derive method names and payload/success schemas from `@cycle/contracts` usecase
contracts and compatibility aliases. It MUST NOT keep a parallel hand-maintained database-shaped
type map once the usecase contract registry can express the same information.

RPC clients MUST validate successful responses against the method success schema before returning
values to callers. Invalid server responses MUST become typed RPC protocol failures, not untyped
throws.

### 9.4 Renderer Contracts

Renderer code MUST import application-facing DTOs from `@cycle/rpc` or `@cycle/contracts`.
Renderer code MUST NOT import storage-facing DTOs from `@cycle/database`, `@cycle/git-db`, or
`@cycle/git`.

`@cycle/contracts` MAY temporarily re-export lower-level domain type aliases while lower packages
add schema-backed domain DTOs. Those transitional aliases MUST be type-only and MUST NOT introduce
runtime storage dependencies into renderer bundles.

## 10. Package-Level Change Requirements

### 10.1 `@cycle/git`

`@cycle/git` MUST remain the lowest Cycle runtime package. Required changes:

1. Keep `Git` and `GitRepository` as narrow service contracts.
2. Ensure Git errors are schema-backed tagged errors or schema-backed reason errors.
3. Expose concrete layers through consistent names, such as `GitCli.layer`,
   `GitFilesystem.layer`, `GitInMemory.layer`, and `GitRepository.layer`.
4. Keep `NodeLive` as a convenience only; higher packages SHOULD compose lower-level layers
   explicitly when they need test substitution.
5. Add conformance tests that run the same Git service behavior against CLI, filesystem, and
   in-memory layers where capabilities overlap.
6. Use structured log annotations for external command operations, including cwd, gitDir,
   operation, ref, remote, and sanitized stderr metadata.

### 10.2 `@cycle/git-db`

`@cycle/git-db` MUST complete the target architecture described in
`packages/git-db/TARGET_ARCHITECTURE.md`. Required changes:

1. Keep Git storage access behind the `@cycle/git` `Git` service.
2. Keep `Store` as a validated value and `StoreService` as the active runtime service.
3. Keep collection, pointer, snapshot, transaction, sync, tree, and path APIs as module-first
   function surfaces.
4. Keep Cycle issue/domain concepts out of GitDB.
5. Ensure all exported errors use `Schema.TaggedErrorClass` or an equivalent schema-backed error
   model.
6. Add operation spans around snapshot reads, tree materialization, commits, pointer updates, fetch,
   push, and conflict checks.
7. Provide test layers through package exports and use the same GitDB conformance suite across
   backends.
8. Avoid private Effect internals and rely only on public Effect package exports.

### 10.3 `@cycle/database`

`@cycle/database` MUST be split internally into smaller services while preserving one public
composition surface for consumers. Required changes:

1. Define schema-backed domain models for all exported documents, pages, query inputs, repository
   status records, warnings, diffs, and metadata.
2. Replace plain `Error` subclasses with schema-backed tagged database errors.
3. Keep GitDB as the only durable repository source of truth.
4. Move projection state behind a resource-managed Effect service. The SQL implementation SHOULD
   use Effect SQL/SQLite integration. If direct `node:sqlite` remains, the decision is
   implementation-defined and MUST be wrapped behind the same service contract.
5. Split the current broad service implementation into internal components:
   - repository registry
   - GitDB source adapter
   - projection store
   - projector/materializer
   - ticket writer
   - query service
   - warning/status surface
6. Polling and resync scheduling MUST be supervised fibers or scoped background layers, not
   unmanaged timers.
7. Write operations MUST commit to GitDB first and then materialize the committed delta before
   returning success.
8. Materialization failures MUST preserve the previous readable snapshot and surface warnings or
   failures through repository status.
9. `@cycle/database` MUST NOT contain user-facing workflow policy that belongs in
   `@cycle/usecases`, such as human approval gates or status transition policy.

### 10.4 `@cycle/usecases`

`@cycle/usecases` MUST become the sole domain workflow entry point. Required changes:

1. Replace placeholder success schemas with concrete schemas for every implemented usecase.
2. Keep input, success, failure, idempotency, side-effect, and repository-scope metadata in one
   contract registry.
3. Build handler dispatch from the contract registry or a checked handler map so missing handlers
   fail at compile time or contract tests.
4. Move direct database calls behind a persistence gateway interface to make workflow tests
   independent of the full database implementation.
5. Keep all workflow policy here, including status transitions, human approval requirements,
   relation rules, protected-section checks, default workflow semantics, and future
   `CYCLE_WORKFLOW.md` evaluation.
6. Honor request metadata: `requestId`, `actor`, `source`, `idempotencyKey`, `dryRun`, deadline,
   and trace context.
7. Implement idempotency for write usecases marked `supported` or update the contract to
   `not-supported`.
8. Use typed, serializable, redacted failures for all public usecase failures.
9. Emit structured logs and spans for every usecase execution with usecase name, request ID,
   source, repository ID when present, actor type when present, side-effect class, duration, and
   result status.

### 10.5 `@cycle/rpc`

`@cycle/rpc` MUST be a thin transport adapter. Required changes:

1. Derive method aliases from `@cycle/usecases` contract aliases.
2. Derive payload and success schemas from the same contract registry.
3. Keep RPC envelope schemas transport-specific and small.
4. Remove direct imports of `@cycle/database` and `@cycle/git-db` from protocol type definitions
   after equivalent usecase success schemas exist.
5. Validate request payloads and response values at the transport boundary.
6. Normalize invalid envelope, unsupported alias, invalid payload, invalid success, and interrupted
   execution into typed RPC errors.
7. Keep backward-compatible method names as aliases, not canonical operation names.

### 10.6 `@cycle/desktop`

`@cycle/desktop` MUST own platform integration and runtime composition. Required changes:

1. Introduce a desktop runtime boundary based on a managed runtime or equivalent composition-root
   runtime that is disposed on app shutdown.
2. Replace detached background `Effect.runPromise` starts inside service implementations with
   supervised scoped fibers or runtime-owned callback bridges.
3. Keep Electron IPC handlers as security and transport adapters. They MUST validate preload inputs,
   authorize repository-scoped requests, call RPC/usecase services, and map failures.
4. Keep bootstrap open/sync/push orchestration in a dedicated desktop orchestration service, but
   make repository operation queues Effect-managed rather than promise maps where possible.
5. Renderer code MUST consume the RPC client and canonical application DTOs only.
6. Main-process services MUST use Effect `Config`, `ConfigProvider`, `FileSystem`, `Path`, and
   resource layers where those services are already available instead of ad hoc process/global
   reads.
7. App-level settings MAY remain desktop-owned. Repository-scoped ticket content MUST remain
   repository GitDB-owned.

### 10.7 `@cycle/ui`

`@cycle/ui` MUST stay presentation-first. Required changes:

1. Keep runtime state, Electron bridge calls, RPC clients, query clients, persistence, and Effect
   services out of UI components.
2. Keep reusable semantic UI contracts in `src/lib/contracts.ts`.
3. Accept product data through props and callbacks rather than importing app/domain packages.
4. Maintain Storybook coverage for public atoms, molecules, organisms, and reusable pages.
5. Avoid component-local API variants that duplicate shared tone, size, density, value, and callback
   naming rules.

## 11. Runtime Workflows

### 11.1 Desktop Startup

The desktop startup workflow MUST be:

1. Build the desktop layer graph.
2. Create one runtime for the layer graph.
3. Wait for Electron readiness.
4. Register scoped IPC handlers.
5. Start preferences/theme lifecycle supervision.
6. Create the main window.
7. Start bootstrap supervision.
8. Await shutdown.
9. Interrupt scoped fibers and dispose the runtime.
10. Release Electron handlers and close resource-managed stores.

Each background operation spawned during startup MUST be visible through bootstrap status, logs, or
repository status.

### 11.2 Repository Open

Opening a repository MUST:

1. Resolve and validate the repository path through `@cycle/git`.
2. Construct a GitDB store through `@cycle/git-db`.
3. Register the repository with `@cycle/database`.
4. Materialize the latest local `refs/gitdb/cycle/main` snapshot or mark the repository empty.
5. Expose a repository status record before background remote sync begins.
6. Start remote sync only when repository preferences allow it.

Duplicate open requests for the same repository MUST be idempotent and serialized.

### 11.3 Usecase Execution

Usecase execution MUST:

1. Resolve the canonical contract by name or compatibility alias.
2. Decode input with the contract input schema.
3. Build request context.
4. Run policy and persistence through Effect services.
5. Decode success with the contract success schema.
6. Map expected failures into `UseCaseFailure`.
7. Log and trace success, typed failure, interruption, timeout, and defects.

Usecase handlers MUST NOT return success before required post-commit projection consistency is
visible for write usecases that claim read-after-write behavior.

### 11.4 RPC Invocation

RPC invocation MUST:

1. Decode the envelope.
2. Resolve the alias to a usecase contract.
3. Decode payload using the usecase input schema.
4. Execute the usecase runner.
5. Encode and validate the success or failure envelope.
6. Return a transport response without throwing for expected domain failures.

### 11.5 Projection Sync

Projection sync MUST:

1. Read the watched GitDB pointer.
2. Keep the current active projection serving reads during materialization.
3. Build either a full rebuild or delta plan.
4. Drop invalid source documents individually and record warnings.
5. Atomically activate the new projection generation.
6. Surface failures in repository status without corrupting the previous active generation.

## 12. Failure Model

### 12.1 Error Categories

Public failures MUST be normalized into these categories at the appropriate boundary:

- invalid input
- repository not found or not open
- repository unavailable
- storage failure
- materialization or sync failure
- push/fetch failure
- consistency failure
- conflict or divergence
- policy violation
- authorization or security failure
- timeout
- interruption
- unexpected defect

Lower packages MAY expose more specific errors, but higher packages MUST map them into their public
failure contract.

### 12.2 Tagged Errors

Effect-facing package errors SHOULD use `Schema.TaggedErrorClass`. Wrapper errors SHOULD use a
tagged `reason` field when multiple lower-level causes belong to one public error category.

Serializable transport failures MUST redact secrets and MUST NOT include raw stacks, unbounded
stderr, credentials, access tokens, private keys, or full environment objects.

### 12.3 Retries and Idempotency

Retries MUST be explicit and bounded. Retry behavior MUST define:

- retried operation
- retryable error categories
- maximum attempts or time budget
- backoff schedule
- cancellation/deadline behavior
- final failure mapping

Write usecases marked idempotent MUST use an idempotency key, stable command identity, or documented
deduplication mechanism. If no such mechanism exists, the contract MUST say `not-supported`.

## 13. Observability

Every package-level operation that crosses an IO, storage, transport, or workflow boundary MUST emit
structured logs or spans.

Minimum log context:

- package or service
- operation
- request ID when present
- repository ID when present
- ticket ID when present
- snapshot ID when present
- remote name when present
- result status
- duration or span

Logs MUST be annotated with structured metadata instead of string-concatenating domain details.
Sensitive values MUST be redacted before logging.

The desktop app MUST expose enough status information that users can distinguish:

- not configured
- opening repository
- materializing local projection
- remote sync running
- ready
- failed
- warning-present
- push running
- push failed

## 14. Security and Operational Safety

The Electron preload boundary is a trust boundary. Desktop IPC handlers MUST:

- validate sender frame state
- reject subframe invocation unless explicitly allowed
- validate every payload
- validate repository IDs against app config before repository-scoped operations
- restrict external URL schemes to an allowlist
- return typed failures for expected security rejection

Repository paths, Git refs, collection names, pointer names, document IDs, and filesystem paths MUST
be normalized and validated before use.

Command execution MUST remain behind `@cycle/git` command services. Higher packages MUST NOT spawn
Git commands directly unless a new lower-level service contract is introduced.

Secrets and credentials MUST be supplied through Effect configuration or platform services and MUST
be redacted in logs, failures, and serialized detail maps.

## 15. Documentation and Public API Hygiene

Public APIs SHOULD include JSDoc categories that follow `vendor/effect-v4/.patterns/jsdoc.md`.

Each package README or spec MUST document:

- package responsibility
- public exports
- service/layer composition examples
- test-layer usage
- error model
- dependency boundary
- non-goals

One-off categories such as `utils`, `common`, and `misc` SHOULD NOT be introduced in public JSDoc.

## 16. Testing and Validation Matrix

### 16.1 Test Framework

Effect-returning tests MUST use `@effect/vitest` with `it.effect`. Pure synchronous tests MAY use
regular `it`. Tests MUST use `assert` methods, not Vitest `expect`.

Custom wrappers around `Effect.runPromise` SHOULD be removed once `@effect/vitest` is available to
the package. Time-dependent tests MUST use `TestClock`.

### 16.2 Conformance Tests

The implementation MUST include these conformance checks:

| Area                       | Required validation                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| Dependency graph           | Static check that disallowed `@cycle/*` imports do not exist                                     |
| Effect dependency versions | Static check that all packages use one compatible Effect v4 version range                        |
| Public schemas             | Test that every public usecase has concrete input, success, and failure schemas                  |
| RPC derivation             | Test that every RPC method maps to one usecase alias and derives matching schemas                |
| Renderer boundary          | Static check that desktop renderer imports no storage packages                                   |
| Git backends               | Shared service conformance suite for CLI, filesystem, and in-memory backends where applicable    |
| GitDB backends             | Shared GitDB collection/pointer/snapshot/sync conformance suite                                  |
| Database projection        | Materialization preserves previous active generation on failed rebuild                           |
| Database writes            | Write commits to GitDB before projection success is returned                                     |
| Usecase policy             | Status, relation, protected-section, approval, and idempotency rules are tested without Electron |
| Desktop runtime            | IPC handlers release on scope close and background sync is interrupted on shutdown               |
| Error redaction            | Failure detail maps redact secret-like fields                                                    |
| Logging                    | Representative operations include required structured annotations                                |
| UI package                 | Public UI components remain runtime-free and Storybook build passes                              |

### 16.3 Required Commands

Architecture migration work SHOULD preserve these commands:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @cycle/git test
pnpm --filter @cycle/git-db test
pnpm --filter @cycle/database test
pnpm --filter @cycle/usecases test
pnpm --filter @cycle/rpc test
pnpm --filter @cycle/desktop test
pnpm --filter @cycle/ui storybook:build
```

Package-specific migrations MAY add narrower checks, but they MUST NOT remove these broad validation
surfaces without replacing them with equivalent coverage.

## 17. Migration Plan

### Phase 1: Contract and Dependency Boundaries

1. Add static dependency graph checks for `packages/*`.
2. Align Effect dependency versions across packages.
3. Add database domain schemas for exported DTOs and pages.
4. Replace usecase `Schema.Unknown` success placeholders with concrete schemas.
5. Make RPC derive aliases, payload schemas, and success schemas from usecase contracts.
6. Move desktop renderer imports away from `@cycle/database` to application contract exports.

Exit criteria:

- No disallowed package imports remain.
- Every implemented usecase has concrete schemas.
- RPC has no direct storage DTO imports.
- Renderer has no direct storage package imports.

### Phase 2: Runtime Supervision and Resource Management

1. Introduce a desktop managed runtime boundary.
2. Replace detached desktop background `Effect.runPromise` starts with scoped fibers or
   runtime-owned callback bridges.
3. Convert database pollers and projection resources into Effect-managed services.
4. Ensure Electron IPC registration and lifecycle handlers are released on scope close.
5. Add interruption tests for bootstrap and IPC resources.

Exit criteria:

- Background tasks are interrupted during runtime disposal.
- IPC handlers are removed when their scope closes.
- No package service implementation starts unsupervised background promises.

### Phase 3: Error, Observability, and Policy Hardening

1. Convert public database and Git errors to schema-backed tagged errors.
2. Normalize lower-level failures into usecase failures and RPC failures.
3. Add structured spans and log annotations across Git, GitDB, database, usecase, RPC, and desktop
   boundaries.
4. Move remaining workflow policy out of `@cycle/database` into `@cycle/usecases`.
5. Implement or downgrade idempotency declarations for write usecases.

Exit criteria:

- Failure mapping is tested at database, usecase, RPC, and desktop boundaries.
- Secret redaction tests cover failure detail serialization.
- Usecase tests can validate workflow policy without a real database.

### Phase 4: Projection and Backend Conformance

1. Split database internals into registry, source adapter, projection store, projector, writer,
   query, warning, and status modules.
2. Wrap SQL resources behind an Effect service and decide whether to adopt Effect SQLite directly.
3. Expand Git and GitDB conformance suites across backends.
4. Add projection consistency and failed-materialization tests.
5. Add performance-oriented spans for high-read GitDB and projection paths.

Exit criteria:

- Database projection behavior is tested independently of desktop.
- GitDB and Git backend conformance suites run against all supported backends.
- Projection failures are observable and preserve previous readable state.

## 18. Implementation Checklist

The architecture migration is complete when:

- The package graph matches Section 7.
- Public domain and usecase contracts are schema-backed.
- `@cycle/usecases` is the only canonical workflow contract registry.
- `@cycle/rpc` derives from usecase contracts and contains no storage DTO ownership.
- Desktop renderer code no longer imports storage packages.
- Desktop background work and IPC handlers are runtime/scoped.
- Database projection resources are Effect-managed.
- Public errors are typed, serializable, and redacted.
- Logs and spans include required context at IO, storage, workflow, and transport boundaries.
- Tests use the vendored Effect testing pattern.
- Conformance checks cover dependency boundaries, schemas, runtime supervision, storage backends,
  projection consistency, and transport mapping.
