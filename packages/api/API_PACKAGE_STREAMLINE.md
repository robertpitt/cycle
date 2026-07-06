# @cycle/api Package Streamline Specification

Status: Draft implementation specification

Version: 0.1.0

Date: 2026-07-06

Target package: `@cycle/api`

## 1. Purpose

`@cycle/api` is the local HTTP, WebSocket, OpenAPI, and MCP bridge package for Cycle. This
streamline refactor MUST make its public package surface explicit, keep transport contracts
schema-first, remove accidental internal coupling, and align its file layout with the recent
package refactors in `@cycle/agent-chat`, `@cycle/sqlite`, and `@cycle/git`.

The first implementation MUST be behavior-preserving. It MUST reorganize exports, package
subpaths, and internal imports without changing the REST routes, WebSocket protocol, MCP tool
names, authentication semantics, response envelopes, or server startup behavior.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

`Implementation-defined` means the implementation may choose concrete helper names or internal
module boundaries, but it MUST preserve the observable contract described here and MUST document
choices that affect package consumers, operators, or tests.

## 3. Source Context

This specification is based on inspection of:

- `packages/api/package.json`
- `packages/api/src/index.ts`
- `packages/api/src/api.ts`
- `packages/api/src/CycleApi.ts`
- `packages/api/src/CycleApiError.ts`
- `packages/api/src/server.ts`
- `packages/api/src/http/CycleHttpApi.ts`
- `packages/api/src/http/endpoints/system.ts`
- `packages/api/src/http/endpoints/v1.ts`
- `packages/api/src/http/handlers/System.ts`
- `packages/api/src/http/handlers/V1.ts`
- `packages/api/src/http/handlers/v1/*`
- `packages/api/src/http/middleware/*`
- `packages/api/src/http/runtime/CycleApiRuntime.ts`
- `packages/api/src/http/schemas/*`
- `packages/api/src/mcp/*`
- `packages/api/src/mcp/server/*`
- `packages/api/src/mcp/tools/*`
- `packages/api/src/agents/services/*`
- `packages/api/test/api.test.ts`
- `packages/api/test/agent-tasks.test.ts`
- `packages/api/test/mcp.test.ts`
- `packages/database/SPEC.md`
- `specs/AGENT_CHAT_PACKAGE_SPEC.md`
- `specs/EFFECT_SCHEMA_CONTRACTS_SPEC.md`

Assumptions:

1. The streamline is a package-boundary cleanup, not a route redesign.
2. `@cycle/api` remains the owner of REST routes, WebSocket routes, OpenAPI generation, HTTP
   middleware, server startup, and MCP-to-API transport adaptation.
3. `@cycle/agent-chat` remains the owner of chat domain records, chat persistence, chat prompt
   assembly, and chat runtime behavior.
4. `@cycle/usecases`, `@cycle/database`, `@cycle/agents`, and `@cycle/git` remain the owners of
   their respective business logic and infrastructure behavior.

## 4. Problem Statement

The API package currently has a useful internal split, but its package surface is not as explicit
as the new package standards require:

- Root exports mix construction APIs, server APIs, MCP APIs, runtime types, and compatibility
  re-exports.
- Some package internals import `@cycle/api` from inside `packages/api/src`, which makes the public
  package entrypoint part of internal wiring.
- Schema modules are available through wildcard package exports, but there is no schema barrel that
  defines the supported aggregate schema surface.
- Middleware, runtime, endpoint, and agent service files do not have explicit package subpath
  boundaries.
- Handler modules export many route functions directly even though handlers should be internal
  implementation details, not a package-level public contract.
- Tests import some deep internal files because the package lacks intentional subpaths for
  testable transport helpers.

The streamline should make the public API obvious to consumers and reviewers while keeping internal
route implementation modular and testable.

## 5. Goals

The implementation MUST:

1. Preserve all current route paths, endpoint names, request schemas, response schemas, and HTTP
   status behavior unless a separate API contract spec approves a change.
2. Preserve all current MCP tool names, MCP annotations, and MCP route mappings.
3. Preserve `makeCycleApi`, `makeCycleApiLayer`, `startCycleApiServer`, and
   `startCycleApiServerEffect` behavior.
