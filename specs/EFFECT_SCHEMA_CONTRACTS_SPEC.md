# Effect Schema Contracts Specification

Status: Draft implementation specification

Version: 0.1.0

Scope: `@cycle/contracts`, `@cycle/api`, `@cycle/usecases`, `@cycle/desktop`,
`@cycle/database`, `@cycle/agents`, `@cycle/codex-app-server`, and protocol adapters that cross
process, network, filesystem, persistence, or provider boundaries.

## 1. Purpose

This specification defines the migration from split TypeScript interfaces, hand-written validators,
and ad hoc casts to Effect Schema-backed contracts. The target outcome is one canonical
application-facing contract surface that can be shared across packages where it makes sense while
still allowing lower packages to retain implementation-specific internal schemas.

The migration is allowed to make breaking changes. Cycle is unreleased, so correctness, strictness,
and long-term contract clarity take priority over preserving current under-specified wire formats or
database files.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means the implementation may choose the behavior, but it MUST document the
choice in code or package documentation and expose enough tests for reviewers to reason about it.

`Canonical contract` means a runtime Effect Schema value plus its derived TypeScript type and codec
behavior. A TypeScript-only interface is not a canonical contract.

## 3. Source Guidance

Work covered by this specification MUST follow:

- `SPEC.md`, especially the package graph and schema-backed contract requirements.
- `vendor/effect-v4/.patterns/effect.md`
- `vendor/effect-v4/.patterns/testing.md`
- `vendor/effect-v4/ai-docs/src/51_http-server/index.md`
- `vendor/effect-v4/ai-docs/src/51_http-server/10_basics.ts`

Effect `HttpApi` is the preferred API definition layer because it provides schema-first HTTP APIs,
runtime validation, typed clients, and OpenAPI documents from one definition.

## 4. Problem Statement

Cycle already has Effect Schema in several important places, especially `@cycle/contracts` and
`@cycle/api`. The implementation still has contract drift:

- Application-facing DTO types are partially re-exported from storage packages.
- Usecase contract schemas are not strongly typed end to end.
- HTTP endpoints still use `AnyPayload`, broad resource envelopes, and manually transformed query
  inputs.
- Renderer and MCP clients parse JSON and then trust generic casts.
- Chat, agent, desktop IPC, app-server JSON-RPC, and persisted JSON boundaries contain hand-written
  validators.
- `Schema.Unknown` appears in places where the data has application meaning.

These gaps make validation inconsistent, OpenAPI output incomplete, and package contracts harder to
share safely.

## 5. Goals

The migration MUST:

1. Make `@cycle/contracts` the canonical owner of all app-facing DTO, usecase, and API schemas.
2. Preserve package-local schemas for implementation-specific internal data.
3. Derive TypeScript types from Effect Schema values instead of maintaining parallel interfaces.
4. Build the public REST API entirely from Effect schemas and Effect `HttpApi` definitions.
5. Generate OpenAPI from the same API definition that powers runtime request and response
   validation.
6. Replace public-boundary `as any`, broad `Schema.Unknown`, `AnyPayload`, and hand-written
   validators with schema-backed decode/encode operations.
7. Validate only untrusted boundaries by default; internal package calls MAY rely on TypeScript and
   Effect service types after data has been decoded.
8. Use one canonical usecase failure schema across implemented usecases.
9. Be strict by default while allowing explicitly named extension fields where preserving unknown
   provider or user data is required.
10. Provide conformance tests that make schema ownership, OpenAPI generation, and boundary
    validation checkable.

## 6. Non-Goals

This specification MUST NOT:

1. Require UI component props to become Effect schemas unless they cross an untrusted boundary.
2. Require every internal pure helper or service method to decode its already-typed inputs.
3. Require `@cycle/contracts` to own storage-private or provider-private schemas.
4. Preserve current wire formats where they conflict with stricter canonical contracts.
5. Require backwards-compatible migration of existing local database files.
6. Replace lower-package implementation schemas that serve different internal persistence or
   provider needs.

## 7. Contract Ownership Model

### 7.1 Canonical App-Facing Ownership

`@cycle/contracts` MUST own schemas for:

- App-facing repository, issue, draft, comment, record, initiative, label, user, view, template,
  inbox, automation, agent-chat, and configuration DTOs returned to API, desktop renderer, MCP, or
  other user-facing adapters.
- All usecase input schemas.
- All usecase success schemas.
- The canonical usecase failure schema.
- Usecase metadata, actor, idempotency, side-effect, and repository-scope metadata.
- REST envelope schemas that are part of the public app API contract.
- API route contract metadata needed to build Effect `HttpApi` endpoints.

`@cycle/contracts` MUST NOT import runtime implementation code from `@cycle/api`, `@cycle/usecases`,
`@cycle/desktop`, or `@cycle/ui`.

`@cycle/contracts` SHOULD NOT import storage DTO types from `@cycle/database` or `@cycle/git-db` for
app-facing schemas after this migration. Transitional type-only aliases MAY exist during migration
but MUST be removed before this spec is considered complete.

### 7.2 Package-Local Schema Ownership

Lower packages MAY own schemas for data that is private to their live implementation:

- `@cycle/git`: Git command, ref, object, and process result details.
- `@cycle/git-db`: GitDB object storage, snapshots, refs, transactions, and sync internals.
- `@cycle/database`: projection rows, persisted document snapshots, event payloads, cursors, and
  database-specific normalization.
- `@cycle/agents`: provider-private raw events, provider capabilities, and provider response
  normalization.
- `@cycle/desktop`: Electron-only app config and local platform files.
- `@cycle/codex-app-server`: generated or imported JSON-RPC protocol internals.

Package-local schemas MAY be mapped to canonical app-facing schemas at trusted package boundaries.
That mapping MUST be explicit and covered by tests when field names, nullability, or invariants
differ.

### 7.3 No Parallel Public Contracts

Public adapters MUST NOT redefine an app-facing shape that already has a canonical schema in
`@cycle/contracts`. They MUST import, compose, or wrap the canonical schema.

Allowed wrappers include:

- HTTP route params, query params, and envelopes.
- MCP tool request wrappers containing `repositoryId`, `requestId`, or tool-specific transport
  fields.
- Desktop IPC envelopes that wrap a canonical payload.
- WebSocket and SSE message envelopes that wrap canonical chat or agent events.

Wrappers MUST NOT duplicate nested DTO fields.

## 8. Strictness and Unknown Data Policy

### 8.1 Default Strictness

Schemas at public or persisted boundaries MUST reject undeclared top-level fields unless the schema
explicitly declares an extension field.

Boundary decoders MUST fail closed:

- Invalid input MUST produce a typed validation or protocol failure.
- Invalid successful output MUST produce a typed protocol failure before it is returned to callers.
- Invalid persisted JSON MAY be dropped, quarantined, or converted to a materialization warning, but
  MUST NOT be silently trusted.

### 8.2 Extension Fields

Unknown values MAY be preserved only in explicitly named fields whose purpose is to carry extension
data. Examples include:

- `metadata`
- `providerMetadata`
- `raw`
- `payload` for linked records where the record kind owns the nested payload externally
- `details` on failures
- future `extensions` fields

Each extension field MUST document:

- Whether unknown keys are preserved, filtered, or redacted.
- Whether values are safe to persist.
- Whether values may be exposed through API, MCP, logs, or UI.
- Whether nested values are treated as JSON-only or arbitrary `unknown`.

`Schema.Unknown` MUST NOT be used as a shortcut for under-specified application data. If a field has
known app meaning, it MUST have a concrete schema.

### 8.3 Breaking Changes

Breaking schema, wire, or local database changes are allowed. A migration MAY require resetting or
rebuilding local database files. If a reset is required, the implementation MUST document the reset
path and keep source-of-truth repository data intact.

## 9. Boundary Validation Policy

Cycle SHOULD validate only untrusted boundaries. Internal calls between typed packages MAY rely on
Effect services and TypeScript types after data has crossed a schema decoder.

The following boundaries MUST decode external input and encode or validate successful output:

