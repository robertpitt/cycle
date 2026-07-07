# @cycle/agent-chat Package Streamline Specification

Status: Draft implementation specification

Version: 0.1.0

Date: 2026-07-06

Target package: `@cycle/agent-chat`

## 1. Purpose

`@cycle/agent-chat` is the package owner for local agent-chat domain records, chat persistence,
prompt assembly, provider-event projection, turn runtime behavior, and chat store implementations.
This streamline refactor MUST make its public package surface explicit, align filenames with the
exports they define, remove accidental root-export growth, and preserve the package boundary created
by the first agent-chat extraction.

The first implementation MUST be behavior-preserving. It MUST reorganize files, package subpaths,
typed errors, and tests without changing persisted SQLite data, public API WebSocket behavior,
provider execution behavior, chat prompt semantics, or desktop startup behavior.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

`Implementation-defined` means the implementation may choose concrete helper names or internal
module boundaries, but it MUST preserve the observable contract described here and MUST document
choices that affect package consumers, persisted data, operators, or tests.

## 3. Source Context

This specification is based on inspection of:

- `packages/agent-chat/package.json`
- `packages/agent-chat/src/index.ts`
- `packages/agent-chat/src/domain.ts`
- `packages/agent-chat/src/errors.ts`
- `packages/agent-chat/src/payloadRecords.ts`
- `packages/agent-chat/src/prompt.ts`
- `packages/agent-chat/src/records.ts`
- `packages/agent-chat/src/runtime/ActiveTurnDirectory.ts`
- `packages/agent-chat/src/runtime/AgentChatRuntime.ts`
- `packages/agent-chat/src/store/SqliteAgentChatStore.ts`
- `packages/agent-chat/src/store/schema.ts`
- `packages/agent-chat/src/stream.ts`
- `packages/agent-chat/test/sqlite-agent-chat-store.test.ts`
- `specs/AGENT_CHAT_PACKAGE_SPEC.md`
- `packages/api/API_PACKAGE_STREAMLINE.md`
- `packages/sqlite/SPEC.md`

Assumptions:

1. This streamline is a package-boundary cleanup, not a chat feature redesign.
2. `@cycle/api` remains the owner of HTTP routes, WebSocket protocol validation, and transport
   response mapping.
3. `@cycle/agent-chat` remains allowed to depend on `@cycle/agents`, `@cycle/sqlite`, and `effect`.
4. Existing `@cycle/api` and `@cycle/desktop` consumers can be updated in the same implementation
   to use the new explicit subpaths.
5. Current SQLite tables and columns remain valid and MUST NOT require a destructive migration.

## 4. Problem Statement

The package now exists, but its current source surface is still too broad and uneven:

- `src/index.ts` exports every package module, including helpers that should be subpath-only or
  internal.
- `src/runtime/AgentChatRuntime.ts` mixes runtime construction, protocol serializers, provider
  profile mapping, comment-mention helpers, origin instructions, store lookup helpers, provider
  event projection, and runtime operations.
- `src/errors.ts` exposes string result helpers but no package-local typed Effect/Schema errors.
- `package.json` exposes `./domain`, `./prompt`, `./records`, `./runtime`, and `./store`, but it
  does not expose `./errors`, `./stream`, or store schema intentionally.
- Some current filenames do not match the primary export names, which makes ownership less obvious
  than recent `@cycle/sqlite`, `@cycle/git`, and `@cycle/api` refactors.
- Tests cover the SQLite store, but there is no conformance check for supported package subpaths,
  root exports, or forbidden package dependencies.

The streamline should make the package easy for another developer to consume and maintain without
changing chat behavior.

## 5. Goals

The implementation MUST:

1. Preserve current agent-chat runtime behavior, persisted store behavior, prompt behavior, and
   provider event projection behavior.
2. Make `package.json` exports explicit and aligned with real files.
3. Keep `src/index.ts` as a small public package barrel, not a wildcard export of all internals.
4. Move public exports into files whose names match the exported concept.
5. Split API-facing protocol serializers and comment-mention helpers out of `AgentChatRuntime`.
6. Keep runtime construction and runtime shape exports under the `./runtime` subpath.
7. Keep SQLite store construction and schema ownership under the `./store` subpath.
8. Introduce package-local typed recoverable errors using `Schema.TaggedErrorClass`.
9. Preserve the `AgentChatResult` success/error result contract for API runtime operations unless a
   separate API contract migration replaces it.
10. Normalize result error codes so exported code names and runtime-produced code values agree.
11. Keep downstream imports from `@cycle/api` and `@cycle/desktop` pointed at supported
    `@cycle/agent-chat` package subpaths, not deep source files.
