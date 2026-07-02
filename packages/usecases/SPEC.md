# @cycle/usecases Effect-Native Definition Specification

Status: Draft implementation specification

Version: 0.2.0

Package: `@cycle/usecases`

## 1. Purpose

`@cycle/usecases` defines the application workflow boundary for Cycle as a set of named,
schema-backed, runnable Effect v4 usecase definitions. The package exists to let API, CLI, MCP,
desktop, CI, and test callers execute the same domain workflows without carrying transport-specific
validation, orchestration, dependency wiring, or policy code.

The primary design goal for v0.2 is to reduce custom runner code by leaning into Effect v4 primitives:
`Schema` for validation and normalization, `Context.Service` and `Layer` for dependencies, `Scope`
for scoped resources, and `Effect` for interruption, timeout, logging, tracing, and typed failures.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document are
to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means an implementation may choose the behavior, but it MUST document that
choice and expose enough information for callers and conformance tests to reason about it.

## 3. Problem Statement

The v0.1 architecture centralizes usecase execution in a broad runner that manually decodes inputs,
validates metadata, dispatches through a large switch, extracts repository and ticket identifiers by
object inspection, normalizes selected outputs, maps failures, and emits observability data. This
duplicates responsibilities that Effect v4 and the contract schemas can already carry.

That design makes each new usecase pay a high orchestration tax. It also hides the real workflow
logic inside a central dispatcher instead of colocating each usecase definition with its schema,
metadata, and handler. Cycle needs a usecase layer where the common execution pipeline is generated
once, while each usecase declares only its schema contract and domain handler.

## 4. Goals

`@cycle/usecases` v0.2 MUST:

1. Expose named runnable usecase definitions as the primary public API, for example
   `IssueCreate.run(input, meta?)`.
2. Remove the central public `UseCaseRunner.run(useCase)` model from the target architecture.
3. Define every usecase through one shared `defineUseCase()` helper.
4. Decode every input and success value through the usecase's Effect `Schema`.
5. Move state-independent validation and normalization into schemas.
6. Move state-dependent workflow rules into Effect services such as `WorkflowPolicy`.
7. Let handlers yield required dependencies directly from the Effect environment.
8. Keep repository scope explicit in usecase input data.
9. Return typed schema-backed failures that can be serialized and redacted at adapter boundaries.
10. Reduce custom orchestration code structurally by deleting central dispatch, duplicated
    validation, repeated output normalization, and generic object crawling.

## 5. Non-Goals

`@cycle/usecases` v0.2 MUST NOT:

1. Expose a dynamic string-name usecase API.
2. Expose or preserve legacy aliases such as `ticket.issue.create`.
3. Require adapters to construct `{ name, input, meta }` command envelopes for normal operation.
4. Own durable storage, GitDB ref layout, SQLite projection schema, or repository materialization.
5. Implement HTTP, IPC, CLI, MCP, Electron, or CI transport code.
6. Execute arbitrary shell commands or own agent process orchestration.
7. Recreate a second domain document model incompatible with `@cycle/database`.
8. Reimplement Effect runtime behavior with package-local timeout, scope, logging, or dependency
   containers.

Adapters MAY keep temporary alias or string-dispatch migration code outside `@cycle/usecases`, but
that code is not part of this package's target contract.

## 6. System Overview

### 6.1 Layer Position

Cycle runtime layers are:

```text
Level 1: @cycle/git and @cycle/git-db
  Git repository inspection, Git objects, GitDB documents, refs, fetch, push, history, diffs

Level 2: @cycle/database
  repository registry, GitDB-backed persistence, SQLite projection, read model, materialization

Level 3: @cycle/usecases
  runnable usecase definitions, schema contracts, workflow policy, orchestration helpers

Level 4: adapters and applications
  desktop backend, renderer client, API, CLI, MCP, CI, tests
```

Adapters MUST call concrete exports from `@cycle/usecases` for user-facing Cycle workflows. They MUST
NOT call `@cycle/database` directly for domain workflows except during test setup, migrations, or
documented infrastructure composition.

### 6.2 Main Components

