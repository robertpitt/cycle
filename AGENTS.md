# Cycle agent guidance

These instructions apply to the whole repository. A more deeply nested `AGENTS.md` may add to or
override them for its subtree.

## Shared project context

- This project can contain solo operations, multi-agent rooms, Kanban boards, and project memory.
  Treat them as shared context, but do not assume work is complete without evidence in project
  history or the working tree.
- Preserve unrelated user changes. Keep comments and progress narration concise.

## Effect v4 source of truth

- This repository uses Effect v4 prereleases. Before using an unfamiliar API, check the version in
  the affected package, the installed declarations/source, and the official
  [v4 documentation](https://effect.website/docs/v4). Do not copy v3 APIs or examples from a
  different v4 beta/RC without verifying them against the installed version.
- API names may change during the v4 prerelease. Use the spelling exported by the repository's pin.
  For example, this repository currently exposes `Schema.TaggedErrorClass`; newer v4 documentation
  calls the corresponding API `Schema.TaggedError`. Do not opportunistically migrate between them.
- Treat the compiler and Effect language-service diagnostics as design feedback. Resolve error,
  requirement, and unhandled-Effect diagnostics instead of casting around them.

## Core Effect model and composition

- Read `Effect<Success, Error, Requirements>` literally: the success channel is the result, the
  error channel contains expected recoverable failures, and `Requirements` lists services still
  needed. Preserve all three channels accurately.
- Keep deterministic calculations pure. Use `Effect` for side effects, failure, asynchronous work,
  resource lifetimes, concurrency, scheduling, and dependency access; do not wrap ordinary value
  transformations in `Effect.sync` merely to make them look effectful.
- Prefer Effect ecosystem utilities (`Array`, `Record`, `String`, `Option`, `Match`, `Predicate`,
  `DateTime`, and similar modules) over hand-rolled helpers when they already model the operation.
- Use `Effect.gen` for multi-step workflows. Use ordinary `if`, loops, and local variables inside the
  generator when that is clearer than deeply nested combinators.
- Define functions returning an Effect with `Effect.fn("qualifiedName")`. The name must match the
  function or service method (for example, `"TicketStore.findById"`) so traces and stack frames are
  useful. Use `Effect.fn.Return` when an explicit return type materially improves the contract.
- Pass cross-cutting operators such as `Effect.catch`, `Effect.annotateLogs`, and tracing as extra
  arguments to `Effect.fn`; do not pipe the function returned by `Effect.fn`.
- When a yielded error ends a generator, write `return yield* error` (or
  `return yield* Effect.fail(error)`) so TypeScript knows execution cannot continue.
- For short transformations, use dual APIs in whichever form is clearest: data-first for one
  operation and data-last in a pipeline. Do not use tacit/point-free calls such as `Effect.map(fn)`
  when an explicit `(value) => fn(value)` preserves generics, overloads, stack traces, or intent.
  Avoid `flow` for the same kind of opaque point-free composition.
- Effects are lazy and immutable. Do not introduce a zero-argument `() => Effect` merely for
  laziness. Use `Effect.suspend` only when effect construction itself must occur on every execution,
  to make recursive/circular definitions stack-safe, or to help TypeScript unify a deferred return
  type.
- Combine independent effects with `Effect.all`, `Effect.forEach`, `Effect.zip`, or related
  operators. Execution is sequential unless concurrency is requested; set concurrency deliberately
  and preserve input/result shape.
- Keep `Effect.run*` calls at application or integration edges. Do not run Effects inside services or
  domain logic. Prefer asynchronous execution; reserve `runSync` for effects proven to be fully
  synchronous and use an `Exit` variant when the complete outcome must be inspected.
- Start Node/Bun/browser applications with the platform `runMain` so signals, exit status, fiber
  interruption, and finalizers are handled. Represent a long-running application as a layer and use
  `Layer.launch` when the application lifecycle is naturally layer-shaped.

## Creating Effects and wrapping boundaries

- Use `Effect.succeed` for an already available value and `Effect.fail` for an already available
  expected error. Use `Effect.failSync` only when constructing the error must be deferred.
- Use `Effect.sync` only for non-throwing synchronous side effects. A throw from `sync` becomes a
  defect.
- Use `Effect.try` for synchronous APIs that can throw and `Effect.tryPromise` for Promise APIs that
  can reject. Map `unknown` into a precise domain error at the boundary. Use `Effect.promise` only
  when rejection is genuinely impossible.
- Wrap callback APIs with `Effect.callback`, annotate its success/error types, resume exactly once,
  and return cancellation cleanup or use the supplied `AbortSignal` when the underlying API can be
  interrupted.
- Prefer Effect platform abstractions over wrapping raw Node APIs repeatedly. Boundary adapters
  should be small; the rest of the program should stay in Effect.

## Errors, recovery, retry, and timeout

- Model normal domain outcomes as typed errors and broken invariants or programmer bugs as defects.
  Do not throw expected errors, and do not recover defects in ordinary domain logic.
- Use a tagged, schema-backed error when it crosses an API, persistence, process, or serialization
  boundary. Use `Data.TaggedError`/`Data.Error` for internal yieldable errors that do not need a
  schema. Include actionable fields such as operation, identifier, retryability, and a safe cause;
  do not reduce failures to unstructured message strings.
- Prefer targeted recovery with `Effect.catchTag`, `Effect.catchTags`, `Effect.catchIf`, or
  `Effect.catchFilter`. Use `Effect.catch` only when every remaining typed failure has the same
  recovery policy.
- For parent errors with a tagged `reason`, use `Effect.catchReason`, `Effect.catchReasons`, or
  `Effect.unwrapReason` rather than manually inspecting nested tags.
- Transform failures with `Effect.mapError`/`mapBoth`; observe without recovery with
  `Effect.tapError`, `tapErrorTag`, `tapCause`, or `tapDefect`. Observation code must not accidentally
  replace the original failure unless that composition is intended.
- Use `Effect.result` when a typed failure should become data, `Effect.option` only when every typed
  failure semantically means absence, and `Effect.exit` when defects, interruptions, or the complete
  `Cause` must be preserved. `Result` is a simple discriminated union; `Exit` is the comprehensive
  execution outcome.
- Inspect or recover `Cause` only at diagnostic, integration, testing, or application boundaries.
  Prefer typed operators over `sandbox`, `catchCause`, `catchDefect`, or `ignoreCause`; never hide a
  defect merely to keep a workflow moving.
- Most combinators fail fast. Use `Effect.validate` to collect all typed validation errors and
  discard successes, or `Effect.partition` to preserve both failures and successes. Represent
  multiple domain validation issues as data rather than manufacturing a multi-reason `Cause`.
- Retry only transient typed failures. Select retryable errors, bound attempts, use a `Schedule`, and
  normally combine exponential backoff with jitter. Defects and interruptions are not retry
  conditions. Remember that `times`/`recurs` count retries after the initial attempt.
- Use `Effect.timeout` for a typed `TimeoutError`, `timeoutOption` only when timeout truly means
  absence, and `timeoutOrElse` for a domain fallback/error. A timeout interrupts its source; do not
  detach work simply to make the timeout return sooner.

## Services, layers, configuration, and runtimes

- Model reusable capabilities with `Context.Service`. Give every service a stable, globally unique
  identifier containing its owning package and file path, such as `"@cycle/config/AppConfig"`.
- Keep service interfaces small and implementation-independent. Service operations should normally
  have `Requirements = never`; capture implementation dependencies while constructing the service
  in its layer instead of leaking them through every method signature. Dependency-polymorphic
  callbacks may deliberately pass their caller's requirements through.
- Construct implementations with `Service.of`. Keep a service and its focused live/test layers in
  the service's owning file unless the implementation is large enough to deserve its own focused
  subsystem file.
- Use `Context.Reference` only for configuration-like fiber-local values or feature flags with a
  safe default. Required capabilities belong in `Context.Service`.
- Treat a `Layer<Out, Error, In>` as the dependency graph and lifecycle-aware constructor for `Out`.
  Keep layers focused, then compose the graph once near the application boundary.
- Use `Layer.provide` when the supplied dependencies should be hidden from the resulting layer and
  `Layer.provideMerge` when they must remain available downstream. Use `Layer.merge`/`mergeAll` for
  independent outputs and `Layer.unwrap` when an Effect or `Config` selects the layer dynamically.
- Expose both dependency-requiring and fully wired layers when tests or alternate runtimes need the
  seam; use consistent names such as `ServiceLayer`, `ServiceLive`, `layerWithoutDependencies`, and
  `ServiceTest` within the owning package's established convention.
- Layer memoization follows layer identity and the runtime memo map. Create a layer value once,
  reuse it in one composed graph, and provide that graph near the application boundary; repeated
  factory calls create distinct resources. Use `Layer.fresh` or explicitly local provisioning only
  when a genuinely independent instance is required by the installed v4 version.
- Use `ManagedRuntime` only to bridge a stable application layer into a non-Effect host such as a UI
  framework, legacy callback, or third-party server. Build one runtime, reuse it, and dispose it when
  the host shuts down; do not create a runtime per request.
- Read configuration through `Config` and `ConfigProvider`, not `process.env` in business logic.
  Prefer `Config.finite` for ordinary numbers, `Config.redacted` for secrets, `Config.schema` for
  structured or validated values, `Config.all` for records/tuples, and `Config.nested` for namespaces.
- `Config.withDefault` handles missing input only; invalid input must still fail. Use `Config.orElse`
  only when replacing any config error, including invalid input, is intentional. In tests, use
  `config.parse(provider)`, `ConfigProvider.fromUnknown`, or provider layers instead of mutating the
  process environment.

## Resources and scopes

- Every acquired resource must have a release action. Use `Effect.acquireRelease` for a scoped
  resource, `Effect.acquireUseRelease` for a lifetime confined to one use, and `Effect.scoped` at the
  boundary that owns the scope.
- Put acquisition and release inside the layer that owns the resource. Acquisition and finalizers
  are protected against interruption; finalizers run in reverse acquisition order on success,
  failure, or interruption.
- Use `Effect.addFinalizer` for lifecycle cleanup tied to the current scope. Use `Effect.ensuring` for
  unconditional finalization, `onExit` when cleanup needs the full outcome, and `onError` only for
  failure/interruption cleanup.
- Do not manually create or extend scopes unless independent close times are a real requirement.
  Closing a scope runs finalizers but does not by itself interrupt arbitrary work not owned by that
  scope.
- Put background jobs that provide no service in `Layer.effectDiscard`, fork the loop with
  `Effect.forkScoped`, and let the layer scope interrupt it. Use `LayerMap.Service` for keyed dynamic
  resources with explicit invalidation and idle lifetime instead of a hand-built resource cache.

## Concurrency, messaging, and state

- Prefer structured concurrency. Use `Effect.forkChild` for work owned by the parent, `forkScoped`
  for work owned by a local scope, and `forkIn` for an explicitly chosen scope. Use `forkDetach` only
  for a true application-lifetime daemon; detached work outlives its caller.
- Do not rely on fiber start order or a single `yieldNow` for synchronization. Use `Deferred`,
  `Queue`, `Latch`, or another explicit coordination primitive. `Fiber.join` propagates the fiber's
  result; `Fiber.await` returns its `Exit`; `Fiber.interrupt` waits for finalizers.
- Set concurrency explicitly for concurrent `Effect.all`, `forEach`, stream transforms, and schema
  parsing. Prefer a justified numeric bound. Use `"unbounded"` only for a demonstrably bounded input
  or shutdown path where simultaneous execution is safe.
- Use `FiberSet` for scoped unkeyed groups of fibers and `FiberMap` for one replaceable fiber per key.
  Let their owning scope interrupt remaining fibers.
- Use a bounded `Queue` for work distribution and backpressure. Choose dropping/sliding semantics
  only when loss is part of the contract; avoid unbounded queues without a proven memory bound.
  Narrow shared capabilities to `Enqueue` or `Dequeue` and shut queues down in a finalizer.
- Use `PubSub` for fan-out to every current subscriber, not for load balancing. Subscribe before
  publishing, prefer bounded/dropping/sliding capacity, document message-loss semantics, and close
  the hub with its owning scope.
- Use `Deferred` as a one-shot completion signal, a semaphore's `withPermits` operation for bounded
  access with automatic release, and `Latch` for gating fibers on an event. Do not implement these
  primitives with polling and mutable booleans.
- Use `Ref` for atomic synchronous state updates, `SynchronizedRef` when the update itself is
  effectful and must be serialized, and `SubscriptionRef` when consumers need the current value plus
  a stream of changes. Allocate shared state in a layer/service rather than at module import time.

## Scheduling, caching, and batching

- Use `Effect.retry` for policies driven by failures and `Effect.repeat` for policies driven by
  successful values. Repetition includes an initial execution; use `Effect.schedule` when the first
  execution must wait for the schedule.
- Choose `Schedule.spaced` for a delay measured after completion and `Schedule.fixed` for regular
  wall-clock cadence. Compose schedules for bounds/backoff/jitter instead of writing sleep loops.
  Parse user-supplied cron expressions safely rather than using unsafe constructors.
- Use `Cache` for keyed effectful lookups, overlapping-request deduplication, capacity, TTL, refresh,
  and invalidation. Be explicit that lookup failures are cached while interrupted lookups are
  removed. Use `Effect.once` or the `cached*` APIs only for a single effect with the corresponding
  lifetime semantics.
- Use `Request` and `RequestResolver` when an external API/database supports real batching. Requests
  must have stable value equality; resolvers should close over the minimal context in a layer so
  equivalent requests can share a resolver and batch. Configure bounded resolver caching explicitly.

## Streams and sinks

- Use `Stream<A, E, R>` for zero-or-more values over time, pagination, event sources, or data too
  large/long-lived to collect eagerly. Use an `Effect` returning a collection for a small finite
  one-shot result.
- Choose constructors that preserve the source semantics: `fromIterable`, `fromEffect`,
  `fromAsyncIterable`, `callback`, `paginate`, `fromQueue`, `fromPubSub`, or schedule-based streams.
  Model callback cancellation and stream completion explicitly.
- Transform pure values with `Stream.map`/`filter` and effectful values with `mapEffect`. Bound
  concurrent `flatMap`/`mapEffect` work. Use switch semantics when only the newest inner operation
  should survive.
- Keep resources alive for the entire consumption period with `Effect.acquireRelease`,
  `Stream.fromEffect`, and `Stream.scoped`. Use `Stream.ensuring` for a finalizer that does not expose a
  resource.
- Consume with `runForEach`, `runFold`, or a `Sink`. Use `runCollect` only for streams known to be
  finite and memory-bounded. Use a Sink when reusable consumption, early termination, weighted
  folding, or leftovers matter; handle or explicitly ignore leftovers.
- Choose `concat` for sequential streams and `merge` for interleaving, and set the merge halt
  strategy deliberately. Set broadcast/buffer capacity and overflow behavior; never add an
  unbounded buffer as a generic performance fix.
- Recover typed stream failures selectively. Use `Stream.onError` for observation/cleanup and
  `Stream.catchCause` only at a boundary where recovering defects or interruptions is safe. Retry
  only transient failures with a bounded schedule.

## Schema and domain modeling

- Parse every untrusted boundary with `Schema`: HTTP params/query/body, configuration, database
  results, persisted data, events, IPC, child-process output, and external API responses. Do not use
  TypeScript-only assertions, `as`, or ad hoc manual parsing in place of runtime validation.
- Treat schemas as immutable descriptions with distinct decoded `Type`, external `Encoded`,
  `DecodingServices`, and `EncodingServices`. Keep both directions explicit when transformations or
  services are involved, and preserve the encode/decode round-trip unless normalization or
  information loss is deliberate and documented.
- Prefer readonly domain data, which Schema constructors produce by default. Respect the project's
  `exactOptionalPropertyTypes` setting: use `Schema.optionalKey` for an omittable exact key and
  `Schema.optional` only when explicit `undefined` is also valid. Use `Option`-based property schemas
  when absence should be modeled explicitly.
- Use `Schema.Struct` for structural data and `Schema.Class` when instances need validated
  construction, methods/getters, a stable identity, or class/schema dual use. Use tagged structs or
  tagged classes for discriminated unions and schema-backed tagged errors for serializable errors.
- Give durable and recursive schemas stable identifiers. Add `title`, `description`, `examples`, and
  precise messages where they improve diagnostics, generated JSON Schema, forms, or API docs.
- Prefer built-ins such as `Schema.Finite`, `Schema.Int`, ranges, string-format checks,
  `Schema.Literals`, `Schema.TemplateLiteralParser`, date/duration transforms, and built-in codecs.
  Note that `Schema.Struct({})` accepts every non-nullish value and is not an "empty object only"
  validator.
- Use filters for synchronous constraints that do not change the Type, brands for semantically
  distinct/refined types, and `SchemaGetter.checkEffect`/`transformOrFail` for validation that is
  asynchronous or requires services.
- Use `Schema.decodeTo` plus `SchemaTransformation.transform` for infallible transformations and
  `SchemaGetter.transformOrFail` for fallible/effectful ones. Use `Schema.toType` to avoid decoding
  nested elements twice when a surrounding transformation already owns their codec.
- Derive variants rather than duplicate shapes. Reuse `.fields`, `Schema.fieldsAssign`, and
  `mapFields` with `Struct.pick`, `Struct.omit`, `Struct.renameKeys`, and `Struct.map`. Preserve one
  canonical schema for each domain concept.
- Use `Schema.suspend` for recursive or mutually recursive schemas. Explicitly annotate both decoded
  and encoded recursive types when they differ, and provide an identifier if JSON Schema must emit
  recursive `$ref`s.
- Decode with the Effect interpreter when decoding can be asynchronous or require services. Use
  throwing `decodeUnknownSync`/`make` only when invalid input is exceptional; otherwise use
  Effect/Result/Option constructors as appropriate. Never skip constructor validation for untrusted
  input.
- Choose parse options deliberately: excess properties are dropped by default, all-error collection
  is opt-in, and default property ordering is not stable. Request `onExcessProperty: "error"` for
  strict contracts and `errors: "all"` for user-facing validation.
- Keep constructor defaults, decoding defaults, and documentation `default` annotations distinct.
  Defaults should be lazy when each instance needs a new value.
- JSON Schema describes the canonical encoded JSON representation, not necessarily the decoded
  class/type. Annotate the encoded side when metadata belongs to the wire format. Prevent JSON
  encoding of secrets with the relevant Redacted/schema option instead of relying on convention.

## Data types and pure logic

- Use `Option` for absence, not a catch-all for failures. Use `Option.match`/combinators instead of
  unsafe extraction. Keep `Option.gen` and `Result.gen` pure; side effects belong in `Effect`.
- Use `Match` for non-trivial tagged unions and finish with `Match.exhaustive` whenever all variants
  should be covered. Use `_tag` as the discriminant unless a boundary contract requires another key.
- Use the `Predicate` module for runtime guards and compose its predicates; do not create generic
  helpers such as `isRecord`, `isString`, or `isObject` when Effect already supplies them.
- Use `DateTime` and the `Clock` service instead of mutable `Date`/`Date.now` in Effect logic that
  needs testable current time, safe parsing, calendar arithmetic, or time-zone handling. Use
  `Duration` for non-negative spans, delays, schedules, and timeouts.
- Use `Redacted` for secrets and reveal with `Redacted.value` only at the narrow boundary that needs
  the secret. Never log or annotate a revealed value.
- Construct `BigDecimal` from decimal strings or integers, not floating-point numbers. Use `Chunk`
  only where repeated concatenation justifies it; ordinary arrays are preferred otherwise.
- Use `Equal.equals` for structural equality and Effect `HashMap`/`HashSet` when collections need
  value-based keys/elements. Implement both `Equal` and compatible `Hash` only when domain equality
  intentionally differs from the default structural behavior.

## Observability

- Use Effect logging instead of `console.*` in application code. Select the correct level and attach
  structured metadata with `Effect.annotateLogs`; annotations propagate to nested effects, so keep
  them low-cardinality and free of secrets.
- Wrap meaningful operations and service methods in named spans (`Effect.fn` supplies a method span;
  use `Effect.withSpan` for larger workflows) and add useful identifiers with
  `Effect.annotateCurrentSpan`. Do not add spans around every trivial pure transformation.
- Use counters for cumulative event counts, gauges for current values, histograms for aggregatable
  distributions, summaries only for local sliding-window quantiles, and frequencies for distinct
  string occurrences. Keep metric names/attributes stable and low-cardinality.
- Configure loggers, log levels, tracing exporters, and metric exporters as layers at the application
  boundary. Do not install observability globally from a domain module.

## Platform, HTTP, SQL, processes, and CLI

- Depend on Effect's `FileSystem`, `Path`, `Terminal`, and platform services in domain/application
  code. Provide Node, Bun, browser, or test layers only at the runtime boundary. Prefer scoped temp
  files/directories and scoped file handles.
- Build outbound HTTP integrations with `HttpClient`: configure base URL, headers, status filtering,
  and transient retry once on the client, then validate every response body with `Schema` and map
  platform failures into an integration-specific error.
- Keep `HttpApi`, groups, endpoints, middleware/security, and all request/response/error schemas in a
  shareable contracts package separate from server implementations. Use group/API prefixes for
  shared paths and place catch-all `"*"` routes last.
- Implement HttpApi groups with `HttpApiBuilder.group`, compose handler layers with
  `HttpApiBuilder.layer`, serve with `HttpRouter.serve`, and use `toWebHandler` only at a serverless
  or host-framework boundary. Represent authentication with `HttpApiMiddleware` and
  `HttpApiSecurity`, exposing authenticated data as typed middleware services.
- Generate clients with `HttpApiClient.make`. Apply base URL, auth, and retry through client
  transformation/middleware so endpoint and schema changes remain compile-time checked. Test APIs
  with `HttpApiTest` and an in-memory typed client rather than starting a real server for handler
  tests.
- Use Effect SQL modules and driver layers for database access. Decode rows and parameters with
  schemas/models, map driver errors at the repository boundary, run migrations explicitly, and keep
  database services behind owning package interfaces.
- Run child processes through `ChildProcessSpawner`. Use collected string/line helpers for bounded
  output and scoped process handles plus streams for long-running output. Treat non-zero exit codes
  and decode failures as typed errors.
- Build CLIs with Effect's typed `Command`, `Argument`, and `Flag` APIs. Reuse flag definitions,
  document defaults/examples, compose subcommands, provide platform services once, and execute with
  `runMain`.

## Testing

- Write Effect tests with `@effect/vitest` and `it.effect`; do not call `Effect.runPromise` inside an
  Effect test. Use `it.live` only when the test intentionally needs live default services.
- Test through public service contracts with small deterministic test layers. Provide dependencies
  with layers rather than module mocks or process-global mutation. Use a shared `layer(...)` block
  only when cross-test shared state is intentional; otherwise give each test fresh state.
- Test time with `TestClock`: fork the workflow that sleeps/repeats, adjust or set virtual time, then
  join/inspect the fiber. Never make unit tests wait for wall-clock time.
- Use Schema-derived property tests for invariants and round trips. Assert typed failures and `Exit`
  causes when failure behavior matters, including finalization and interruption.
- Put exported test layers and reusable fixtures under `src/testing`; keep one-off test helpers next
  to the tests that own them.

## Cycle package architecture

- Prefer low-code solutions built from Effect and its ecosystem over custom imperative frameworks.
  Centralize side effects, concurrency, state, errors, and resources in Effects while keeping pure
  calculations pure and composable.
- Give every package a single clear purpose and stable boundary. Avoid cross-package dependencies
  that create cycles or couple implementation details; move genuinely shared concepts to their
  canonical owning package.
- Do not re-export another package's types, schemas, services, layers, constants, or helpers as a
  convenience facade. Every symbol has one canonical owner and consumers import it from that owner.
- Keep `src/` shallow and discoverable. A root file such as `ServiceName.ts` owns one primary public
  service/domain concept and its matching layer; split substantial subsystems into focused
  `ServiceNameSubsystem.ts` files instead of monoliths.
- Put private implementation details in `src/internal` and do not export them from the package.
  Put public testing-only implementations in `src/testing` so production exports stay focused.
- Before completing an Effect change, run the narrowest relevant tests plus package/repository
  typecheck, lint, and format checks. Verify that the application boundary has no accidental service
  requirements, typed failures are handled at the correct layer, and every acquired resource or
  long-running fiber has an explicit owner.