- HTTP params, query strings, request bodies, response envelopes, and error envelopes.
- MCP tool inputs and outputs.
- Desktop IPC payloads that cross the preload boundary.
- WebSocket client messages and server messages.
- SSE event envelopes.
- Persisted JSON read from SQLite, files, GitDB documents, config files, or discovery files.
- Provider responses, agent structured output, and tool-call payloads.
- Codex app-server JSON-RPC messages.
- Any public package API that accepts `unknown` from callers outside the package graph.

The implementation SHOULD avoid repeated decode/encode hops after a value has been validated and is
moving through internal typed Effect services.

## 10. Canonical Schema Shape

### 10.1 Schema Modules

`@cycle/contracts` SHOULD organize schemas by contract domain:

- `schemas/common`
- `schemas/repository`
- `schemas/issues`
- `schemas/drafts`
- `schemas/records`
- `schemas/inbox`
- `schemas/views`
- `schemas/templates`
- `schemas/users`
- `schemas/labels`
- `schemas/automation`
- `schemas/chat`
- `schemas/agents`
- `schemas/config`
- `schemas/failures`
- `schemas/envelopes`
- `usecases`
- `api`

Exact filenames are implementation-defined, but exports MUST make ownership and stability clear.

### 10.2 Derived Types

Every exported app-facing DTO type MUST be derived from the matching schema:

```ts
export const TicketDocument = Schema.Struct({ ... });
export type TicketDocument = Schema.Schema.Type<typeof TicketDocument>;
```

Type-only interfaces MAY remain for internal implementation details outside `@cycle/contracts`, but
they MUST NOT be the source of truth for public app contracts.

### 10.3 Type and Codec Direction

Schemas SHOULD distinguish decoded domain values from encoded transport values when those differ.
Examples include:

- Dates represented as ISO strings on the wire.
- Branded IDs decoded from strings.
- Cursors encoded as opaque strings but decoded to structured internal cursor values.
- `void` usecase successes encoded as `204 No Content` or a defined envelope.

The API contract MUST state which representation crosses each public boundary.

### 10.4 Identifier and Timestamp Rules

Canonical schemas MUST define reusable branded or constrained schemas for:

- `RepositoryId`
- `IssueId`
- `DraftId`
- `RecordId`
- `LabelId`
- `UserId`
- `ViewId`
- `TemplateId`
- `ThreadId`
- `TurnId`
- `RequestId`
- ISO timestamp strings
- pagination cursors

Identifiers SHOULD be strings at the transport boundary. Additional branding or refinement MAY be
used internally after decoding.

## 11. Canonical Usecase Contracts

### 11.1 Contract Definition

Each implemented usecase MUST have one contract entry in `@cycle/contracts`. The entry MUST include:

- canonical usecase name
- compatibility aliases
- category
- input schema
- success schema
- canonical failure schema
- side-effect classification
- repository scope
- idempotency posture
- version
- route metadata when the usecase is exposed through HTTP
- documentation annotations for OpenAPI and generated docs

Usecase inputs and successes MUST be typed from the schema values, not from a separate
`UseCaseDefinitions` interface.

### 11.2 Generic Contract Typing

`UseCaseContract` MUST preserve schema-specific input and success types. It MUST NOT erase schemas to
`Schema.Top` in a way that forces callers to cast after decoding.

The implementation SHOULD use a helper that preserves literal names and schema types:

```ts
const contract = <
  const Name extends string,
  Input extends Schema.Top,
  Success extends Schema.Top,
>(definition: {
  readonly name: Name;
  readonly inputSchema: Input;
  readonly successSchema: Success;
  readonly failureSchema: typeof UseCaseFailure;
  // metadata omitted
}) => definition;
```

Derived types MUST be computed from the registry:

- `UseCaseName`
- `UseCaseInput<Name>`
- `UseCaseSuccess<Name>`
- `CycleUseCase<Name>`
- `UseCaseAlias`
- `UseCaseFailure`

### 11.3 Canonical Failure

All implemented usecases MUST use one canonical `UseCaseFailure` schema. It MUST be exported from
`@cycle/contracts` and consumed by `@cycle/usecases`, `@cycle/api`, MCP, and renderer clients.

The failure schema MUST include:

- stable tag, such as `_tag: "UseCaseFailure"`
- machine-readable `code`
- human-readable `message`
- category, such as `validation`, `not-found`, `conflict`, `authorization`, `precondition`,
  `external`, `timeout`, or `internal`
- `retryable`
- `requestId`
- optional `repositoryId`
- optional `useCase`
- optional `field`
- optional `details`

`details` MUST be an explicit extension field and MUST follow the unknown data policy.

Individual usecases MAY declare allowed failure codes as metadata for docs and tests, but they SHOULD
NOT define incompatible failure object shapes.

### 11.4 Usecase Runner

`@cycle/usecases` MUST:

1. Resolve the contract by canonical name or alias.
2. Decode untrusted caller input with the contract input schema at the runner boundary.
3. Pass decoded typed input to internal handlers.
4. Map expected package failures to canonical `UseCaseFailure`.
5. Validate or encode successful results with the contract success schema before returning to an
   external adapter.

Internal handler calls MAY trust decoded inputs and SHOULD NOT repeatedly decode the same value.

## 12. HTTP API and OpenAPI Contract

### 12.1 API Definition Source

`@cycle/api` MUST build its REST API from Effect schemas. `CycleHttpApi` MUST remain the source used
to serve the API and generate the OpenAPI document.

Endpoint definitions MUST NOT use broad `AnyPayload`, broad `ResourceEnvelope`, or
`CollectionEnvelope` with unknown `data` when a concrete contract exists.

### 12.2 Route Contract Derivation

HTTP route definitions SHOULD be derived from usecase contract metadata. For each route, metadata
MUST define:

- method
- path
- route params schema
- query schema where applicable
- request payload schema where applicable
- success envelope schema
- failure envelope schema
- HTTP success status
- HTTP failure status mapping
- OpenAPI annotations

Route params and transport query values MAY be separate schemas from usecase input schemas when URL
encoding requires different shapes. The adapter MUST combine params, query, and payload into the
canonical usecase input through a schema-backed transformation.

### 12.3 Envelopes

REST envelopes MUST be generic schema constructors over concrete data schemas. A route that returns
a `TicketDocument` MUST expose a `ResourceEnvelope(TicketDocument)` or equivalent, not
`ResourceEnvelope(Unknown)`.

Collection and page envelopes MUST have concrete entry schemas and concrete page metadata schemas.

Expected failures MUST be encoded as a canonical API error envelope containing canonical
`UseCaseFailure` data or a schema-derived protocol error. Invalid request bodies, invalid query
strings, and invalid path params MUST return typed validation errors.

### 12.4 OpenAPI Generation

The OpenAPI document MUST be generated from the Effect `HttpApi` definition. The implementation MUST
NOT maintain a parallel hand-written OpenAPI document.

OpenAPI generation MUST include:

- concrete schemas for all request payloads
- concrete schemas for all response envelopes
- concrete schemas for expected error envelopes
- route descriptions and summaries
- security requirements
- status codes
- parameter descriptions for path and query params

The generated document MUST be covered by tests that assert representative routes do not contain
unknown or empty object placeholders for known DTOs.

### 12.5 API Clients

Generated or hand-written API clients MUST validate successful server responses against the route
success schema before returning data. Invalid server responses MUST become typed API protocol
failures.

The desktop renderer client SHOULD eventually be replaced by an Effect `HttpApiClient`-based client
or a thin adapter generated from the same `CycleHttpApi` definition.

## 13. Top-To-Bottom Package Migration

### 13.1 Phase 1: `@cycle/contracts`

`@cycle/contracts` MUST be migrated first.

Required changes:

1. Replace storage-derived app DTO type aliases with schema-derived DTO types.
2. Export canonical schemas and derived types for all usecase inputs and successes.
3. Replace local or unexported failure definitions with exported `UseCaseFailure`.
4. Remove `Schema.Top` erasure from `UseCaseContract`.
5. Replace `UseCaseDefinitions` as the source of truth with types derived from the contract
   registry.
6. Replace `Schema.Unknown` success or app-meaning fields with concrete schemas.
7. Keep explicit extension fields only where required by the unknown data policy.
8. Add contract registry tests that decode valid fixtures and reject invalid fixtures.

