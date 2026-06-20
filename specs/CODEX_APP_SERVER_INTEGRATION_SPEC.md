# Codex App-Server Integration Specification

Status: Draft
Date: 2026-06-18
Target repository: Cycle

## 1. Purpose

This specification defines how Cycle will replace the current Codex SDK-backed provider with a
Codex `app-server` integration. The target design follows the same broad approach used by T3 Code:
a typed JSON-RPC client wraps `codex app-server`, an agent runtime owns session lifecycle and
pending interactive requests, and Cycle's existing agent/chat layers consume normalized streaming
events.

The implementation MUST create a new isolated package, `packages/codex-app-server`, so the
app-server protocol can be developed, tested, and imported without coupling it to the rest of
Cycle's agent runtime.

## 2. Normative Language

The keywords `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` are to be
interpreted as described in RFC 2119 and RFC 8174.

Implementation-defined means the implementation may choose the internal mechanism, but it MUST
document the choice and expose enough information for tests and consumers to reason about it.

## 3. Source Study

This specification is based on inspection of T3 Code's Codex app-server implementation:

- `/Users/robertpitt/Projects/t3code/packages/effect-codex-app-server/src/client.ts`
- `/Users/robertpitt/Projects/t3code/packages/effect-codex-app-server/src/protocol.ts`
- `/Users/robertpitt/Projects/t3code/packages/effect-codex-app-server/scripts/generate.ts`
- `/Users/robertpitt/Projects/t3code/packages/effect-codex-app-server/src/_generated/meta.gen.ts`
- `/Users/robertpitt/Projects/t3code/apps/server/src/provider/Layers/CodexSessionRuntime.ts`
- `/Users/robertpitt/Projects/t3code/apps/server/src/provider/Layers/CodexAdapter.ts`
- `/Users/robertpitt/Projects/t3code/apps/server/src/provider/Layers/ProviderService.ts`
- `/Users/robertpitt/Projects/t3code/apps/server/src/provider/Layers/ProviderSessionDirectory.ts`

T3 Code's useful pattern is not its exact service graph. The useful pattern is:

1. Generate and export typed app-server schemas and method metadata.
2. Speak newline-delimited JSON-RPC over a `codex app-server` child process.
3. Treat server-to-client requests as first-class pending runtime interactions.
4. Normalize app-server notifications into provider events before exposing them to the product.
5. Persist the app-server resume cursor separately from UI state.

Cycle MUST preserve those design properties while fitting the simpler Cycle package graph.

## 4. Decisions

The following decisions are settled for this specification:

1. Cycle will use the more complete Codex `app-server` interface instead of the current
   `@openai/codex-sdk` implementation for the Codex provider.
2. The protocol client will live in a new package: `packages/codex-app-server`.
3. The first app-server implementation MUST include approval and user-input roundtrips.
4. Cycle MUST support three runtime modes: read-only, workspace-write, and full-access.
5. Existing agent session storage MAY be changed in breaking ways because the app is unreleased.
6. Executable detection and app-server readiness are separate concerns. Detection checks whether
   `codex` is installed; app-server initialization happens when Cycle uses the provider.
7. Raw app-server payload retention SHOULD be minimal and limited to identifiers, concise details,
   and debugging context needed to understand failures.
8. End-to-end streaming is a key goal. The selected API SHOULD be the least complex shape that
   preserves streaming, approval requests, and user-input requests.

## 5. Problem Statement

Cycle currently has `@cycle/agents` and a Codex provider, but the Codex implementation is shaped
around `@openai/codex-sdk`. That interface is too small for a product-grade local agent workflow.
It can stream text and item-level artifacts, but it does not expose the full `app-server` protocol
surface used by Codex-based applications.

Cycle needs Codex integration that can:

- create and resume Codex-native threads;
- start, steer, and interrupt turns;
- stream assistant text, reasoning summaries, plans, diffs, command output, file-change output,
  item lifecycle, usage, warnings, and provider errors;