12. Add package-level tests or compile-time checks that cover public subpaths and dependency rules.

The implementation SHOULD:

1. Prefer mechanical moves and import rewrites before changing implementation logic.
2. Keep transitional aliases only where they prevent immediate consumer churn.
3. Keep root exports stable for durable domain, store, and runtime consumers.
4. Avoid exporting generic helpers such as `isRecord` and `stringValue` from the root package.

## 6. Non-Goals

The implementation MUST NOT:

1. Change WebSocket command names, event names, payload semantics, or API route behavior.
2. Move WebSocket protocol validation from `@cycle/api` into `@cycle/agent-chat`.
3. Redesign background turn lifecycle, restart reconciliation, cancellation semantics, or scoped
   fiber behavior.
4. Change SQLite table names, column names, indexes, foreign-key behavior, or compatibility
   migration behavior.
5. Move chat UI components from `@cycle/ui` into `@cycle/agent-chat`.
6. Move provider execution behavior from `@cycle/agents` into `@cycle/agent-chat`.
7. Add GitDB persistence for chat state.
8. Add new remote, multi-device, or multi-tenant chat behavior.

## 7. Package Role

`@cycle/agent-chat` is an application-service package:

```text
@cycle/api
  - owns HTTP and WebSocket transport
  - validates protocol payloads
  - maps protocol messages to agent-chat runtime calls
  |
  v
@cycle/agent-chat
  - owns chat records, store contract, SQLite store, prompt assembly
  - owns runtime operations and provider-event projection
  - exposes protocol serializers as API-facing helpers
  |
  v
@cycle/agents
  - owns provider registry, provider capabilities, and provider turn execution
```

`@cycle/agent-chat` MUST NOT import `@cycle/api`, `@cycle/desktop`, renderer code, Electron bridge
modules, API middleware, or API handler modules.

## 8. Target Public Package Exports

### 8.1 `package.json` Export Map

`packages/agent-chat/package.json` MUST expose only supported package entrypoints. The target export
map MUST include these subpaths:

| Subpath | Target file | Public purpose |
| --- | --- | --- |
| `.` | `./src/index.ts` | Main package API for app composition. |
| `./domain` | `./src/AgentChatDomain.ts` | Chat request, prompt, and stream payload types. |
| `./records` | `./src/AgentChatRecords.ts` | Persisted chat record types. |
| `./store` | `./src/AgentChatStore.ts` | Store contract, store helpers, and SQLite store constructor exports. |
| `./store/schema` | `./src/AgentChatSchema.ts` | SQLite chat schema SQL for package-owned migrations and tests. |
| `./runtime` | `./src/AgentChatRuntime.ts` | Runtime shape, dependencies, event bus, and runtime factory. |
| `./runtime/active-turn-directory` | `./src/AgentActiveTurnDirectory.ts` | Active-turn directory interface types. |
| `./prompt` | `./src/AgentChatPrompt.ts` | Prompt and request assembly helpers. |
| `./protocol` | `./src/AgentChatProtocol.ts` | API-facing record/profile serializer helpers. |
| `./comments` | `./src/AgentChatCommentMentions.ts` | Comment mention parsing and result-id helpers. |
| `./stream` | `./src/AgentChatStream.ts` | SSE frame generator for legacy streaming routes. |
| `./errors` | `./src/AgentChatErrors.ts` | Typed package errors and error-code exports. |
| `./result` | `./src/AgentChatResult.ts` | `AgentChatResult` helpers retained for runtime/API interop. |

The export map MUST NOT expose `src/internals/*`, row-mapping helpers, provider projection helper
files, or old source filenames such as `./src/runtime/AgentChatRuntime.ts`.

### 8.2 Root Export Plan

`packages/agent-chat/src/index.ts` MUST be the concise app-composition entrypoint.

It MUST export:

- all public types from `./AgentChatDomain.ts`;
- all public record types from `./AgentChatRecords.ts`;
- all store contract and store constructor exports from `./AgentChatStore.ts`;
- `AgentChatRuntimeShape`, `AgentChatRuntimeDependencies`, `AgentChatSnapshot`,
  `AgentChatEventBusShape`, `AgentChatPublishedEvent`, `AgentChatPublisher`,
  `AgentChatMcpResolver`, `AgentChatMcpResolverInput`, `AgentChatRepositoryDirectoryEntry`,
  `makeAgentChatRuntime`, and `makeAgentChatEventBus` from `./AgentChatRuntime.ts`;