4. Keep `CycleHttpApi` and `makeOpenApiDocument` as the canonical OpenAPI source.
5. Make `package.json` exports explicit and aligned with real files.
6. Add package-local barrel files where they clarify stable subpaths.
7. Keep handler implementation modules internal to the package.
8. Remove all production self-imports from `@cycle/api` inside `packages/api/src`.
9. Keep public-boundary contracts schema-first through Effect `Schema` and Effect `HttpApi`.
10. Keep `CycleApiError` as the package-level typed API error.
11. Keep API runtime dependencies represented through `CycleApiRuntime` and typed option shapes.
12. Keep chat domain re-exports out of the API root except for documented compatibility type exports
    that are intentionally retained for one migration window.
13. Ensure every public package export has a test or compile-time import check.

The implementation SHOULD:

1. Prefer mechanical moves, barrel additions, and import rewrites before changing implementation
   logic.
2. Keep file names aligned with exported names.
3. Keep public subpaths stable and small.
4. Add conformance tests that reject accidental root export growth and internal `@cycle/api`
   self-imports.

## 6. Non-Goals

The implementation MUST NOT:

1. Redesign HTTP route names, paths, payloads, envelopes, or status codes.
2. Move REST route definitions out of `@cycle/api`.
3. Move WebSocket protocol ownership out of `@cycle/api`.
4. Move MCP server, MCP client, or MCP tool registration out of `@cycle/api`.
5. Move agent provider execution, agent task storage, database projection, Git worktree behavior,
   or usecase business rules into `@cycle/api`.
6. Reintroduce chat records, chat store contracts, or chat persistence ownership into `@cycle/api`.
7. Add a new `@cycle/api-contracts` package.
8. Require renderer, desktop, or MCP consumers to import handler implementation files.
9. Change server binding safety; API servers MUST continue to bind only to `127.0.0.1` or
   `localhost`.

## 7. System Overview

### 7.1 Package Role

`@cycle/api` is the transport adapter package:

```text
desktop renderer / MCP clients / local tools
  |
  | HTTP, WebSocket, SSE, MCP stdio/http
  v
@cycle/api
  - owns REST, WebSocket, OpenAPI, auth middleware, request context, MCP bridge
  - maps transport payloads to usecases, database services, agent services, and agent-chat runtime
  - maps typed successes/failures to response envelopes
  |
  v
@cycle/usecases, @cycle/database, @cycle/agents, @cycle/agent-chat, @cycle/git
```

### 7.2 Main Components

The streamlined package MUST retain these responsibility boundaries:

- API construction: creates an Effect `HttpApi` layer and web handler.
- Server runtime: binds a local Node HTTP server, writes runtime discovery files, and closes
  resources.
- HTTP API definition: defines schema-first endpoint groups and OpenAPI generation.
- HTTP schemas: defines transport envelopes, route params, query schemas, and payload wrappers.
- HTTP middleware: owns authorization, tracing, request context, and framework error envelopes.
- HTTP handlers: maps typed endpoint requests to package runtime services.
- Runtime service: exposes dependency handles and host-provided callbacks through
  `CycleApiRuntime`.
- Agent helper services: API-local active-turn and provider-profile services used by transport.
- MCP bridge: discovers a local API, calls REST endpoints, registers MCP tools, and hosts MCP over
  stdio or HTTP.

## 8. Target Public Package Exports

### 8.1 `package.json` Export Map

`packages/api/package.json` MUST expose only supported package entrypoints. The target export map
MUST include these subpaths:

| Subpath | Target file | Public purpose |
| --- | --- | --- |
| `.` | `./src/index.ts` | Main package API for app composition and MCP integration. |
| `./api` | `./src/api.ts` | HTTP API definition exports. |
| `./server` | `./src/server.ts` | Node server startup exports. |
| `./http` | `./src/http/index.ts` | HTTP definition, middleware, runtime, and schema aggregate exports. |
| `./openapi` | `./src/http/CycleHttpApi.ts` | Backward-compatible OpenAPI definition subpath. |
| `./runtime` | `./src/http/runtime/index.ts` | API runtime service and option type exports. |
| `./middleware` | `./src/http/middleware/index.ts` | Middleware service exports. |
| `./schemas` | `./src/http/schemas/index.ts` | Aggregate HTTP schema exports. |
| `./schemas/*` | `./src/http/schemas/*.ts` | Existing per-schema compatibility subpaths. |
| `./mcp` | `./src/mcp/index.ts` | MCP client, discovery, server, and tool aggregate exports. |
| `./mcp/client` | `./src/mcp/client.ts` | MCP API client exports. |
| `./mcp/discovery` | `./src/mcp/discovery.ts` | MCP discovery exports. |
| `./mcp/server` | `./src/mcp/server/index.ts` | MCP server exports. |
| `./mcp/tools` | `./src/mcp/tools/index.ts` | MCP tool registry exports. |
| `./agents/services` | `./src/agents/services/index.ts` | API-local agent helper services. |