- receive app-server initiated approval requests;
- receive app-server initiated user-input requests;
- answer those requests through Cycle's chat/API layer;
- preserve enough session binding state to recover after API restarts where Codex can resume;
- keep executable detection independent from app-server process startup.

## 6. Goals

The implementation MUST:

1. Add `@cycle/codex-app-server` as a standalone workspace package.
2. Generate or otherwise maintain typed schemas for the Codex app-server protocol.
3. Implement a typed JSON-RPC client over `codex app-server` stdio.
4. Replace the Codex SDK runtime in `@cycle/agents` with an app-server runtime.
5. Keep the public agent integration centered on streaming normalized `AgentEvent` values.
6. Extend the agent service contract only as much as needed to resolve pending approval and
   user-input requests.
7. Store app-server native session state in the existing `AgentSessionStore` shape, updated as
   needed.
8. Support read-only, workspace-write, and full-access runtime modes.
9. Keep executable detection in `@cycle/agents/src/detection.ts` focused on install/path
   availability.
10. Provide deterministic tests for the protocol client, Codex runtime, event normalization, request
    roundtrips, and session persistence.

## 7. Non-Goals

This specification MUST NOT:

1. Implement Claude or OpenCode app-server runtimes.
2. Replace provider executable detection with app-server account/model probing.
3. Persist full raw app-server event streams by default.
4. Introduce T3 Code's full provider orchestration service graph.
5. Introduce multi-device synchronization or remote execution.
6. Require GitDB persistence for chat or runtime state.
7. Require a general Effect RPC layer for the chat WebSocket.

## 8. Package Graph

The new dependency direction MUST be:

```text
@cycle/codex-app-server
  -> effect
  -> @effect/platform-node where child-process or Node stream services are required

@cycle/agents
  -> @cycle/codex-app-server
  -> effect
  -> @effect/platform-node

@cycle/api
  -> @cycle/agents
```

`@cycle/codex-app-server` MUST NOT import any other `@cycle/*` package. It owns protocol mechanics,
not product semantics.

`@cycle/agents` owns the Codex provider runtime and maps app-server semantics into Cycle's
provider-neutral agent types.

`@cycle/api` owns chat WebSocket persistence, client subscriptions, and translating UI responses
back into agent service calls.

## 9. `@cycle/codex-app-server`

### 9.1 Package Contract