- all result helpers from `./AgentChatResult.ts`;
- all typed package errors from `./AgentChatErrors.ts`.

It SHOULD NOT export:

- protocol serializer helpers such as `threadForProtocol`;
- SSE helpers such as `chatTurnSseFrames`;
- comment mention helpers such as `parseAgentMentions`;
- generic internals such as `isRecord` or `stringValue`;
- SQL schema text;
- runtime implementation helpers.

For one migration window, the root MAY re-export `parseAgentMentions`, `idFromResult`, and
`requestOrigin` if downstream imports cannot be moved in the same change. If retained, those root
exports MUST be documented as transitional and covered by a removal follow-up.

## 9. Target File and Export Plan

### 9.1 Top-Level Public Files

| File | Required exports |
| --- | --- |
| `src/index.ts` | Root exports listed in section 8.2. |
| `src/AgentChatDomain.ts` | `ChatMessagePayload`, `ChatRepositoryPayload`, `ChatTurnPayload`, `PreparedChatTurn`, `ChatStreamOptions`, `ChatStreamEnvelope`. |
| `src/AgentChatRecords.ts` | `AgentChatMessageRecord`, `AgentChatThreadRecord`, `AgentChatThreadWithMessages`, `AgentChatTurnRecord`, `AgentChatActivityRecord`, `AgentChatQuestionItemRecord`, `AgentChatQuestionRecord`, `AgentChatEventRecord`. |
| `src/AgentChatStore.ts` | `AgentChatStoreShape`, `getAgentChatThread`, `makeSqliteAgentChatStore`, `makeDesktopAgentChatStore`. |
| `src/AgentChatSchema.ts` | `agentChatSchemaSql`. |
| `src/AgentChatRuntime.ts` | `AgentChatRepositoryDirectoryEntry`, `AgentChatPublishedEvent`, `AgentChatPublisher`, `AgentChatEventBusShape`, `AgentChatMcpResolverInput`, `AgentChatMcpResolver`, `AgentChatRuntimeDependencies`, `AgentChatSnapshot`, `AgentChatRuntimeShape`, `makeAgentChatRuntime`, `makeAgentChatEventBus`. |
| `src/AgentActiveTurnDirectory.ts` | `AgentActiveTurnBeginInput`, `AgentActiveTurnBeginResult`, `AgentActiveTurnDirectoryShape`. |
| `src/AgentChatPrompt.ts` | `assignedTicketImplementationWorkflowInstructions`, `requestOrigin`, `bodyFromResult`, `messageFromTurnResult`, `prepareChatTurn`, `streamOptionsFromPayload`, `chatOriginInstructions`. |
| `src/AgentChatProtocol.ts` | `threadForProtocol`, `messageForProtocol`, `turnForProtocol`, `activityForProtocol`, `questionForProtocol`, `providerProfileForChat`. |
| `src/AgentChatCommentMentions.ts` | `parseAgentMentions`, `idFromResult`. |
| `src/AgentChatStream.ts` | `chatTurnSseFrames`. |
| `src/AgentChatPayloadRecords.ts` | `chatThreadFromPayload`, `chatMessageFromPayload`. |
| `src/AgentChatResult.ts` | `AgentChatErrorResult`, `AgentChatOkResult`, `AgentChatResult`, `agentChatError`, `agentChatOk`, `agentChatResultFromError`. |
| `src/AgentChatErrors.ts` | `AgentChatErrorCode`, `AgentChatError`, `AgentChatInvalidPayloadError`, `AgentChatThreadNotFoundError`, `AgentChatThreadTurnActiveError`, `AgentChatStoreUnavailableError`, `AgentChatStoreFailedError`, `AgentChatProviderUnavailableError`, `AgentChatProviderExecutionError`, `AgentChatUnsupportedOperationError`. |

### 9.2 Internal Files

The implementation MAY introduce internal files to keep `AgentChatRuntime.ts` small. Internal files
MUST use relative imports and MUST NOT be package subpaths.

| File | Expected responsibility | Public exports |
| --- | --- | --- |
| `src/internals/AgentChatRuntimeOperations.ts` | `createThread`, `sendTurn`, `cancelTurn`, `respondToQuestion`, `respondToApproval`, `deleteThread`, and snapshot operation implementations. | None. |
| `src/internals/AgentChatProjection.ts` | Provider event to message/activity/question/turn projection helpers. | None. |
| `src/internals/AgentChatJson.ts` | `isRecord`, string coercion, JSON record guards, and strict decode helpers. | None. |
| `src/internals/SqliteAgentChatRows.ts` | SQLite row types and row-to-record mappers if split from the store file. | None. |