The export map MUST NOT expose handler implementation modules such as
`src/http/handlers/v1/issues.ts`. Tests MAY import relative files inside `packages/api/test`, but
external package consumers MUST use the supported subpaths above.

### 8.2 Root Export Plan

`packages/api/src/index.ts` MUST be the concise app-composition entrypoint.

It MUST export:

- `CycleApiError` from `./CycleApiError.ts`
- `makeCycleApi` and `makeCycleApiLayer` from `./CycleApi.ts`
- `startCycleApiServer` and `startCycleApiServerEffect` from `./server.ts`
- `CycleApiServerOptions` and `CycleApiServerHandle` from `./server.ts`
- MCP aggregate exports from `./mcp/index.ts`
- `CycleApiRuntime` from `./http/runtime/CycleApiRuntime.ts`
- runtime and API option types from `./http/runtime/CycleApiRuntime.ts`

It SHOULD export, for one migration window only:

- `AgentChatActivityRecord`
- `AgentChatEventRecord`
- `AgentChatMessageRecord`
- `AgentChatQuestionItemRecord`
- `AgentChatQuestionRecord`
- `AgentChatRuntimeShape`
- `AgentChatStoreShape`
- `AgentChatThreadRecord`
- `AgentChatThreadWithMessages`
- `AgentChatTurnRecord`

Those compatibility type exports MUST be sourced from `@cycle/agent-chat`, MUST be documented as
transitional, and MUST be removed once known consumers import `@cycle/agent-chat` directly.

It MUST NOT export:

- HTTP handler functions.
- Handler helper functions such as query parsing helpers.
- Internal response builders unless a separate public helper subpath is approved.
- Chat compatibility modules under `http/handlers/v1/chat/domain.ts` or
  `http/handlers/v1/chat/records.ts`.

## 9. Target File and Export Plan

### 9.1 Top-Level Files

| File | Required exports |
| --- | --- |
| `src/CycleApiError.ts` | `CycleApiError` |
| `src/CycleApi.ts` | `makeCycleApi`, `makeCycleApiLayer` |
| `src/api.ts` | `CycleHttpApi`, `makeOpenApiDocument`, `SystemApiGroup`, `V1ApiGroup`, `CycleAuthorization` |
| `src/server.ts` | `CycleApiServerOptions`, `CycleApiServerHandle`, `startCycleApiServer`, `startCycleApiServerEffect` |
| `src/index.ts` | Root exports listed in section 8.2 |

Top-level files MUST NOT import `@cycle/api`. Internal imports MUST be relative.

### 9.2 HTTP Definition Files

| File | Required exports |
| --- | --- |
| `src/http/index.ts` | `CycleHttpApi`, `makeOpenApiDocument`, `SystemApiGroup`, `V1ApiGroup`, all exports from `./middleware/index.ts`, `./runtime/index.ts`, and `./schemas/index.ts` |
| `src/http/CycleHttpApi.ts` | `CycleHttpApi`, `makeOpenApiDocument` |
| `src/http/endpoints/index.ts` | `SystemApiGroup`, `V1ApiGroup` |
| `src/http/endpoints/system.ts` | `SystemApiGroup` |
| `src/http/endpoints/v1.ts` | `V1ApiGroup` |

Endpoint files MUST remain schema-first and MUST define params, query, payload, success, and error
contracts through Effect schemas and `HttpApiEndpoint`.

### 9.3 Runtime Files

| File | Required exports |
| --- | --- |
| `src/http/runtime/index.ts` | All public exports from `./CycleApiRuntime.ts` |
| `src/http/runtime/CycleApiRuntime.ts` | `ApiConfig`, `ApiRequestContext`, `CycleApi`, `CycleApiMcpOptions`, `CycleApiOptions`, `CycleApiRuntime`, `CycleApiRuntimeShape`, `CycleApiUseCaseSuccessEvent`, `LocalSettings*` types, `RepositoryDirectoryEntry`, `RepositoryDirectoryResolver`, `RepositoryOpenInputResolver`, `RepositoryOpenRequest`, `RuntimeDiscoveryFile`, agent active-turn types |