Acceptance criteria:

- No implemented usecase success schema is `Schema.Unknown`.
- `UseCaseInput<Name>` and `UseCaseSuccess<Name>` are derived from the registry schemas.
- `UseCaseFailure` is exported and used by contracts.
- App-facing DTO exports no longer require importing storage DTO types.

### 13.2 Phase 2: `@cycle/usecases`

Required changes:

1. Decode runner inputs with the typed contract input schema.
2. Pass decoded typed input into handlers without `as any`.
3. Validate or encode runner success with the typed contract success schema.
4. Convert expected database, GitDB, Git, API, policy, and validation errors to canonical
   `UseCaseFailure`.
5. Add tests that each implemented usecase contract can decode input, execute, and validate success.

Acceptance criteria:

- The usecase runner contains no contract-related `as any` casts.
- Invalid input fails before handler execution.
- Invalid handler success fails before external adapter return.
- Expected failures are canonical `UseCaseFailure` values.

### 13.3 Phase 3: `@cycle/api` HTTP

Required changes:

1. Replace `AnyPayload` endpoint definitions with concrete payload schemas.
2. Replace unknown resource and collection envelopes with generic concrete envelope schemas.
3. Move query parsing from hand-written coercion helpers to schemas or schema-backed transforms.
4. Derive route payload and success schemas from usecase contracts wherever the route maps to a
   usecase.
5. Use Effect `HttpApi` as the API definition source and `OpenApi.fromApi` as the OpenAPI source.
6. Validate response envelopes before returning successful HTTP responses.
7. Map validation, protocol, and usecase failures to typed error envelopes.

Acceptance criteria:

- Implemented v1 routes have concrete payload, query, param, success, and error schemas.
- Generated OpenAPI includes concrete request and response schemas.
- API handlers do not cast route payloads to usecase inputs.
- API conformance tests verify representative validation failures and success responses.

### 13.4 Phase 4: Desktop Renderer API Client

Required changes:

1. Replace generic `ApiEnvelope<T>` trust casts with route-specific decoders.
2. Decode successful responses with the corresponding route success schema.
3. Decode API failure envelopes with the canonical failure/error schema.
4. Remove manual payload inspection helpers where route schemas provide the shape.
5. Prefer an Effect `HttpApiClient`-derived client if it can be introduced without leaking server
   runtime code into the renderer.

Acceptance criteria:

- Renderer API calls return schema-decoded values.
- Invalid server success payloads produce typed protocol failures.
- Renderer code imports app-facing DTO types from `@cycle/contracts`, not storage packages.

### 13.5 Phase 5: MCP Tools

Required changes:

1. Compose MCP input schemas from canonical usecase input schemas plus MCP transport fields.
2. Reuse canonical output and envelope schemas.
3. Generate MCP tool JSON schemas from the same Effect Schema values.
4. Decode API responses and MCP outputs with concrete schemas.
5. Remove duplicated issue, inbox, view, automation, and record field definitions.

Acceptance criteria:

- MCP tool schemas do not duplicate nested app DTO fields.
- Tool input JSON schemas match canonical contract shapes.
- Tool outputs validate against concrete output schemas.

### 13.6 Phase 6: Database Persistence and Projection

Database persistence SHOULD move before chat and agents because bad persisted JSON can corrupt
multiple higher-level surfaces. Existing local database files MAY be reset or rebuilt.

Required changes:

1. Define package-local schemas for persisted projection rows, document snapshots, event payloads,
   cursors, and metadata.
2. Decode JSON read from SQLite, GitDB documents, config/discovery files, and cursor strings.
3. Encode JSON written to persistence through schemas where meaningful.
4. Convert invalid source documents into materialization warnings instead of trusted casts.
5. Map package-local persisted shapes to canonical app-facing DTO schemas before returning through
   usecases or API.
6. Define reset/rebuild behavior for incompatible local database schema changes.

Acceptance criteria:

- JSON parsing in projection and database services is followed by schema decoding.
- Invalid persisted app documents are observable through warnings or typed failures.
- Read-model outputs validate against canonical DTO schemas before crossing into usecases/API.
- A documented reset/rebuild path exists for local database incompatibilities.