No internal file MAY import from `@cycle/agent-chat`; internal package imports MUST be relative.

### 9.3 Compatibility File Handling

The implementation SHOULD remove the old files after imports are migrated:

- `src/domain.ts`
- `src/errors.ts`
- `src/payloadRecords.ts`
- `src/prompt.ts`
- `src/records.ts`
- `src/runtime/ActiveTurnDirectory.ts`
- `src/runtime/AgentChatRuntime.ts`
- `src/store/SqliteAgentChatStore.ts`
- `src/store/schema.ts`
- `src/stream.ts`

If the implementation keeps compatibility wrapper files temporarily, each wrapper MUST only
re-export from the new canonical file and MUST NOT be listed in `package.json` exports.

## 10. Error and Result Contract

`AgentChatErrors.ts` MUST define recoverable package errors with `Schema.TaggedErrorClass`. Error
tags MUST use the `@cycle/agent-chat/<ErrorName>` namespace.

`AgentChatResult` MAY remain the runtime/API interop shape:

```ts
type AgentChatResult<T> =
  | { readonly _tag: "ok"; readonly result: T }
  | {
      readonly _tag: "error";
      readonly code: AgentChatErrorCode;
      readonly message: string;
      readonly retryable?: boolean;
    };
```

The implementation MUST normalize error codes. `AgentChatErrorCode` values and runtime-created
codes MUST use the same canonical string values. The preferred values are lowercase snake case:

- `invalid_payload`
- `thread_not_found`
- `thread_turn_active`
- `chat_store_unavailable`
- `chat_store_failed`
- `chat_delete_unavailable`
- `provider_unavailable`
- `provider_disabled`
- `provider_concurrency_limit`
- `provider_execution_failed`
- `question_not_found`
- `question_not_open`
- `approval_not_found`
- `unsupported_operation`
- `unknown`

Runtime internals MAY create typed errors and convert them to `AgentChatResult` at the public
runtime method boundary. Public runtime methods MUST NOT leak raw provider errors, raw SQLite
errors, or unredacted provider `raw` payloads.

## 11. Runtime Contract

`makeAgentChatRuntime` MUST preserve the current `AgentChatRuntimeShape` operations:

- `cancelTurn`
- `createThread`
- `deleteThread`
- `getThreadSnapshot`
- `handleSuccessfulCommentMentions`
- `listThreads`
- `respondToApproval`
- `respondToQuestion`
- `sendTurn`
- `updateThreadSettings`

The runtime MUST continue to:

- reject sending a new turn when `activeTurnId` is already set;
- persist user messages before starting provider execution;
- update turns from `queued` to `running` to terminal states;
- project provider text, content, plan, diff, tool, approval, question, warning, error, artifact,
  usage, completed, failed, and cancelled events into chat records;
- clear `activeTurnId` on terminal states;
- publish timeline events through the configured publisher;
- keep provider `raw` error payloads out of published protocol objects;
- use host-provided MCP attachments or resolvers instead of constructing API authorization state.

`AgentChatRuntime.ts` MUST only export the runtime contract and runtime factories listed in section
9.1. Protocol serializers, comment helpers, and stream helpers MUST live in their own files.

## 12. Store Contract

`AgentChatStoreShape` MUST remain Promise-based for this streamline so current desktop and API code
does not need a runtime contract migration.

The SQLite store MUST continue to:

- open through `@cycle/sqlite/sync`;
- enable `PRAGMA foreign_keys = ON`;
- execute `agentChatSchemaSql`;
- run compatibility `ALTER TABLE` additions for existing databases;
- preserve cascade delete behavior for threads;
- preserve message sequence assignment;
- preserve event sequence assignment;
- strictly decode persisted JSON records and drop invalid optional JSON to safe defaults;
- expose `makeDesktopAgentChatStore` as an alias for `makeSqliteAgentChatStore` for one migration
  window.

The store subpath MUST be the only public path for SQLite construction:

```ts
import { makeSqliteAgentChatStore } from "@cycle/agent-chat/store";
```

## 13. Dependency Rules

Production code in `packages/agent-chat/src` MAY import:

- `@cycle/agents`
- `@cycle/sqlite/sync`
- `effect`

Production code in `packages/agent-chat/src` MUST NOT import:

- `@cycle/api`
- `@cycle/desktop`
- `@cycle/database`
- `@cycle/ui`
- package self-imports from `@cycle/agent-chat`
- files under another package's `src` directory