The runtime file MUST remain type-heavy and SHOULD NOT grow route implementation logic. Runtime
shape changes MUST be covered by API construction tests.

### 9.4 Middleware Files

| File | Required exports |
| --- | --- |
| `src/http/middleware/index.ts` | `CycleApiTracing`, `CycleApiTracingLive`, `CycleAuthorization`, `CycleAuthorizationLive`, `CycleRequestContext`, `CycleRequestContextMiddleware`, `CycleRequestContextLive`, `FrameworkErrorEnvelopeLive` |
| `src/http/middleware/CycleApiTracing.ts` | `CycleApiTracing`, `CycleApiTracingLive` |
| `src/http/middleware/CycleAuthorization.ts` | `CycleAuthorization`, `CycleAuthorizationLive` |
| `src/http/middleware/CycleRequestContextMiddleware.ts` | `CycleRequestContext`, `CycleRequestContextMiddleware`, `CycleRequestContextLive` |
| `src/http/middleware/FrameworkErrorEnvelope.ts` | `FrameworkErrorEnvelopeLive` |

Authorization middleware MUST continue to compare bearer tokens in constant time where possible and
MUST return the existing unauthorized response envelope.

### 9.5 HTTP Schema Files

`src/http/schemas/index.ts` MUST be added and MUST re-export each schema module listed below.
Per-file subpaths under `@cycle/api/schemas/*` MUST continue to work.