The package SHOULD be named `@cycle/codex-app-server` and expose:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./errors": "./src/errors.ts",
    "./protocol": "./src/protocol.ts",
    "./rpc": "./src/rpc.ts",
    "./schema": "./src/schema.ts"
  }
}
```

The package MUST expose only Codex app-server concepts. It MUST NOT expose Cycle agent sessions,
chat messages, API WebSocket events, or UI types.

### 9.2 Schema Generation

The package SHOULD include a generator script that fetches the upstream OpenAI Codex app-server
protocol from `openai/codex` at a pinned commit. Generated files SHOULD be committed under
`src/_generated`.

The generated surface SHOULD include:

- app-server request method names;
- app-server notification method names;
- server-to-client request method names;
- server-to-client notification method names;
- request parameter schemas;
- response schemas;
- notification payload schemas.

If the upstream protocol has missing or awkward schema definitions, the generator MAY apply
documented patches. Each patch MUST explain the upstream gap and the local compatibility behavior.

### 9.3 JSON-RPC Protocol

The protocol implementation MUST support newline-delimited JSON-RPC over stdio:

- outgoing client requests: `{ "id": number, "method": string, "params"?: unknown }`;
- outgoing client notifications: `{ "method": string, "params"?: unknown }`;
- incoming server requests;
- incoming server notifications;
- incoming responses matched to pending request ids.

The client MUST:

- maintain a pending request map;
- fail pending requests when the process exits or the stream closes;
- parse line-delimited JSON safely across chunk boundaries;
- return typed protocol errors for invalid JSON, invalid response shape, request errors, transport
  closure, and process exit;
- support registering handlers for app-server initiated requests;
- support registering handlers for app-server notifications;
- provide raw request/notify/respond helpers for protocol gaps during upstream schema churn.

### 9.4 Child Process Layer

The package SHOULD provide a child-process backed client constructor that starts:

```text
codex app-server
```

The constructor MUST accept:

- executable path;
- cwd;
- environment overrides;
- optional `CODEX_HOME`;
- optional stderr handler;
- optional process-exit handler.

The constructor MUST NOT perform Cycle provider detection. Callers pass the executable path selected
by `@cycle/agents`.

### 9.5 Error Model

The package MUST define tagged errors for:

- spawn failure;
- process exit;
- protocol parse failure;
- transport failure;
- JSON-RPC request failure;
- schema decode failure;
- schema encode failure;
- missing handler.

Errors SHOULD preserve concise details and the original cause where useful. They SHOULD NOT retain
large raw payloads by default.

### 9.6 Tests

The package MUST include:

- in-memory protocol tests;
- mock child-process peer tests;
- request/response correlation tests;
- server-request handler tests;
- notification handler tests;
- process exit cleanup tests;
- schema encode/decode tests for the methods used by Cycle.

## 10. `@cycle/agents` Codex Runtime

### 10.1 Runtime Ownership

`@cycle/agents` MUST own the product runtime around `@cycle/codex-app-server`. The Codex provider
MUST no longer rely on `@openai/codex-sdk` for primary execution.

The runtime SHOULD be implemented as an internal module, for example:

```text
packages/agents/src/providers/codex/app-server/
  runtime.ts
  events.ts
  requests.ts
  modes.ts
  session.ts
  service.ts