### 13.7 Phase 7: Chat REST, WebSocket, and SSE Protocols

Required changes:

1. Move app-facing chat DTO and protocol schemas into `@cycle/contracts`.
2. Define strict tagged schemas for WebSocket client messages.
3. Define strict tagged schemas for WebSocket server messages.
4. Define strict schemas for SSE envelopes.
5. Decode raw WebSocket JSON messages once at the socket boundary.
6. Replace manual command payload inspection with decoded tagged message handlers.
7. Decode persisted chat records when reading desktop or API chat stores.

Acceptance criteria:

- Unknown WebSocket message types and invalid payloads produce typed protocol errors.
- Server messages sent to the renderer validate against contract schemas.
- Renderer chat code consumes decoded protocol messages instead of broad records.

### 13.8 Phase 8: Agent Protocol and Structured Output

Required changes:

1. Define canonical app-facing schemas for agent provider profiles, capabilities, turn requests,
   turn results, artifacts, events, usage, and errors.
2. Keep provider-private raw event schemas inside provider packages.
3. Map provider events to canonical agent event schemas at provider boundaries.
4. Replace untyped `parseStructured<T>` paths with schema-driven structured output decoding.
5. Use schemas to derive JSON schema for provider response formats where supported.

Acceptance criteria:

- Agent events crossing API, chat, renderer, or persistence boundaries are schema-decoded.
- Structured provider output requires an explicit schema or parser.
- Invalid provider responses become typed provider/protocol failures.

### 13.9 Phase 9: Codex App-Server Protocol

Required changes:

1. Replace the custom `Validator<T>` helper layer with Effect schemas for JSON-RPC params,
   responses, and notifications.
2. Preserve generated protocol type compatibility by deriving or checking TypeScript types from
   schemas.
3. Decode JSON-RPC messages at the protocol boundary.
4. Encode outgoing messages through schemas before writing to the app-server transport.
5. Keep provider-specific or generated schemas local to `@cycle/codex-app-server` unless they become
   app-facing Cycle DTOs.

Acceptance criteria:

- Client request params/responses, server request params/responses, and server notification params
  are schema-backed.
- JSON-RPC decode failures produce typed protocol errors with method and direction context.
- The custom validator maps are removed or reduced to schema lookup tables.

### 13.10 Phase 10: Desktop IPC

Required changes:

1. Replace preload-boundary type guards with Effect schemas.
2. Decode IPC inputs in central IPC handler registration.
3. Encode IPC outputs where they cross from main to renderer.
4. Reuse canonical app-facing schemas when IPC payloads represent app DTOs.
5. Keep Electron-only local config schemas in `@cycle/desktop`.

Acceptance criteria:

- IPC handlers no longer use hand-written object guards for public payloads.
- Invalid renderer IPC calls fail with typed validation errors.
- IPC schemas are either canonical contract schemas or documented desktop-local schemas.

## 14. Compatibility and Reset Policy

Because Cycle is unreleased, the implementation MAY make breaking changes to:

- REST payloads and envelopes.
- MCP tool schemas.
- WebSocket and SSE protocol messages.
- Desktop IPC payloads.
- App-facing DTO field names and nullability.
- Local database schema or persisted JSON shapes.

Breaking changes MUST be intentional and tested. When a local reset is required, the implementation
MUST provide one of:

- automatic projection rebuild from repository source data
- explicit local database deletion/rebuild documentation
- startup failure with a clear remediation message

Breaking changes MUST NOT destroy repository source data.

## 15. Failure Model

Boundary validation failures MUST be distinguishable from domain usecase failures.

Required failure classes:

- `validation`: malformed params, query, payload, persisted JSON, or provider output
- `protocol`: invalid envelope, invalid message type, invalid response shape, or incompatible API
  version
- `domain`: canonical usecase failure from expected business rules
- `external`: Git, provider, process, filesystem, or network failure
- `internal`: unexpected defect or impossible state