| File | Required exports |
| --- | --- |
| `src/http/schemas/shared.ts` | `JsonObject`, `NonNegativeInteger`, `PositiveInteger`, `ApiPort`, `strictSchema`, query param helpers, `ResourceEnvelopeOf`, `CreatedResourceEnvelopeOf`, `AcceptedResourceEnvelopeOf`, `CollectionEnvelopeOf`, `CollectionEnvelopeWithMetaOf` |
| `src/http/schemas/ApiErrorEnvelope.ts` | `ApiErrorEnvelope`, `ApiBadRequestErrorEnvelope`, `ApiUnauthorizedErrorEnvelope`, `ApiForbiddenErrorEnvelope`, `ApiNotFoundErrorEnvelope`, `ApiConflictErrorEnvelope`, `ApiUnprocessableEntityErrorEnvelope`, `ApiInternalServerErrorEnvelope`, `ApiNotImplementedErrorEnvelope`, `ApiServiceUnavailableErrorEnvelope`, `ApiGatewayTimeoutErrorEnvelope`, `ApiErrorEnvelopes` |
| `src/http/schemas/HealthResourceEnvelope.ts` | `HealthOutput`, `HealthResourceEnvelope` |
| `src/http/schemas/ApiStatusResourceEnvelope.ts` | `ApiStatusOutput`, `ApiStatusResourceEnvelope` |
| `src/http/schemas/AgentProvidersResourceEnvelope.ts` | `AgentProviderId`, `AgentCapabilitiesOutput`, `AgentProviderProfileOutput`, `AgentProvidersOutput`, `AgentProvidersResourceEnvelope` |
| `src/http/schemas/AgentTaskResourceEnvelope.ts` | `AgentTaskOutput`, `AgentTaskEventOutput`, `AgentTaskCreatePayload`, `AgentTaskCancelPayload`, `AgentTaskRetryPayload`, `AgentTaskInputPayload`, `TicketAgentTaskCreatePayload`, `AgentTaskResourceEnvelope`, `AgentTaskAcceptedEnvelope`, `AgentTaskCollectionEnvelope`, `AgentTaskEventCollectionEnvelope`, `AgentTaskParams`, `AgentTaskIssueParams`, `AgentTaskListQueryParams`, `AgentTaskEventQueryParams` |
| `src/http/schemas/AppConfigResourceEnvelope.ts` | `ThemePreference`, `InterfaceDensity`, `ProfileOutput`, `ProfileUpdatePayload`, `ProfileResourceEnvelope`, `CompleteOnboardingPayload`, `ThemePreferencePayload`, `InterfaceDensityPayload`, `OnboardingConfigOutput`, `AgentProviderPreferenceOutput`, `AgentProvidersConfigOutput`, `AgentProviderPreferencePatch`, `AgentProviderPreferencePayload`, `ThemeConfigOutput`, `LocalApiConfigOutput`, `RepositoryCommitStyle`, `RepositoryPreferencesOutput`, `RepositoryPreferencesPatch`, `RepositoryPreferencesPayload`, `RepositoryRecordOutput`, `RepositoryRecordNullableOutput`, `LocalWorkspaceConfigOutput`, `AppConfigOutput`, `AppConfigResourceEnvelope`, `RepositoryRecordNullableResourceEnvelope` |
| `src/http/schemas/AutocompleteResourceEnvelope.ts` | `AutocompleteEntityType`, `AutocompleteQuery`, `AutocompleteQueryParams`, `HttpAutocompleteResultOutput`, `AutocompleteOutput`, `AutocompleteResourceEnvelope` |
| `src/http/schemas/AutomationEvaluationResourceEnvelope.ts` | `AutomationEvaluatePayload`, `AutomationEvaluationResourceEnvelope` |
| `src/http/schemas/ChatTurnPayload.ts` | `ChatMessagePayload`, `ChatRepositoryPayload`, `ChatStreamOptionsPayload`, `ChatTurnPayload`, `ChatThreadParams`, `ChatMessageParams` |
| `src/http/schemas/DraftDocumentResourceEnvelope.ts` | `TicketDocumentResourceEnvelope`, `DraftDocumentResourceEnvelope`, `DraftDocumentCreatedEnvelope`, `DraftCreatePayload`, `DraftUpdatePayload`, `DraftParams` |
| `src/http/schemas/HttpLabelResourceEnvelope.ts` | `HttpLabelCollectionEnvelope`, `HttpLabelResourceEnvelope`, `LabelPayload`, `LabelQueryParams`, `LabelParams` |
| `src/http/schemas/HttpTemplateResourceEnvelope.ts` | `HttpTemplateCollectionEnvelope`, `HttpTemplateResourceEnvelope`, `TemplateCreatedEnvelope`, `TemplateCreatePayload`, `TemplateUpdatePayload`, `TemplateQueryParams`, `TemplateParams` |
| `src/http/schemas/HttpTicketResourceEnvelope.ts` | `HttpTicketResourceEnvelope`, `HttpTicketCreatedEnvelope`, `HttpTicketCollectionEnvelope`, `HttpTicketSearchCollectionEnvelope`, `HttpTicketRevisionDiffEnvelope`, `HttpHistoryCollectionEnvelope`, `HttpRecordCollectionEnvelope`, `HttpRecordResourceEnvelope`, `HttpRecordCreatedEnvelope`, `IssueListQueryParams`, `IssueCreatePayload`, `IssueUpdatePayload`, `IssueTransitionPayload`, `IssueReasonPayload`, `IssueHistoryQueryParams`, `IssueDiffQueryParams`, `RecordListQueryParams`, `IssueCommentListQueryParams`, `IssueRelationPayload`, `IssueRecordAddPayload`, `IssueCommentAddPayload`, `IssueParams`, `IssueRevisionParams`, `IssueCommentParams` |
| `src/http/schemas/HttpUserResourceEnvelope.ts` | `HttpUserCollectionEnvelope`, `HttpUserResourceEnvelope`, `UserPayload`, `UserQueryParams`, `UserParams` |
| `src/http/schemas/HttpViewResourceEnvelope.ts` | `HttpViewCollectionEnvelope`, `HttpViewResourceEnvelope`, `ViewCreatedEnvelope`, `ViewCreatePayload`, `ViewUpdatePayload`, `ViewQueryParams`, `ViewParams` |
| `src/http/schemas/InboxPageResourceEnvelope.ts` | `InboxPageResourceEnvelope`, `InboxSummaryResourceEnvelope`, `InboxMutationResourceEnvelope`, `InboxMutationPayload`, `InboxQueryParams` |
| `src/http/schemas/InitiativeProgressResourceEnvelope.ts` | `InitiativeCreatePayload`, `InitiativeProgressResourceEnvelope`, `InitiativeCreatedEnvelope`, `InitiativeUpdatePayload`, `InitiativeUpdateCreatedEnvelope`, `InitiativeParams` |
| `src/http/schemas/RepositoryStatusResourceEnvelope.ts` | `RepositoryStatusResourceEnvelope`, `RepositoryStatusCreatedEnvelope`, `RepositoryStatusCollectionEnvelope`, `RepositoryStatusAcceptedEnvelope`, `RepositoryHistoryCollectionEnvelope`, `RepositoryWarningCollectionEnvelope`, `RepositoryPushAcceptedEnvelope`, `RepositoryOpenPayload`, `RepositoryCollectionQuery`, `RepositoryWarningQuery`, `RepositoryHistoryQuery`, `RepositoryParams` |

