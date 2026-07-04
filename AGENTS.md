# cycle guidance

This project can contain solo operations, multi-agent rooms, and Kanban boards.
Treat sibling rooms, solo operations, board tickets, and project memory as shared context.
Do not assume another room has completed work unless there is evidence in the project history.
Keep comments concise and avoid bloated narration.

## Effect v4 design rules

- Prefer `Effect.gen` for multi-step Effect code and `Effect.fn("name")` for functions that return effects. The `Effect.fn` name should match the function name; pass extra behavior such as `Effect.catch`, `Effect.annotateLogs`, or tracing as additional arguments instead of piping the returned function.
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