- Usecase definition: a value exported by name, such as `IssueCreate`, containing metadata, schemas,
  and a generated `run(input, meta?)` method.
- `defineUseCase()`: the only helper that builds the shared execution pipeline.
- Schema module: owns input, metadata, success, and failure schemas for boundary validation.
- Workflow policy services: own state-dependent rules such as transition policy, relation policy,
  protected-section policy, and automation policy.
- Effect services and layers: provide database, policy, clock, ID generation, telemetry, and scoped
  repository capabilities.
- Adapter code: imports concrete usecases and provides the required layers.

### 6.3 External Dependencies

Core runtime dependencies are:

- `effect` for `Effect`, `Schema`, `Context.Service`, `Layer`, `Scope`, logging, tracing, clocks,
  interruption, timeout, and tests.
- `@cycle/database` for durable state, projection access, repository operations, and persisted
  domain document types.
- `@cycle/contracts` for reusable domain schemas and transport-neutral data contracts where useful.

`@cycle/usecases` SHOULD avoid direct dependencies on Electron, React, HTTP frameworks, process
arguments, terminal I/O, or adapter-specific serialization libraries.

## 7. Public API Contract

### 7.1 Named Usecase Definitions

Each public usecase MUST be exported as a named definition with a generated `run` method:

```ts
import { IssueCreate } from "@cycle/usecases";

const ticket =
  yield *
  IssueCreate.run(
    {
      repository: { id: "cycle-local" },
      input: {
        title: "Document the usecase layer",
        type: "task",
      },
    },
    {
      requestId: "req-1",
      source: "cli",
    },
  );
```

The primary `run` signature MUST be:

```ts
run(input, meta?)
```

`input` MUST be decoded with the usecase input schema. `meta` MUST be decoded with the shared
metadata schema. The returned value MUST be an `Effect` whose success type is the decoded success
schema type and whose failure type is a usecase failure union.

### 7.2 Dynamic Dispatch

`@cycle/usecases` MUST NOT expose a public `runUseCase(name, input, meta?)`,
`UseCaseRunner.run(useCase)`, alias registry, or string-name dispatcher in the v0.2 target
architecture.

Adapters that receive external string operations MUST map those strings to concrete usecase imports
outside `@cycle/usecases`.

### 7.3 Definition Shape

Every usecase MUST be declared through `defineUseCase()` or a package-local helper built directly on
it.

```ts
export const IssueCreate = defineUseCase({
  name: "IssueCreate",
  input: RepositoryScoped(CreateIssueInput),
  success: TicketDocumentOutput,
  sideEffect: "write",
  repositoryScope: "single",
  handler: (input, ctx) =>
    Effect.gen(function* () {
      const db = yield* DatabaseService;
      const policy = yield* WorkflowPolicy;

      yield* policy.validateIssueCreate(input, ctx);

      return yield* db.createTicket(input.repository.id, input.input);
    }),
});
```

The definition MUST include:

- `name`: stable canonical export and trace name.
- `input`: Effect `Schema` for decoded runtime input.
- `success`: Effect `Schema` for decoded runtime success output.
- `sideEffect`: `read`, `write`, `sync`, `push`, or `evaluate`.
- `repositoryScope`: `none`, `single`, or `multi`.
- `handler`: Effect handler for domain behavior.

The definition MAY include a description, category, idempotency posture, and documentation metadata.
It MUST NOT include compatibility aliases.

## 8. Core Domain Model

### 8.1 Domain Type Source

`@cycle/database` remains the source of durable persisted document and query semantics, including
ticket documents, drafts, records, labels, users, saved views, templates, repository status,
materialization warnings, history, diffs, and search pages.

`@cycle/usecases` MAY re-export domain types for caller ergonomics, but it MUST NOT fork their
meaning or introduce incompatible document shapes.

### 8.2 Repository Scope

Repository-scoped usecases MUST keep the repository reference in input data:

```ts
{
  repository: { id: string },
  input: ...
}
```

The repository reference identifies the target repository. Effect layers provide the services that
open, resolve, read, write, sync, or push repository state. A handler MUST NOT infer the selected
repository from global mutable state when the usecase input declares a repository reference.

### 8.3 Metadata