Schema files MUST NOT import handler modules. Endpoint files and client code MAY import schema
modules.

### 9.6 Handler Files

Handler files are internal implementation modules. They MUST NOT be exported from `package.json` or
from the root `src/index.ts`.

| File | Required internal exports |
| --- | --- |
| `src/http/handlers/System.ts` | `SystemApiHandlers` |
| `src/http/handlers/V1.ts` | `V1ApiHandlers` |
| `src/http/handlers/responses.ts` | `resourceResponse`, `collectionResponse`, `errorResponseFromUseCaseFailure`, `errorResponse`, `unauthorizedResponse` |
| `src/http/handlers/query.ts` | Query parsing helpers used by handlers |
| `src/http/handlers/usecases.ts` | Usecase invocation, decoding, paging, metadata, and scoped helpers |
| `src/http/handlers/crypto.ts` | Request ID and token comparison helpers |
| `src/http/handlers/v1/types.ts` | `V1EndpointName`, `V1Request` |
| `src/http/handlers/v1/repositories.ts` | `status`, repository list/open/get/warnings/history/sync/push handlers |
| `src/http/handlers/v1/agentTasks.ts` | Agent task create/list/get/events/input/cancel/retry handlers |
| `src/http/handlers/v1/agentTasksWs.ts` | `makeAgentTaskWebSocketLayer` |
| `src/http/handlers/v1/agents.ts` | `listAgentProviders` |
| `src/http/handlers/v1/settings.ts` | App config, profile, onboarding, theme, density, provider preference, repository preference, and repository removal handlers |
| `src/http/handlers/v1/inbox.ts` | Inbox list, summary, read, unread, and archive handlers |
| `src/http/handlers/v1/issues.ts` | Issue list/create/get/update/transition/archive/restore/history/revision/diff/relation/record handlers |
| `src/http/handlers/v1/comments.ts` | Issue comment list/add handlers |
| `src/http/handlers/v1/drafts.ts` | Draft create/update/commit handlers |
| `src/http/handlers/v1/labels.ts` | Label list/upsert/archive handlers |
| `src/http/handlers/v1/users.ts` | User list/get/upsert handlers |
| `src/http/handlers/v1/views.ts` | View list/create/get/update/archive handlers |
| `src/http/handlers/v1/templates.ts` | Template list/create/get/update/archive handlers |
| `src/http/handlers/v1/initiatives.ts` | Initiative create/progress/update handlers |
| `src/http/handlers/v1/automation.ts` | `evaluateAutomation` |
| `src/http/handlers/v1/autocomplete.ts` | `autocomplete` |
| `src/http/handlers/v1/commentMentions.ts` | Comment mention helpers and handler side-effect functions |
| `src/http/handlers/v1/chat.ts` | Chat thread, message, turn, and stream endpoint handlers |
| `src/http/handlers/v1/chat/prepare.ts` | API-specific chat turn preparation bridge; `prepareChatTurn` MAY remain testable by relative import |
| `src/http/handlers/v1/chat/store.ts` | Chat store operation wrapper |
| `src/http/handlers/v1/chat/stream.ts` | `chatTurnSseFrames` |
| `src/http/handlers/v1/chat/ws.ts` | `makeChatWebSocketLayer` |

The compatibility files `src/http/handlers/v1/chat/domain.ts` and
`src/http/handlers/v1/chat/records.ts` SHOULD be deleted if no internal imports require them. If
they remain, they MUST only re-export from `@cycle/agent-chat` and MUST NOT be package exports.

### 9.7 Agent Service Files

| File | Required exports |
| --- | --- |
| `src/agents/services/index.ts` | All exports from `AgentActiveTurnDirectory.ts` and `AgentProviderProfiles.ts` |
| `src/agents/services/AgentActiveTurnDirectory.ts` | `AgentActiveTurnBeginInput`, `AgentActiveTurnBeginResult`, `AgentActiveTurnDirectoryShape`, `AgentActiveTurnDirectory`, `makeAgentActiveTurnDirectory`, `AgentActiveTurnDirectoryLive`, `AgentActiveTurnDirectoryTest` |
| `src/agents/services/AgentProviderProfiles.ts` | `AgentProviderProfilesShape`, `AgentProviderProfiles`, `listLocalAgentProviderProfiles`, `makeAgentProviderProfiles`, `AgentProviderProfilesLive`, `AgentProviderProfilesTest` |

