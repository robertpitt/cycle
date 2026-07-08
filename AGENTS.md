# cycle guidance

This project can contain solo operations, multi-agent rooms, and Kanban boards.
Treat sibling rooms, solo operations, board tickets, and project memory as shared context.
Do not assume another room has completed work unless there is evidence in the project history.
Keep comments concise and avoid bloated narration.

## Effect v4 design rules

- Prefer `Effect.gen` for multi-step Effect code and `Effect.fn("name")` for functions that return effects. The `Effect.fn` name should match the function name; pass extra behavior such as `Effect.catch`, `Effect.annotateLogs`, or tracing as additional arguments instead of piping the returned function.
- Avoid zero-argument thunks that only return an `Effect`. They are typically an anti-pattern; define the `Effect` directly and reuse it. Use a thunk returning an `Effect` only when synchronous code must run before the effect is created.
- When raising an error inside `Effect.gen` or `Effect.fn`, use `return yield* new MyError(...)` so TypeScript understands execution does not continue.
- Wrap boundary code deliberately: `Effect.succeed` for already-available values, `Effect.sync` for non-throwing synchronous side effects, `Effect.try` for throwing synchronous code, and `Effect.tryPromise` for Promise APIs. Map thrown or rejected causes into typed domain errors.
- Define custom recoverable errors with `Schema.TaggedErrorClass` or `Schema.ErrorClass`; use `Effect.catchTag` and `Effect.catchTags` for targeted recovery. For parent errors with typed `reason` fields, use `Effect.catchReason`, `Effect.catchReasons`, or `Effect.unwrapReason`.
- Structure dependencies as services with `Context.Service` and return implementations with `Service.of`. Attach static layers to services; use `Context.Reference` only for config-like values or feature flags that have a safe default.
- Keep layers focused and compose them with `Layer.provide` and `Layer.provideMerge`. Use `Layer.unwrap` when a layer must be selected from `Config` or another effect.
- Manage resources with `Effect.acquireRelease` inside layers so finalizers run when the layer scope closes. Use `Effect.addFinalizer` for resources such as `PubSub` that need explicit shutdown.
- Put background jobs in `Layer.effectDiscard` and fork long-running loops with `Effect.forkScoped` so they are interrupted when the layer scope closes.
- Use `LayerMap.Service` for keyed dynamic resources such as tenant pools instead of hand-rolled caches. Use bounded `PubSub` for fan-out event buses when backpressure matters.
- Run application entrypoints with `NodeRuntime.runMain` or `BunRuntime.runMain`; represent long-running apps as layers and launch them with `Layer.launch`.
- Keep HTTP API definitions schema-first and shareable. Define `HttpApi`, `HttpApiGroup`, `HttpApiEndpoint`, and `Schema` contracts outside server implementation code so clients can depend on contracts without importing server wiring.
- Model endpoint params, query, payload, success, and error shapes with `Schema`; do not rely on TypeScript-only types, ad hoc parsing, or unvalidated `unknown` at process boundaries.
- Implement routes with `HttpApiBuilder.group` and compose them with `HttpApiBuilder.layer`. Serve composed route layers with `HttpRouter.serve`; use `HttpRouter.toWebHandler` only for serverless/web-handler targets.
- Use `.prefix` on APIs or groups for shared path segments instead of repeating prefixes in each endpoint. Catch-all `"*"` endpoints must be last and are not represented in OpenAPI.
- Represent auth and protected resources with `HttpApiMiddleware` plus `HttpApiSecurity` at the endpoint, group, or API level. Prefer typed middleware-provided services over directly reading raw request cookies or headers for protected flows.
- Use `Schema.Class`, `Schema.TaggedClass`, `Schema.Opaque`, and `Schema.TaggedErrorClass` for durable domain models and typed errors. Put HTTP statuses on API error schemas where the transport contract needs them.
- Prefer built-in schema checks and transformations: `Schema.Finite`, integer and range checks, string format checks, `Schema.Literals`, `Schema.brand`, `Schema.refine`, `Schema.decode`, and `Schema.decodeTo`. Keep encoded and decoded types explicit when transformations or defaults are involved.
- Derive schema variants instead of duplicating shapes. Reuse `.fields`, `Schema.fieldsAssign`, and `mapFields` helpers such as `Struct.pick`, `Struct.omit`, `Struct.renameKeys`, and `Struct.map`.
- Use `Schema.suspend` for recursive schemas, including recursive classes, and annotate the codec type when encoded and decoded recursive types differ.
- Generate typed clients with `HttpApiClient.make` from the shared API definition. Apply base URLs, auth middleware, and retry policies with `transformClient`; generated clients should mirror API renames and schema changes at compile time.
- Read configuration through `Config` and `ConfigProvider`, not raw `process.env` reads inside business logic. Use `Config.all` for structured config, `Config.nested` for scoped keys, and `Config.redacted` for secrets.
- Use `Config.withDefault` only for missing keys; validation errors should still fail. Use `Config.orElse` only when swallowing any config error is intentional. Provide defaults and test config through `ConfigProvider.layer` or `ConfigProvider.layerAdd`.

## Cycle project guidance

- We am for low code solutions, heavility utilising the effect system instead of imperative code. We prefer to use the effect system for all side effects, including async operations, state management, and error handling, string utilitiies, and data transformations. This approach promotes composability, testability, and maintainability of the codebase.
- Each package should have a clear purpose and well-defined boundaries. Avoid cross-package dependencies that create tight coupling. Use shared libraries for common utilities and abstractions.
- Do not re-export types, schemas, services, layers, constants, or helpers from another package to create convenience facades. Each symbol should have one canonical owning package import path, and consumers should import it from that owner directly. Package exports should expose code owned by that package, not preserve or aggregate another package's API.
- Within each package, the src directory should contain a list of files in the root, such as ServiceName.ts, ServiceNameSubSystem.ts and AnotherService.ts, each file will contain a export a single primary service (and possibly some smaller helper services) along with the ServiceNameLive layer. Avoid creating large monolithic files that contain multiple services or unrelated functionality. Instead, break them down into smaller, focused files that are easier to understand and maintain.
- Within the src directory, we should create an internal directory for internal implementation details that are not intended to be used outside of the package. This can include private helper functions, types, and constants that are only relevant to the package's internal workings. By keeping these details internal, we can maintain a clean and well-defined public API for the package.
- If the package exports test layers, we should have those layers ddefined wtihin the src/testing directory where we can export code that specifically can be used in tests. This can include mock implementations of services, test utilities, and other testing-related code. By keeping testing code separate from the main src directory, we can ensure that the package's public API remains focused and uncluttered.