Usecase metadata MUST be schema-backed. The shared metadata schema SHOULD include:

- `requestId`
- `actor`
- `source`
- `idempotencyKey`
- `dryRun`
- `deadline`
- `traceContext`

The `defineUseCase()` pipeline MUST decode metadata before handler execution and make decoded
metadata available to handlers through a typed usecase context.

## 9. Validation and Schemas

Schemas are the source of truth for state-independent validation.

The implementation MUST encode these concerns in schemas rather than runner or handler conditionals
when they do not require current repository state:

- required fields
- unknown/excess input fields
- canonical ticket type IDs
- positive integer limits
- non-empty trimmed text where the command requires meaningful text
- enum values
- output normalization that is independent of current state
- serializable failure shapes

Usecase input and success decoding MUST use strict excess-property behavior unless a schema
explicitly declares extension fields.

State-dependent validation MUST NOT be placed in schemas when it requires repository state, current
documents, actor authorization against state, or workflow configuration. Those rules belong in
Effect services.

## 10. Dependency and Layer Contract

Handlers MUST yield dependencies directly from the Effect environment:

```ts
const db = yield * DatabaseService;
const policy = yield * WorkflowPolicy;
const clock = yield * Clock.Clock;
```

Application entrypoints MUST provide the required services with Effect layers. Test code MUST be able
to provide deterministic layers without a real Git remote, Electron app, API server, or network
service.

Required service categories are:

- database and repository persistence services
- workflow policy services
- clock/time services
- ID generation services where IDs are not supplied by storage
- telemetry/logging/tracing services where custom behavior is needed
- scoped repository resources where a workflow opens or locks resources

`@cycle/usecases` MUST NOT pass a large dependency object through every handler when the same
dependency can be yielded from the Effect environment.

## 11. Runtime Workflow

### 11.1 `defineUseCase()` Algorithm

`defineUseCase()` MUST generate a `run(input, meta?)` method equivalent to:

```text
run(input, meta):
  decode metadata with UseCaseMeta schema
  decode input with definition.input schema
  derive usecase context from definition metadata and decoded metadata
  annotate logs and spans with requestId, source, usecase, sideEffect, repositoryId when available
  apply deadline or timeout with Effect primitives when metadata declares one
  call definition.handler(decodedInput, context)
  map known storage, policy, schema, timeout, and interruption failures to usecase failures
  decode handler success with definition.success schema
  return decoded success or typed usecase failure
```

This pipeline MUST be implemented once. Individual usecases MUST NOT duplicate input decoding,
success decoding, deadline handling, span/log setup, or generic failure mapping.

### 11.2 Handler Rules

A handler MUST contain only domain-specific workflow behavior:

- yielding required services
- reading current state when a policy requires it
- invoking workflow policy services
- invoking persistence operations
- composing usecase-specific results

A handler MUST NOT:

- decode its own top-level input
- decode its own top-level success value
- inspect unknown objects to find repository or ticket IDs
- implement schema-equivalent validation
- implement generic timeout, tracing, or logging setup
- map database failures through custom ad hoc branches unless the usecase has a specific failure
  category such as push failure

### 11.3 Scoped Resources and Concurrency

Usecases that open, lock, sync, push, or otherwise manage resources SHOULD use Effect `Scope`,
scoped services, or scoped database APIs. Repository-scoped writes, syncs, and pushes MUST be
serialized per repository by either `@cycle/usecases`, `@cycle/database`, or a documented lower layer.

If serialization is delegated to `@cycle/database`, the usecase spec MUST still require that policy
validation and mutation are not separated by an unprotected conflicting write window.

## 12. Workflow Policy Services

`WorkflowPolicy` and related services own state-dependent policy. The default policy surface SHOULD
cover:

- issue transition rules
- human approval gates
- planning readiness rules
- protected section checks
- relation add/remove rules
- draft commit rules
- automation evaluation rules

Policy methods MUST return typed failures rather than storage failures when a command violates a
workflow rule.

Policy services MAY be split by domain when that keeps handlers smaller, for example
`IssueWorkflowPolicy`, `RelationPolicy`, and `AutomationPolicy`. Splitting policy services is
implementation-defined, but handlers MUST still yield them from the Effect environment.