These services are API-local helper services. They MAY be exposed under `@cycle/api/agents/services`
for tests or composition roots, but they MUST NOT be moved into root exports unless a consumer need
is documented.

### 9.8 MCP Files

| File | Required exports |
| --- | --- |
| `src/mcp/index.ts` | All exports from `client.ts`, `discovery.ts`, `server/index.ts`, and `tools/index.ts` |
| `src/mcp/client.ts` | `CycleMcpApiClientOptions`, `CycleApiEnvelope`, `CycleApiErrorEnvelope`, `CycleMcpApiClientShape`, `CycleMcpApiClient`, `makeCycleMcpApiClient`, `makeCycleMcpApiClientEffect`, `CycleMcpApiClientLive`, `CycleMcpApiError`, `isCycleMcpApiError`, `cycleMcpApiError` |
| `src/mcp/discovery.ts` | `CycleMcpApiDiscoveryInput`, `CycleMcpApiDiscoveryResult`, `discoverCycleApi`, `discoverCycleApiEffect`, `defaultRuntimeDiscoveryPath`, `defaultConfigPath`, `CycleMcpDiscoveryError`, `cycleMcpDiscoveryError` |
| `src/mcp/server/index.ts` | All exports from `runtime.ts` |
| `src/mcp/server/runtime.ts` | `CycleMcpServerInfo`, `CycleMcpOptions`, `CycleMcpHttpOptions`, `CycleMcpHttpServerHandle`, `makeCycleMcpStdioLayer`, `runCycleMcpStdio`, `runCycleMcpStdioMain`, `makeCycleMcpHttpLayer`, `startCycleMcpHttpServer`, `startCycleMcpHttpServerEffect` |
| `src/mcp/tools/index.ts` | All exports from `layer.ts`, `registry.ts`, and `schemas.ts` |
| `src/mcp/tools/layer.ts` | `registerCycleMcpTools`, `CycleMcpToolsLive` |
| `src/mcp/tools/registry.ts` | `CycleMcpToolName`, `CycleMcpToolResult`, `CycleMcpToolDefinition`, `CycleMcpToolContext`, `cycleMcpToolNames`, `cycleMcpTools`, `cycleMcpToolByName`, `mcpToolFromDefinition`, `callCycleMcpTool`, `callToolResultFrom`, `issueListSearchParams` |
| `src/mcp/tools/schemas.ts` | MCP tool input schemas, output envelopes, `PlanApplyOutput`, `PlanApplyEnvelope`, `ToolErrorOutput` |

`src/mcp/bin.ts` MUST remain the CLI binary entrypoint and SHOULD NOT be exported as a package
subpath.

## 10. Refactor Workflow

The implementation SHOULD proceed in this order:

1. Add missing barrel files:
   - `src/http/index.ts`
   - `src/http/endpoints/index.ts`
   - `src/http/middleware/index.ts`
   - `src/http/runtime/index.ts`
   - `src/http/schemas/index.ts`
2. Update `package.json` exports to match section 8.1.
3. Rewrite internal production imports from `@cycle/api` to relative imports.
4. Update `src/index.ts` to match section 8.2.
5. Update tests and external package imports to use supported package subpaths where they are not
   intentionally testing internals.
6. Delete or mark compatibility-only chat re-export files if they are no longer required.
7. Add export-surface tests.
8. Run package and affected consumer validation.

## 11. Runtime Behavior Requirements

### 11.1 API Construction

`makeCycleApi` MUST continue to return:

- `fetch(request): Promise<Response>`
- `dispose(): Promise<void>`
- `spec(): Readonly<Record<string, unknown>>`

`makeCycleApiLayer` MUST continue to compose:

- `CycleHttpApi`
- system handlers
- v1 handlers
- authorization middleware
- tracing middleware
- request context middleware
- framework error envelope handling
- hosted MCP routes when enabled
- agent task WebSocket routes
- chat WebSocket routes
- CORS handling

### 11.2 Server Startup

`startCycleApiServer` and `startCycleApiServerEffect` MUST continue to:

- Bind only to `127.0.0.1` or `localhost`.
- Use port `0` when no port is specified.
- Write runtime discovery files with mode `0600` under parent directories created with mode `0700`.
- Remove the runtime discovery file on close when one was created.
- Close the API web handler and server scope when `close()` is called.
- Log start and stop events through `@cycle/logging`.

### 11.3 HTTP Contracts