The implementation MUST add or update a test that fails when production source imports forbidden
packages.

## 14. Downstream Import Migration

The implementation MUST update known consumers:

| Consumer | Required import behavior |
| --- | --- |
| `packages/api/src/CycleApi.ts` | Import runtime factories from `@cycle/agent-chat/runtime` or root only if root remains intentional. |
| `packages/api/src/http/runtime/CycleApiRuntime.ts` | Import `AgentChatStoreShape` and runtime types from `@cycle/agent-chat/store` and `@cycle/agent-chat/runtime`. |
| `packages/api/src/http/handlers/v1/chat/prepare.ts` | Re-export or import prompt helpers from `@cycle/agent-chat/prompt`. |
| `packages/api/src/http/handlers/v1/chat/stream.ts` | Re-export or import `chatTurnSseFrames` from `@cycle/agent-chat/stream`. |
| `packages/api/src/http/handlers/v1/chat/ws.ts` | Import protocol serializers from `@cycle/agent-chat/protocol`; import `requestOrigin` from `@cycle/agent-chat/prompt`. |
| `packages/api/src/http/handlers/v1/commentMentions.ts` | Import `parseAgentMentions` and `idFromResult` from `@cycle/agent-chat/comments`; import `requestOrigin` from `@cycle/agent-chat/prompt`. |
| `packages/desktop/src/main/DesktopAgentChatStore.ts` | Re-export store constructor and record types from `@cycle/agent-chat/store` and `@cycle/agent-chat/records`. |
| `packages/desktop/src/main/DesktopApi.ts` | Import `makeSqliteAgentChatStore` from `@cycle/agent-chat/store`. |

Downstream consumers MUST NOT import files under `packages/agent-chat/src`.

## 15. Implementation Plan

1. Add the new canonical files listed in section 9.1.
2. Move exports mechanically from current files into canonical files.
3. Split `AgentChatRuntime.ts` so runtime exports remain public and helper exports move to
   `AgentChatProtocol.ts`, `AgentChatCommentMentions.ts`, `AgentChatPrompt.ts`,
   `AgentChatStore.ts`, and internal files.
4. Add `AgentChatErrors.ts` with typed `Schema.TaggedErrorClass` errors.
5. Update `AgentChatResult.ts` and runtime call sites so error codes use the canonical lowercase
   values.
6. Update `package.json` exports to match section 8.1.
7. Rewrite internal imports to use relative canonical files.
8. Rewrite API and desktop imports to use supported package subpaths.
9. Remove old files or replace them with temporary re-export wrappers.
10. Add conformance tests for package exports and dependency boundaries.
11. Run package and affected consumer validation.

## 16. Validation Matrix

The implementation MUST pass:

| Check | Command or method | Required signal |
| --- | --- | --- |
| Agent-chat typecheck | `pnpm --filter @cycle/agent-chat typecheck` | No TypeScript errors. |
| Agent-chat tests | `pnpm --filter @cycle/agent-chat test` | Existing SQLite test and new conformance tests pass. |
| API typecheck | `pnpm --filter @cycle/api typecheck` | API imports compile against supported subpaths. |
| API tests | `pnpm --filter @cycle/api test` | Chat runtime and protocol behavior remain compatible. |
| Desktop typecheck | `pnpm --filter @cycle/desktop typecheck` | Desktop store construction compiles. |
| Export map test | Implementation-defined test | Every `package.json` subpath imports successfully. |
| Root export test | Implementation-defined test | Root exports only approved durable exports plus documented transitionals. |
| Dependency boundary test | Implementation-defined test using `rg` or TypeScript import inspection | `packages/agent-chat/src` has no forbidden imports or package self-imports. |
| SQLite compatibility test | Existing or expanded store test | Existing databases with old nullable JSON columns still rehydrate safely. |

## 17. Definition of Done

The streamline is complete when:

1. `packages/agent-chat/package.json` exports match real files and include no stale paths.
2. `src/index.ts` is concise and does not wildcard-export implementation helpers.
3. Every public subpath in section 8.1 has a canonical file and documented exports.
4. Runtime, protocol, prompt, comments, store, records, result, and errors are separated by file.
5. Typed package errors exist and runtime result codes are normalized.
6. Known API and desktop consumers import from supported `@cycle/agent-chat` subpaths.
7. No production source in `@cycle/agent-chat` imports `@cycle/api`, `@cycle/desktop`, or
   `@cycle/agent-chat`.
8. Store behavior and current persisted SQLite schema remain compatible.
9. Validation commands in section 16 pass or any failure is documented with a blocking reason.