## 13. Failure Model

Usecase failures MUST be schema-backed tagged errors using Effect v4 error classes or an equivalent
schema-backed tagged representation.

The failure model MUST include typed categories for:

- invalid input
- policy violation
- not found
- authorization failure
- conflict
- repository not open or unavailable
- storage failure
- consistency failure
- sync failure
- push failure
- timeout
- interruption
- unexpected defect or invalid success output

Failures crossing adapter boundaries MUST be serializable and redacted. Failure serialization MUST
not expose secrets, stack traces, raw causes, credentials, tokens, private keys, or unredacted
provider responses.

The `defineUseCase()` pipeline MUST map schema decode failures to invalid input failures and success
decode failures to unexpected defect failures.

## 14. Adapter Contract

Adapters MUST import concrete named usecases:

```ts
import { IssueCreate, RepositoryStatusGet } from "@cycle/usecases";
```

Adapters MUST provide Effect layers that satisfy the services required by the invoked usecases.

Adapters are responsible for:

- transport parsing
- route, command, or tool selection
- mapping any external legacy names to concrete imports during migration
- process exit codes, HTTP status codes, IPC status, or MCP response wrapping
- presenting serialized failures to users

Adapters MUST NOT reimplement usecase input validation, success validation, workflow policy, or
storage failure normalization.

## 15. Observability

Every `run()` invocation SHOULD emit one parent span named from the usecase definition and source
metadata. The shared pipeline SHOULD annotate logs and spans with:

- `service`
- `useCase`
- `requestId`
- `source`
- `sideEffect`
- `repositoryId` when the decoded input declares one
- `actorType` when metadata declares one
- completion result and duration

Handlers MAY add child spans only for meaningful domain work, such as policy evaluation, repository
sync, push, or multi-step automation evaluation. The implementation SHOULD avoid tracing every
schema decode or trivial helper call as a separate span.

## 16. Security and Safety

External adapter input is untrusted until decoded by the concrete usecase's input schema.

The package MUST reject undeclared input fields by default unless a schema explicitly declares an
extension surface. Extension fields MUST be preserved only where the domain contract says producers
own that data.

Secret-bearing keys and diagnostics MUST be redacted in serialized failures and logs. The default
redaction policy MUST cover keys matching common token, secret, password, credential, API key, and
private key names.

`@cycle/usecases` MUST NOT execute shell commands directly. Any future command execution or agent
workflow belongs to a separately specified package or service.

## 17. Test and Validation Matrix

Conformance tests MUST cover:

- `defineUseCase()` input decoding, metadata decoding, handler execution, success decoding, timeout,
  failure mapping, and span/log annotations.
- Schema-level validation for canonical ticket type IDs and non-empty meaningful text commands such
  as comment creation.
- Representative read usecase with provided database layer.
- Representative write usecase with provided database and policy layers.
- Policy failure returning a policy violation failure.
- Storage failure returning a storage failure.
- Success schema violation returning an unexpected defect failure.
- Failure serialization and redaction.
- Adapter compile or integration checks proving adapters import concrete usecases rather than
  `UseCaseRunner.run`.

Tests SHOULD prefer deterministic Effect layers over real remotes, real network services, or
Electron runtime setup.

## 18. Migration Checklist

Implementers SHOULD migrate in this order:

1. Add schema-backed metadata and failure classes.
2. Add `defineUseCase()` and contract tests for its generated pipeline.
3. Convert one read usecase and one write usecase to named runnable definitions.
4. Move schema-equivalent validation out of the runner and into schemas.
5. Move state-dependent validation into workflow policy services.
6. Convert the remaining usecases to named runnable definitions.
7. Update API, CLI, MCP, desktop, CI, and tests to import concrete usecases.
8. Delete legacy aliases and dynamic runner exports from `@cycle/usecases`.
9. Remove central switch dispatch, object-crawling helpers, repeated normalization helpers, and
   per-usecase runner plumbing.

The migration is complete only when `@cycle/usecases` has no public dynamic runner API and no
package-owned alias registry.