```

### 10.2 Runtime Modes

Cycle MUST support these runtime modes:

| Cycle mode        | Codex approval policy | Codex sandbox policy | Intended use                                 |
| ----------------- | --------------------- | -------------------- | -------------------------------------------- |
| `read-only`       | `untrusted`           | read-only            | drafting, bug discovery, investigation       |
| `workspace-write` | `on-request`          | workspace-write      | normal implementation with approval gates    |
| `full-access`     | `never`               | danger-full-access   | trusted ticket execution and local workflows |

The exact Codex protocol enum names are implementation-defined and MUST be mapped in one place.

`CreateAgentSessionInput` or `AgentTurnRequest` MUST allow selecting the runtime mode. If no mode
is selected, the default MUST be `read-only`.

### 10.3 Session Binding

`AgentSessionStore` MUST be extended to preserve Codex app-server native state. The binding SHOULD
store:

- Cycle session id;
- provider id;
- status;
- cwd;
- selected model;
- selected runtime mode;
- active turn id;
- native Codex thread id;
- app-server resume cursor;
- last error summary;
- updated timestamp.

The store SHOULD remain provider-neutral. Codex-specific values belong under a `native` or
`runtime` object rather than top-level Codex-only fields.

### 10.4 Session Lifecycle

Creating or resuming a Codex session MUST NOT eagerly probe account/model status. It MAY create an
application session binding.

Starting a turn MUST:

1. Resolve the `codex` executable path from the detector/configuration result.
2. Start or reuse a `codex app-server` process for the session.
3. Call `initialize`.
4. Send the `initialized` notification when required by the protocol.
5. Start a native Codex thread with `thread/start` or resume one with `thread/resume`.
6. Persist the native thread id/resume cursor.
7. Call `turn/start`.
8. Stream normalized events until the turn completes, fails, or is cancelled.

If `thread/resume` fails because the native thread is unavailable, the runtime MAY fall back to a
fresh `thread/start` and MUST emit a warning event.

### 10.5 Turn Input

The first implementation MUST support text input. It SHOULD preserve the existing
`AgentTurnRequest.input` shape.

Image and rich attachment support MAY be added later by extending `AgentInputPart`. The app-server
runtime SHOULD be written so that adding those parts does not require replacing the protocol layer.

### 10.6 Streaming Event Contract

Cycle SHOULD keep the least-complex streaming model: `AgentService.stream()` returns one
`AsyncIterable<AgentEvent>`.

`AgentEvent` MUST be extended to represent app-server interactions. The event union SHOULD include:

- `turn.started`;
- `turn.completed`;
- `turn.failed`;
- `turn.cancelled`;
- `content.delta`;
- `turn.plan.updated`;
- `turn.diff.updated`;
- `item.started`;
- `item.updated`;
- `item.completed`;
- `approval.requested`;
- `approval.resolved`;
- `user-input.requested`;
- `user-input.resolved`;
- `usage`;
- `runtime.warning`;
- `runtime.error`.

`content.delta` SHOULD include a `streamKind` field. Supported values SHOULD include:

- `assistant_text`;
- `reasoning_text`;
- `reasoning_summary`;
- `plan`;
- `command_output`;
- `file_change_output`;
- `tool_output`;
- `unknown`.

The existing `text.delta` event MAY be retained as a compatibility alias for assistant text, but
new consumers SHOULD use `content.delta`.

### 10.7 Approval Requests

The runtime MUST handle app-server approval requests for command execution and file changes.

When app-server sends an approval request, the runtime MUST:

1. Allocate a Cycle request id.
2. Store a pending request in memory.
3. Emit `approval.requested` on the session stream.
4. Wait for the API/chat layer to resolve the request.
5. Send the decision back to app-server.
6. Emit `approval.resolved`.

Approval request events MUST include:

- request id;
- session id;
- turn id when known;
- item id when known;
- approval kind;
- concise command/file-change detail;
- default decision if the runtime can infer one;
- created timestamp.

The API layer MUST persist pending approvals so renderer reloads do not lose the interaction.

### 10.8 User-Input Requests

The runtime MUST handle app-server user-input requests.

When app-server asks for user input, the runtime MUST:

1. Allocate a Cycle request id.
2. Convert Codex question shapes into Cycle question shapes.
3. Emit `user-input.requested`.
4. Wait for answers from the API/chat layer.
5. Convert answers back into the Codex app-server response shape.
6. Send the response to app-server.
7. Emit `user-input.resolved`.

The first implementation SHOULD support text input, single-select, multi-select, and boolean
questions when represented by the Codex protocol.

### 10.9 Agent Service Additions

`AgentService` SHOULD remain the main provider-neutral API. It MUST add methods equivalent to:

```ts
respondToApproval(
  sessionId: string,
  requestId: string,
  decision: AgentApprovalDecision,
): Promise<AgentInteractionResponseResult>;