Expected failures MUST be represented as values and returned through the relevant Effect error
channel or response envelope. Defects MAY still fail the fiber, but adapters MUST convert them to a
redacted typed protocol or internal error at the outer boundary.

Failure logs MUST include request ID where available, boundary name, schema or route name, and
redacted validation issue details.

## 16. Observability

Each schema boundary SHOULD log or trace:

- boundary name
- route, method, tool name, IPC channel, message type, or persisted entity kind
- request ID or correlation ID when available
- schema name or contract name
- decode/encode success or failure
- redacted failure summary

Validation failures MUST be visible in tests and logs without requiring a debugger.

## 17. Reference Algorithms

### 17.1 Usecase Invocation

```text
resolve contract by name or alias
decode raw input with contract.inputSchema
if decode fails:
  return canonical validation failure
run typed handler with decoded input
if handler returns expected failure:
  map to canonical UseCaseFailure
decode or encode success with contract.successSchema
if success validation fails:
  return protocol/internal failure with contract name
return typed success
```

### 17.2 HTTP Request Handling

```text
decode path params with route.paramsSchema
decode query with route.querySchema if present
decode body with route.payloadSchema if present
combine transport values into usecase input through schema-backed transform
run usecase by contract name
wrap success in concrete route success envelope
validate or encode response envelope
return response with route success status
map failures to concrete error envelope and status
```

### 17.3 Persisted JSON Hydration

```text
parse JSON from persistence
decode with package-local persisted schema
if decode fails:
  record materialization warning or typed persistence failure
map persisted shape to canonical app-facing DTO
decode mapped DTO with canonical schema before crossing package boundary
return typed DTO
```

## 18. Test and Validation Matrix

The migration MUST add or update tests for:

| Area               | Required validation                                                                  |
| ------------------ | ------------------------------------------------------------------------------------ |
| Contracts registry | Every implemented contract has input, success, failure, metadata, and derived types. |
| Unknown fields     | Public schemas reject undeclared fields except documented extension fields.          |
| Usecase runner     | Invalid input does not reach handlers; invalid success is caught.                    |
| Canonical failure  | Expected failures from usecases, API, MCP, and renderer decode as `UseCaseFailure`.  |
| HTTP API           | Each implemented route has concrete params/query/payload/success/error schemas.      |
| OpenAPI            | Generated document contains concrete DTO schemas and representative paths/statuses.  |
| Renderer client    | Invalid server successes become typed protocol failures.                             |
| MCP                | Tool JSON schemas and outputs are derived from canonical schemas.                    |
| Database           | Invalid persisted JSON is rejected, warned, quarantined, or fails typed.             |
| Chat protocols     | Invalid WebSocket/SSE messages are rejected at boundary decode.                      |
| Agents             | Provider structured output requires schema-backed decoding.                          |
| App-server         | JSON-RPC params/responses/notifications decode through schemas.                      |
| Desktop IPC        | Invalid renderer payloads fail central IPC decode.                                   |

Conformance tests SHOULD include golden valid fixtures and invalid fixtures for each major boundary.

## 19. Implementation Checklist

The migration is complete when:

1. `@cycle/contracts` owns all app-facing DTO, usecase, failure, envelope, and API contract schemas.
2. Public app-facing types are derived from schemas.
3. Implemented usecases have no `Schema.Unknown` success schemas.
4. Known app-meaning fields no longer use `Schema.Unknown`.
5. `UseCaseContract` preserves input and success schema types.
6. The usecase runner has no contract-related `as any` casts.
7. HTTP endpoints have concrete schemas and generated OpenAPI from `CycleHttpApi`.
8. Renderer API client, MCP tools, desktop IPC, chat protocols, agent boundaries, persisted JSON,
   and app-server JSON-RPC decode untrusted data through schemas.
9. Lower packages retain only implementation-specific schemas and explicitly map to canonical
   app-facing schemas.
10. Unknown fields are rejected by default, with documented extension fields where required.
11. Breaking local database changes have a documented reset or rebuild path.
12. The validation matrix has passing tests.

## 20. Open Questions

No blocking questions remain. Implementation-specific naming, file layout, and exact migration PR
boundaries are left to implementers as long as they satisfy this specification.