Endpoint definitions MUST remain under `src/http/endpoints`. Route handlers MUST remain under
`src/http/handlers`. The implementation MUST NOT move route payload validation into handler-only
code. Request and response schemas MUST remain importable by API clients.

### 11.4 MCP Contracts

MCP tool definitions MUST continue to be built from `cycleMcpTools`. Tool inputs MUST continue to be
schema-backed, and generated MCP JSON schemas MUST reject invalid numeric paging values such as
`NaN` and `Infinity`.

## 12. Failure Model

The streamline MUST preserve existing typed error behavior:

- API construction and server lifecycle failures SHOULD map to `CycleApiError` where currently
  mapped.
- HTTP route failures MUST continue to use API error envelopes.
- Authentication failures MUST continue to use unauthorized envelopes.
- Usecase failures MUST continue to map through existing response helpers.
- MCP API client failures MUST continue to map to `CycleMcpApiError`.

Refactor failures such as missing exports, stale package subpaths, or broken schema barrels MUST be
caught by typecheck or tests before merge.

## 13. Security and Safety

The implementation MUST preserve:

- Static bearer token authorization behavior.
- Constant-time token comparison where supported by the runtime.
- Request ID propagation through `CycleRequestContext`.
- Loopback-only server binding.
- Runtime discovery file permissions.
- Redaction expectations in `@cycle/logging` and downstream services.

The implementation MUST NOT expose secret-bearing runtime options through OpenAPI, MCP tool output,
logs, or public schema exports.

## 14. Observability

The refactor MUST preserve spans and log attributes currently emitted by:

- `CycleApiTracingLive`
- server start and stop logging
- MCP tool registry logging
- downstream usecase and agent services

New barrel files and import rewrites do not need additional logging.

## 15. Validation Matrix

The implementation MUST pass:

| Validation | Purpose |
| --- | --- |
| `pnpm --filter @cycle/api typecheck` | Verifies package exports, barrel files, runtime types, and internal imports. |
| `pnpm --filter @cycle/api test` | Verifies API, MCP, agent task, server, and transport behavior. |
| `pnpm --filter @cycle/desktop typecheck` | Verifies renderer imports of `@cycle/api/schemas/*` and API client compatibility. |
| `pnpm --filter @cycle/usecases typecheck` | Verifies usecase-facing API imports remain valid. |
| `pnpm --filter @cycle/api test -- --runInBand` or equivalent if needed | Allows debugging order-sensitive server tests if parallel runs fail. |

The implementation SHOULD add tests or checks for:

1. No production file under `packages/api/src` imports from `@cycle/api`.
2. `package.json` export subpaths resolve to existing files.
3. `@cycle/api`, `@cycle/api/api`, `@cycle/api/server`, `@cycle/api/http`,
   `@cycle/api/runtime`, `@cycle/api/middleware`, `@cycle/api/schemas`, `@cycle/api/mcp`,
   `@cycle/api/mcp/client`, `@cycle/api/mcp/server`, `@cycle/api/mcp/tools`, and
   `@cycle/api/agents/services` can be type-imported.
4. Handler modules are not reachable through package exports.
5. OpenAPI output before and after the streamline is structurally equivalent for paths, methods,
   operation IDs, status codes, and schema component names.
6. MCP `cycleMcpToolNames` remains unchanged.
7. Desktop renderer imports from `@cycle/api/schemas/*` continue to decode existing responses.

## 16. Definition of Done

The streamline is complete when:

1. The export map exactly matches real supported files.
2. Every public subpath listed in this specification resolves.
3. `src/index.ts` is a small composition entrypoint, not a catch-all internal barrel.
4. Schema, middleware, runtime, endpoints, MCP, and agent service barrels exist where specified.
5. No production source file inside `packages/api/src` imports `@cycle/api`.
6. Handler implementation files remain internal.
7. Transitional chat type re-exports are either documented in `src/index.ts` or removed.
8. Existing API, MCP, server, and agent task tests pass.
9. A reviewer can compare this specification to the package and see which file owns each export.

## 17. Open Questions

1. Should the transitional chat type re-exports from `@cycle/api` be removed immediately, or kept
   for one migration window?
2. Should `@cycle/api/http` become a documented public subpath for clients, or should consumers use
   only `@cycle/api/api`, `@cycle/api/openapi`, and `@cycle/api/schemas`?
3. Should tests continue to import `prepareChatTurn` by relative path, or should a dedicated
   testable transport-helper subpath be introduced later?