respondToUserInput(
  sessionId: string,
  requestId: string,
  answers: readonly AgentUserInputAnswer[],
): Promise<AgentInteractionResponseResult>;
```

These methods SHOULD return whether the response was accepted, rejected, already resolved, or not
found.

This is less complex than introducing a separate provider runtime API while still allowing the chat
WebSocket to complete end-to-end interactive turns.

### 10.10 Cancellation and Close

`abortTurn(sessionId, turnId?)` MUST call app-server `turn/interrupt` when a native turn id is
known. If the app-server process is not available, it MAY fall back to local cancellation and emit a
runtime warning.

`close()` MUST:

- interrupt or fail active turns;
- settle pending approvals with cancellation;
- settle pending user-input requests with cancellation or empty answers as appropriate;
- stop child processes;
- update session bindings to `stopped` or `error`;
- release resources.

## 11. API and Chat Runtime Integration

The chat WebSocket protocol MUST continue to be the product-facing realtime boundary.

The API chat runtime MUST:

- start Codex turns through `AgentService.stream()`;
- persist normalized events needed for reconnect and UI rendering;
- persist pending approvals and user-input requests;
- expose response messages for approval and user-input resolution;
- call `respondToApproval` or `respondToUserInput` on the agent service;
- broadcast accepted/resolved/rejected state changes to subscribed clients.

The API layer SHOULD NOT expose raw app-server method names as the public WebSocket contract. It
SHOULD expose Cycle-level event names and payloads.

The prior chat refactor specification listed approval gates as a first-phase non-goal. This
specification defines the Codex app-server phase that supersedes that limitation for Codex-backed
turns.

## 12. Detection and Readiness

Executable detection MUST remain separate from app-server readiness:

- detection answers: "Is `codex` installed, and where is the executable?";
- readiness answers: "Can this selected Codex executable initialize an app-server session for this
  turn?".

`@cycle/agents/src/detection.ts` and executable resolution SHOULD continue to detect paths without
starting `codex app-server`.

App-server initialization failures MUST surface as runtime events or turn failures, not as
installation detection results.

## 13. Observability and Raw Payload Policy

The runtime MUST log enough information to diagnose failures:

- provider;
- session id;
- turn id;
- native thread id;
- request id;
- app-server method name;
- concise error message;
- process exit code or signal.

The runtime SHOULD NOT persist full raw app-server payloads by default. It MAY keep a small
debug-only raw payload field for failing events when the payload is bounded and useful.

## 14. Migration Plan

### Phase 1: Protocol Package

1. Create `packages/codex-app-server`.
2. Add package exports and TypeScript configuration.
3. Implement generated or hand-maintained schemas for the methods Cycle needs.
4. Implement protocol, typed client, child-process constructor, and errors.
5. Add protocol and mock peer tests.

### Phase 2: Codex Runtime

1. Add app-server runtime modules under `@cycle/agents`.
2. Map runtime modes to Codex approval/sandbox settings.
3. Implement initialize, thread start/resume, turn start, interruption, and close.
4. Extend `AgentSessionStore` binding shape.
5. Replace Codex SDK execution with app-server execution.

### Phase 3: Event and Interaction Model

1. Extend `AgentEvent`.
2. Implement app-server notification normalization.
3. Implement approval request handling.
4. Implement user-input request handling.
5. Add `AgentService` response methods.

### Phase 4: API/WebSocket Integration

1. Persist new event and pending interaction shapes.
2. Add WebSocket messages for approval decisions and user-input answers.
3. Connect WebSocket responses to the new `AgentService` methods.
4. Update chat timeline mapping for the new event types.

### Phase 5: Cleanup

1. Remove `@openai/codex-sdk` from the primary Codex provider path.
2. Remove obsolete SDK-specific Codex code once parity tests pass.
3. Keep executable detection tests separate from app-server runtime tests.

## 15. Test Plan

The implementation MUST add tests for:

- executable detection without app-server startup;
- protocol request/response correlation;
- protocol server-request handling;
- process exit failing pending requests;
- schema decode failures;
- session start with fresh `thread/start`;
- session resume with `thread/resume`;
- resume fallback to fresh thread after missing native thread;
- turn streaming assistant text;
- plan and diff notifications;
- command output and file-change output deltas;
- approval request emission and resolution;
- user-input request emission and resolution;
- turn interruption;
- session close settling pending interactions;
- session store persistence of native thread id and runtime mode;
- API reconnect snapshot containing pending interactions.

## 16. Acceptance Criteria

The work is complete when:

1. `@cycle/codex-app-server` can run against a mock app-server peer in tests.
2. `@cycle/agents` Codex provider starts Codex through `codex app-server`.
3. A Codex turn streams normalized events through `AgentService.stream()`.
4. Command/file approval requests can pause a turn and resume it after a UI/API decision.
5. User-input requests can pause a turn and resume it after UI/API answers.
6. Read-only, workspace-write, and full-access modes map to distinct Codex policies.
7. App-server native thread ids/resume cursors persist through `AgentSessionStore`.
8. Detection still reports installed/missing executables without starting app-server.
9. Tests cover the protocol package, Codex runtime, and API interaction roundtrip.
