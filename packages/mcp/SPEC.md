# @cycle/mcp Specification

Status: Draft implementation specification

Version: 0.2.0

Package: `@cycle/mcp`

Primary implementation reference: `vendor/effect-v4/packages/effect/src/unstable/ai/McpServer.ts`

## 1. Purpose

`@cycle/mcp` provides a Model Context Protocol server for agents working inside Cycle. It exposes
a curated set of workspace, inbox, issue-management, planning, and project-setup tools so an agent
can discover repository context, inspect existing work, reply to mentions, create planned tickets,
connect tickets with relations, and update Cycle state while it is planning or implementing work.

The package is an adapter. It MUST communicate with the already-running local Cycle REST API in the
same operational style as `@cycle/cli`. It MUST NOT mount GitDB, open repositories, run usecases
in-process, or duplicate ticket workflow policy.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means an implementation may choose the behavior, but it MUST document that
choice and expose enough information for tests, package consumers, and future maintainers to reason
about it.

## 3. Problem Statement

Cycle currently has REST API and CLI adapter surfaces over the central usecase layer. Agents
that work in editors or coding environments need a protocol-native tool surface rather than shelling
out to the CLI or hand-coding REST calls. MCP is the right integration point for those clients, but
an MCP server can easily become a second backend if it directly imports storage or workflow services.

Cycle needs an MCP package that is intentionally thin: it should translate MCP tool calls into local
REST API requests, use the same discovery and token model as the CLI, preserve local-first security,
and provide tool schemas and annotations that are precise enough for agent clients to call safely.

## 4. Goals

`@cycle/mcp` MUST:

1. Provide a first-class MCP server package under `packages/mcp`.
2. Expose both stdio and HTTP MCP transports.
3. Use Effect v4 MCP primitives from `effect/unstable/ai/McpServer`.
4. Talk to the local Cycle REST API as its backend, using the same discovery and authentication
   model as `@cycle/cli`.
5. Expose the v0.2 curated agent-facing workspace and planning tool subset.
6. Require explicit repository and issue identifiers for operations that mutate or read a specific
   repository or issue, while allowing workspace discovery and inbox tools to operate without an
   active issue context.
7. Allow write tools to execute immediately once called by the MCP client.
8. Mark MCP tools with accurate read-only, destructive, idempotent, and open-world annotations.
9. Return successful tool results as MCP `structuredContent` and JSON text content.
10. Return domain, validation, policy, and REST API failures as MCP tool results with `isError:
true`, not as protocol-level failures.
11. Reserve MCP protocol-level failures for invalid MCP params, unknown tools, MCP
    transport/session failures, and unexpected server defects.
12. Provide deterministic tests for tool listing, tool calls, failure mapping, stdio transport, and
    HTTP transport.

## 5. Non-Goals

`@cycle/mcp` v0.2 MUST NOT:

1. Open or register repositories.
2. Synchronize or push repositories.
3. Mount GitDB, create SQLite projections, or access Cycle storage directly.
4. Import desktop renderer code or depend on Electron APIs.
5. Reimplement usecase validation, workflow policy, ticket mutation rules, or repository materialization.
6. Expose every REST operation.
7. Expose repository open, repository sync, repository push, issue archive, issue restore, issue
   delete, label mutation, user mutation, template mutation, or destructive view/archive tools.
8. Infer repository or issue context for writes from the current working directory, branch name,
   prompt text, or environment when a tool is called.
9. Require a human approval round trip inside the MCP server before executing write tools.
10. Treat the MCP HTTP transport as a public network service.

## 6. System Overview

### 6.1 Package Position

The target dependency direction is:

```text
@cycle/contracts
  shared schemas, domain DTOs, usecase contracts, and aliases

@cycle/api
  local REST API over @cycle/usecases

@cycle/cli
  REST API discovery and client behavior

@cycle/mcp
  -> @cycle/contracts
  -> local REST API client/discovery helper
  -> effect/unstable/ai/McpServer
  MCP tool schemas, handlers, stdio transport, HTTP transport
```

`@cycle/mcp` SHOULD reuse or share the CLI REST discovery/client implementation. If importing
`@cycle/cli` would pull in command parsing or an undesirable package boundary, the shared REST
client/discovery logic SHOULD be extracted into a smaller package or module before `@cycle/mcp`
duplicates it.

### 6.2 Main Components

`@cycle/mcp` owns:

- MCP tool definitions for the curated issue-management subset.
- MCP tool handler implementations that translate calls into REST API requests.
- API discovery and token loading for MCP runtime processes.
- stdio server construction for MCP clients that launch a local process.
- HTTP MCP server construction for MCP clients that connect to a local loopback URL.
- MCP result formatting, including structured success values and tool-level error values.
- MCP logging, request IDs, and transport lifecycle.
- Tests and conformance fixtures for the MCP adapter behavior.

`@cycle/mcp` does not own:

- Durable issue storage.
- Usecase execution.
- Ticket workflow policy.
- REST route semantics.
- API authentication token generation.
- Desktop app configuration migration, except reading existing local config when discovering the API.

### 6.3 Runtime Modes

The package MUST support two MCP runtime modes:

- `stdio`: the MCP client launches a `cycle-mcp` process and communicates over stdin/stdout.
- `http`: the MCP server listens on a loopback HTTP address and serves MCP JSON-RPC at a configured
  path.

Both runtime modes MUST use the same tool registry, tool schemas, API client, failure mapping, and
observability behavior.

## 7. Effect MCP Implementation Contract

### 7.1 Source API

The implementation MUST use `effect/unstable/ai/McpServer` as the MCP server primitive. The package
MUST NOT implement raw MCP session negotiation, JSON-RPC message routing, tool list notifications,
or protocol version negotiation by hand unless the Effect MCP module is removed or materially
changes.

The relevant Effect MCP APIs are:

- `McpServer.layerStdio` for stdio transport.
- `McpServer.layerHttp` for HTTP transport.
- `McpServer.registerToolkit` or `McpServer.toolkit` for registering Effect AI toolkits.
- `McpServer.registerResource` or `McpServer.resource` only if v0.2 adds optional context resources.
- `Tool.make`, `Toolkit.make`, and tool annotations from `effect/unstable/ai/Tool`.

### 7.2 Server Identity

The MCP server identity MUST include:

- name: `cycle`
- version: package version or the implementation-defined `@cycle/mcp` version

The implementation MAY expose a package option to override the server name and version for tests,
but production defaults MUST be stable.

### 7.3 Transport Construction

The stdio runtime MUST compose:

```ts
McpServer.layerStdio({
  name: "cycle",
  version,
});
```

with the Cycle MCP tool layer, the local API client/discovery layer, and required Node services.

The HTTP runtime MUST compose:

```ts
McpServer.layerHttp({
  name: "cycle",
  version,
  path: "/mcp",
});
```

with the same tool and API layers. The default HTTP MCP path MUST be `/mcp`.

### 7.4 Tool Registration

The implementation SHOULD define tools with Effect AI `Tool.make` and group them with
`Toolkit.make`. It SHOULD register the toolkit through `McpServer.toolkit` or
`McpServer.registerToolkit` so Effect generates MCP tool schemas from Effect schemas.

The implementation MAY register MCP tools directly if a specific MCP feature cannot be represented
by `Tool.make`, but direct registration MUST preserve the same schemas, annotations, and failure
mapping required by this spec.

## 8. Local REST API Contract

### 8.1 Backend Boundary

Every MCP tool call MUST be translated into one or more local REST API requests against `@cycle/api`.
The MCP package MUST NOT call `UseCaseRunner.run` directly.

The MCP runtime MUST fail tool calls when the local REST API is unavailable. It MUST NOT start a
second API server, desktop runtime, repository runtime, or database runtime as an implicit fallback.

### 8.2 Discovery

The MCP package MUST discover the local REST API using the same precedence as the CLI:

1. Explicit process options or flags for API URL and API token.
2. `CYCLE_API_URL` and `CYCLE_API_TOKEN`.
3. Runtime discovery file for the current user plus static token from app config.
4. Documented default API base URL plus static token from app config.

If no local API URL and token can be discovered, the MCP server MAY still initialize, but every tool
call MUST return an MCP tool error result with code `API_UNAVAILABLE`. The server MAY instead fail
startup when configured with `requireApiOnStart: true`.

### 8.3 REST Client Behavior

The REST client MUST send:

- `Accept: application/json`
- `Authorization: Bearer <token>`
- `Content-Type: application/json` for requests with bodies
- `X-Request-Id` for every tool call
- `User-Agent: cycle-mcp/<version>` where the runtime supports setting the header

The REST client SHOULD generate a fresh request ID for each tool call unless the tool input includes
an explicit `requestId`.

The REST client MUST parse standard API success envelopes and error envelopes. It MUST treat
non-2xx responses as tool-level failures.

### 8.4 Source Metadata

The MCP package SHOULD identify itself to the API through headers where supported. If the current
REST API only records source as `api`, this is acceptable for v0.2. A future REST API extension MAY
map an `X-Cycle-Source: mcp` header into usecase metadata.

## 9. Security and Transport Safety

### 9.1 Stdio Transport

The stdio transport is intended for local MCP clients that launch `cycle-mcp` as a child process.
The server MUST write only MCP protocol messages to stdout. Logs, diagnostics, and human-readable
status messages MUST go to stderr or the Effect logging sink configured for stderr.

The stdio transport MUST NOT expose an additional network listener.

### 9.2 HTTP MCP Transport

The HTTP transport MUST bind only to loopback hosts by default:

- `127.0.0.1`
- `localhost`

Binding to any non-loopback host MUST be rejected unless an explicit future extension adds a
separate security review and configuration flag.

The HTTP transport MUST require authentication by default. The default authentication mechanism
SHOULD be bearer-token authentication using either:

- an explicit MCP HTTP token supplied to `@cycle/mcp`, or
- the existing local Cycle API static token when explicitly configured to reuse it.

Missing, malformed, or invalid HTTP MCP credentials MUST be rejected before the request reaches the
MCP protocol handler. Auth failures MUST NOT reveal expected token values, token prefixes, config
paths, or API discovery details.

The HTTP transport MAY support unauthenticated mode only when all are true:

- the caller explicitly sets an option such as `auth: false`;
- the server binds to loopback;
- the server logs a warning to stderr or the configured logger;
- tests cover that unauthenticated mode is opt-in.

### 9.3 Secrets

API tokens, MCP HTTP tokens, credentials, and bearer headers MUST be redacted from logs, tool
results, exceptions, and structured diagnostic output.

Error `details` values MUST be filtered for secret-like keys matching token, secret, password,
credential, api key, or private key patterns.

## 10. Tool Context Model

### 10.1 Required Context

Tool inputs MUST require the minimum explicit context needed for the operation:

- workspace discovery tools MAY omit both `repositoryId` and `issueId`;
- repository-scoped tools MUST include `repositoryId`;
- issue-specific tools MUST include `repositoryId` and `issueId`;
- list and search tools MAY include `issueId` as audit context but MUST NOT require it;
- inbox tools MUST include the user identifier required by the REST inbox API;
- batch planning tools MUST include `repositoryId` and caller-stable client IDs for newly created
  planned issues.

Tools MUST NOT infer write targets from process state. A tool MAY use explicit selected repository
or `cycle://` references passed in the tool input, but it MUST NOT derive mutation targets from the
current working directory, branch name, prompt text, or environment variables.

### 10.2 Optional Request Metadata

Every tool input MAY include:

- `requestId`: caller-provided request ID.

If absent, the MCP package MUST generate a request ID. The generated ID SHOULD be stable for the
duration of one tool call only.

### 10.3 Target Issue Rules

For tools that operate on an issue other than the active issue, the input MUST use a separate field:

- `targetIssueId` for direct reads or updates of another issue.
- `relatedIssueId` for relation operations.

When `targetIssueId` is omitted, issue-specific tools MUST target `issueId`.

## 11. Tool Set

### 11.1 Tool Naming

Tool names MUST be stable, snake*case, and prefixed with `cycle*`. The v0.2 tool set is:

- `cycle_repository_list`
- `cycle_repository_get`
- `cycle_autocomplete`
- `cycle_inbox_list`
- `cycle_inbox_mark_read`
- `cycle_inbox_mark_unread`
- `cycle_inbox_archive`
- `cycle_issue_get`
- `cycle_issue_list`
- `cycle_issue_search`
- `cycle_issue_create`
- `cycle_issue_update`
- `cycle_issue_transition`
- `cycle_issue_comments_list`
- `cycle_issue_comment_add`
- `cycle_issue_records_list`
- `cycle_issue_record_add`
- `cycle_issue_history`
- `cycle_issue_relation_add`
- `cycle_issue_relation_remove`
- `cycle_label_list`
- `cycle_user_list`
- `cycle_template_list`
- `cycle_view_list`
- `cycle_view_create`
- `cycle_automation_evaluate`
- `cycle_plan_apply`

The package MAY expose internal mappings to REST endpoints or legacy usecase aliases, but MCP
clients MUST see the tool names above. Removing or renaming any v0.2 tool is a breaking change.

### 11.2 Common Result Envelope

Each successful tool call SHOULD return a structured value equivalent to:

```ts
type CycleMcpToolSuccess<T> = {
  readonly data: T;
  readonly meta: {
    readonly requestId: string;
    readonly repositoryId?: string;
    readonly issueId?: string;
  };
};
```

Paged tools SHOULD include page and link metadata from the REST API:

```ts
type CycleMcpPagedToolSuccess<T> = {
  readonly data: ReadonlyArray<T>;
  readonly links?: unknown;
  readonly meta: {
    readonly requestId: string;
    readonly repositoryId?: string;
    readonly issueId?: string;
    readonly totalCount?: number | null;
  };
  readonly page?: unknown;
};
```

The MCP tool result MUST include:

- `structuredContent` containing the structured success or failure value.
- text content containing compact JSON of the same value.

### 11.3 Common Tool Error Envelope

Tool-level failures MUST return `isError: true` and a structured value equivalent to:

```ts
type CycleMcpToolError = {
  readonly error: {
    readonly code: string;
    readonly details?: unknown;
    readonly message: string;
    readonly requestId: string;
    readonly retryable: boolean;
    readonly status?: number;
  };
  readonly meta: {
    readonly repositoryId?: string;
    readonly issueId?: string;
  };
};
```

### 11.4 `cycle_issue_get`

Purpose: read one issue.

Input fields:

- `repositoryId`: string, required.
- `issueId`: string, required.
- `targetIssueId`: string, optional. Defaults to `issueId`.
- `requestId`: string, optional.

REST mapping:

- `GET /v1/repositories/:repositoryId/issues/:targetIssueId`

Annotations:

- read-only: `true`
- destructive: `false`
- idempotent: `true`
- open-world: `false`

### 11.5 `cycle_issue_list`

Purpose: list issues in the repository using supported API filters.

Input fields:

- `repositoryId`: string, required.
- `issueId`: string, optional audit context.
- `query`: issue list query object, optional.
- `requestId`: string, optional.

REST mapping:

- `GET /v1/repositories/:repositoryId/issues`

The implementation MUST translate `query` to the REST API query parameter format used by
`@cycle/api`. Unsupported query keys MUST fail validation before the REST request is sent.

Annotations:

- read-only: `true`
- destructive: `false`
- idempotent: `true`
- open-world: `false`

### 11.6 `cycle_issue_search`

Purpose: search issue titles, bodies, and comments.

Input fields:

- `repositoryId`: string, required.
- `issueId`: string, optional audit context.
- `text`: string, required.
- `repositoryIds`: string array, optional. When supplied, the search MAY span the selected
  repositories supported by the REST API.
- `limit`: number, optional.
- `cursor`: string, optional.
- `requestId`: string, optional.

REST mapping:

- `GET /v1/repositories/:repositoryId/issues?q=...`

The implementation MAY use a dedicated search REST endpoint if one is added. Until then, it MUST
use the API's supported issue search/list semantics.

Annotations:

- read-only: `true`
- destructive: `false`
- idempotent: `true`
- open-world: `false`

### 11.7 `cycle_issue_update`

Purpose: update an issue body or mutable frontmatter.

Input fields:

- `repositoryId`: string, required.
- `issueId`: string, required.
- `targetIssueId`: string, optional. Defaults to `issueId`.
- `body`: string, optional.
- `frontmatter`: record, optional.
- `message`: string, optional.
- `requestId`: string, optional.

At least one of `body`, `frontmatter`, or `message` MUST be present.

REST mapping:

- `PATCH /v1/repositories/:repositoryId/issues/:targetIssueId`

REST body:

```json
{
  "body": "optional markdown",
  "frontmatter": {},
  "message": "optional change message"
}
```

Annotations:

- read-only: `false`
- destructive: `false`
- idempotent: `false`
- open-world: `false`

### 11.8 `cycle_issue_transition`

Purpose: transition an issue to a new workflow status.

Input fields:

- `repositoryId`: string, required.
- `issueId`: string, required.
- `targetIssueId`: string, optional. Defaults to `issueId`.
- `status`: string, required.
- `reason`: string, optional.
- `requestId`: string, optional.

REST mapping:

- `POST /v1/repositories/:repositoryId/issues/:targetIssueId/transitions`

Annotations:

- read-only: `false`
- destructive: `false`
- idempotent: `false`
- open-world: `false`

### 11.9 `cycle_issue_comments_list`

Purpose: list user-visible comments for an issue.

Input fields:

- `repositoryId`: string, required.
- `issueId`: string, required.
- `targetIssueId`: string, optional. Defaults to `issueId`.
- `cursor`: string, optional.
- `limit`: number, optional.
- `requestId`: string, optional.

REST mapping:

- `GET /v1/repositories/:repositoryId/issues/:targetIssueId/comments`

Annotations:

- read-only: `true`
- destructive: `false`
- idempotent: `true`
- open-world: `false`

### 11.10 `cycle_issue_comment_add`

Purpose: add a user-visible comment to an issue.

Input fields:

- `repositoryId`: string, required.
- `issueId`: string, required.
- `targetIssueId`: string, optional. Defaults to `issueId`.
- `body`: string, required.
- `requestId`: string, optional.

REST mapping:

- `POST /v1/repositories/:repositoryId/issues/:targetIssueId/comments`

Annotations:

- read-only: `false`
- destructive: `false`
- idempotent: `false`
- open-world: `false`

### 11.11 `cycle_issue_history`

Purpose: list history commits for an issue.

Input fields:

- `repositoryId`: string, required.
- `issueId`: string, required.
- `targetIssueId`: string, optional. Defaults to `issueId`.
- `cursor`: string, optional.
- `limit`: number, optional.
- `requestId`: string, optional.

REST mapping:

- `GET /v1/repositories/:repositoryId/issues/:targetIssueId/history`

Annotations:

- read-only: `true`
- destructive: `false`
- idempotent: `true`
- open-world: `false`

### 11.12 `cycle_issue_relation_add`

Purpose: add a relation from the target issue to another issue.

Input fields:

- `repositoryId`: string, required.
- `issueId`: string, required.
- `targetIssueId`: string, optional. Defaults to `issueId`.
- `relatedIssueId`: string, required.
- `type`: one of `related`, `blocked-by`, `blocking`, or `duplicate`, required.
- `requestId`: string, optional.

REST mapping:

- `POST /v1/repositories/:repositoryId/issues/:targetIssueId/relations`

Annotations:

- read-only: `false`
- destructive: `false`
- idempotent: `false`
- open-world: `false`

### 11.13 `cycle_issue_relation_remove`

Purpose: remove a relation from the target issue.

Input fields:

- `repositoryId`: string, required.
- `issueId`: string, required.
- `targetIssueId`: string, optional. Defaults to `issueId`.
- `relatedIssueId`: string, required.
- `type`: one of `related`, `blocked-by`, `blocking`, or `duplicate`, required.
- `requestId`: string, optional.

REST mapping:

- `POST /v1/repositories/:repositoryId/issues/:targetIssueId/relations/remove`

The MCP tool contract remains stable if a future REST API adds a `DELETE` relation route. Until
then, the implementation MUST use the supported `POST .../relations/remove` route.

Annotations:

- read-only: `false`
- destructive: `false`
- idempotent: `false`
- open-world: `false`

### 11.14 v0.2 Workspace, Inbox, Metadata, and Planning Tools

The v0.2 tools below extend the original issue-focused surface so agents can start from global
chat, inbox mentions, selected repository context, or a planning prompt without requiring a pre-
existing active issue.

All tools in this section MUST use the same REST API client, request ID generation, structured
result envelope, error mapping, and secret redaction rules as the issue tools above.

#### Repository and Reference Discovery

- `cycle_repository_list`
  - Purpose: list repositories currently available to the local Cycle API.
  - Input: optional `repositoryId`, optional `path`, optional `requestId`.
  - REST mapping: `GET /v1/repositories` with `filter[id]` and `filter[path]` when supplied.
  - Annotation: read-only, idempotent.
- `cycle_repository_get`
  - Purpose: read repository status and metadata.
  - Input: `repositoryId`, optional `requestId`.
  - REST mapping: `GET /v1/repositories/:repositoryId`.
  - Annotation: read-only, idempotent.
- `cycle_autocomplete`
  - Purpose: resolve user-facing references for repositories and tickets, including `cycle://`
    references used by Cycle chat and markdown.
  - Input: optional `query`, optional `types` containing `repository` and/or `ticket`, optional
    `limit`, optional `requestId`.
  - REST mapping: `GET /v1/autocomplete`.
  - Annotation: read-only, idempotent.

#### Inbox and Mention Handling

- `cycle_inbox_list`
  - Purpose: list inbox items for an explicit user, including mentions, assignments, and comment
    notifications.
  - Input: `userId`, optional `status`, `reason`, `repositoryIds`, `ticketId`, `createdAfter`,
    `createdBefore`, `includeSourceInactive`, `cursor`, `limit`, and `requestId`.
  - REST mapping: `GET /v1/inbox`.
  - Annotation: read-only, idempotent.
- `cycle_inbox_mark_read`, `cycle_inbox_mark_unread`, and `cycle_inbox_archive`
  - Purpose: update inbox item state after an agent has handled or deferred a notification.
  - Input: `userId`, `itemIds`, optional `allowMissing`, optional `requestId`.
  - REST mappings: `POST /v1/inbox/read`, `POST /v1/inbox/unread`, and
    `POST /v1/inbox/archive`.
  - Annotation: write, non-destructive, non-idempotent unless the REST API treats duplicate state
    transitions as idempotent.

#### Issue Creation and Records

- `cycle_issue_create`
  - Purpose: create a committed issue in a repository.
  - Input: `repositoryId`, `title`, optional markdown `body`, `type`, `status`, `priority`,
    `labels`, `assignee`, `parent`, `dueDate`, `estimate`, `externalLinks`,
    `planningNotRequired`, optional `requestId`.
  - REST mapping: `POST /v1/repositories/:repositoryId/issues`.
  - Annotation: write, non-destructive, non-idempotent.
- `cycle_issue_records_list`
  - Purpose: list linked records for an issue, including non-comment user-visible records.
  - Input: `repositoryId`, `issueId`, optional `targetIssueId`, optional `recordType`, `cursor`,
    `limit`, `requestId`.
  - REST mapping: `GET /v1/repositories/:repositoryId/issues/:targetIssueId/records`.
  - Annotation: read-only, idempotent.
- `cycle_issue_record_add`
  - Purpose: add a linked record to an issue.
  - Input: `repositoryId`, `issueId`, optional `targetIssueId`, `recordType`, `payload`, optional
    `userVisible`, optional `requestId`.
  - REST mapping: `POST /v1/repositories/:repositoryId/issues/:targetIssueId/records`.
  - Annotation: write, non-destructive, non-idempotent.

#### Planning Metadata and Project Setup

- `cycle_label_list`, `cycle_user_list`, `cycle_template_list`, and `cycle_view_list`
  - Purpose: let agents inspect the repository vocabulary, assignees, templates, and saved views
    before creating or updating planned work.
  - Input: `repositoryId`, optional text/filter fields supported by the corresponding REST list
    endpoint, optional `cursor`, `limit`, `requestId`.
  - REST mappings: `GET /v1/repositories/:repositoryId/labels`,
    `GET /v1/repositories/:repositoryId/users`,
    `GET /v1/repositories/:repositoryId/templates`, and
    `GET /v1/repositories/:repositoryId/views`.
  - Annotation: read-only, idempotent.
- `cycle_view_create`
  - Purpose: create a saved view for a planned set of work, such as a feature board or focused list.
  - Input: `repositoryId`, `name`, optional `description`, `kind`, `groupBy`, `display`, `query`,
    `sort`, `pinned`, optional `requestId`.
  - REST mapping: `POST /v1/repositories/:repositoryId/views`.
  - Annotation: write, non-destructive, non-idempotent.
- `cycle_automation_evaluate`
  - Purpose: evaluate repository, query, or explicit issue automation checks before or after an
    agent mutates Cycle state.
  - Input: `repositoryId`, optional `issueIds`, optional `query`, optional `failOnWarnings`,
    optional `requireFresh`, optional `severityThreshold`, optional `requestId`.
  - REST mapping: `POST /v1/repositories/:repositoryId/automation/evaluations`.
  - Annotation: read-only, idempotent from the agent perspective.

#### Batch Planning

- `cycle_plan_apply`
  - Purpose: create multiple planned issues and then apply relations between them in one agent tool
    call.
  - Input: `repositoryId`, `issues`, optional `relations`, optional `requestId`.
  - Each issue MUST include a caller-stable `clientId` and `title`. Issue fields otherwise follow
    `cycle_issue_create`.
  - Each relation MUST include `type`, plus either `fromIssueId` or `fromClientId`, and either
    `relatedIssueId` or `relatedClientId`.
  - REST mapping: one `POST /v1/repositories/:repositoryId/issues` request per issue, followed by
    one `POST /v1/repositories/:repositoryId/issues/:issueId/relations` request per relation.
  - The tool MUST preserve creation order.
  - The tool MUST reject duplicate issue `clientId` values before creating the duplicate issue.
  - If a later create or relation call fails after earlier issues were created, the tool MUST return
    `isError: true` and include the already-created issues and applied relations in error details.
  - Annotation: write, non-destructive, non-idempotent.

## 12. Schema Source and Validation

The implementation MUST define input and output schemas with Effect `Schema`.

Where a tool maps directly to an existing contract in `@cycle/contracts`, its schema SHOULD reuse
the relevant contract schema or a derived narrower schema. The MCP schema MAY be narrower than the
REST/usecase schema when that improves agent safety, but it MUST NOT accept values that the REST API
cannot validate.

Tool input decoding MUST happen before a REST request is made. Invalid tool input MUST become an
MCP invalid-params failure when Effect MCP handles decoding. If validation happens inside the tool
handler, it MUST return a tool-level error with code `INVALID_MCP_TOOL_INPUT`.

The implementation MUST validate local API success payloads before returning tool success. Invalid
API success payloads MUST return a tool-level error with code `INVALID_API_RESPONSE`.

## 13. Write Behavior

Write tools are allowed to execute immediately after an MCP client calls them. The MCP server MUST
NOT perform an additional approval prompt, elicitation request, or confirmation step in v0.2.

The package MUST still annotate write tools accurately so MCP clients that provide their own
approval UX can make informed decisions.

Write tools MUST rely on the REST API and usecase layer for policy enforcement. Policy failures
MUST be returned as tool-level errors.

## 14. Resources and Prompts

MCP resources and prompts are optional in v0.2.

If implemented, resources MUST be read-only and MUST NOT be required for tool correctness. A client
that only supports tools MUST be able to use the full v0.2 MCP surface.

Recommended optional resources:

- `cycle://issue/{repositoryId}/{issueId}`: current issue document.
- `cycle://issue/{repositoryId}/{issueId}/comments`: current issue comments.
- `cycle://issue/{repositoryId}/{issueId}/history`: current issue history.
- `cycle://repository/{repositoryId}`: current repository status and metadata.

Recommended optional prompt:

- `cycle_issue_context`: returns concise working context for a supplied `repositoryId` and `issueId`.

Resources and prompts MUST use the same REST API client and failure redaction rules as tools.

## 15. Public Package API

The package SHOULD expose a public API equivalent to:

```ts
export type CycleMcpApiDiscoveryOptions = {
  readonly apiUrl?: string;
  readonly apiToken?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export type CycleMcpServerInfo = {
  readonly name?: string;
  readonly version?: string;
};

export type CycleMcpOptions = CycleMcpApiDiscoveryOptions &
  CycleMcpServerInfo & {
    readonly requireApiOnStart?: boolean;
  };

export type CycleMcpHttpOptions = CycleMcpOptions & {
  readonly auth?: false | { readonly token: string };
  readonly host?: "127.0.0.1" | "localhost";
  readonly path?: string;
  readonly port?: number;
};

export const CycleMcpTools: Toolkit.Toolkit<any>;
export const CycleMcpToolsLive: Layer.Layer<never, never, CycleMcpRuntime>;
export const layerStdio: (options: CycleMcpOptions) => Layer.Layer<never, never, NodeServices>;
export const layerHttp: (options: CycleMcpHttpOptions) => Layer.Layer<never, never, NodeServices>;
export const runStdio: (options: CycleMcpOptions) => Effect.Effect<never, unknown, NodeServices>;
export const startHttpServer: (
  options: CycleMcpHttpOptions,
) => Effect.Effect<CycleMcpHttpServerHandle, unknown, NodeServices>;
```

The exact TypeScript names are implementation-defined, but the package MUST expose:

- a composable stdio layer or run function;
- a composable HTTP layer or server start function;
- testable tool definitions independent of transport;
- testable REST client/discovery services.

## 16. Binary Contract

The package SHOULD provide a binary named `cycle-mcp`.

The binary SHOULD support:

- `--transport stdio`
- `--transport http`
- `--api-url <url>`
- `--api-token <token>`
- `--host <127.0.0.1|localhost>`
- `--port <number>`
- `--path <path>`
- `--mcp-token <token>`
- `--no-http-auth` for explicit local unauthenticated HTTP MCP mode

Default behavior:

- transport: `stdio`
- HTTP host: `127.0.0.1`
- HTTP path: `/mcp`
- HTTP auth: enabled when transport is `http`

The binary MUST print non-protocol diagnostics to stderr. In stdio mode, stdout MUST be reserved for
MCP protocol messages.

## 17. Failure Model

### 17.1 Tool-Level Failures

The following failures MUST be represented as MCP tool results with `isError: true`:

- local REST API unavailable;
- REST API 4xx or 5xx error envelopes;
- repository not open;
- issue not found;
- invalid domain input returned by the API;
- workflow policy violations;
- conflicts and stale cursors;
- timeout responses;
- invalid API success envelopes;
- invalid API error envelopes.

### 17.2 Protocol-Level Failures

The following failures MAY be represented as MCP protocol-level errors:

- unknown MCP method;
- unknown MCP tool name;
- malformed JSON-RPC request;
- missing MCP session ID in HTTP mode after initialization;
- tool input that cannot be decoded by Effect MCP before the handler runs;
- server defects that prevent construction of a valid MCP response.

### 17.3 Retry Semantics

The MCP package MUST preserve the REST API error `retryable` value when available.

If no API retryability value is available:

- HTTP 408, 429, 500, 502, 503, and 504 SHOULD be treated as retryable.
- HTTP 400, 401, 403, 404, 409, and 422 SHOULD be treated as non-retryable unless the API response
  explicitly says otherwise.

The MCP server MUST NOT perform unbounded automatic retries. The implementation MAY retry one
network connection failure before returning `API_UNAVAILABLE`, but that behavior is
implementation-defined and MUST be covered by tests if implemented.

## 18. Observability

The MCP package MUST log structured events for:

- server startup;
- server shutdown;
- API discovery success or failure;
- tool call start;
- tool call success;
- tool call tool-level failure;
- unexpected defects;
- HTTP MCP authentication failures.

Logs MUST include when available:

- transport: `stdio` or `http`;
- tool name;
- request ID;
- repository ID;
- active issue ID;
- target issue ID;
- REST method and route template, not full URL with secrets;
- HTTP status;
- failure code;
- duration in milliseconds.

Logs MUST NOT include:

- API token;
- MCP HTTP token;
- Authorization headers;
- full request bodies for comments or issue bodies by default.

## 19. Configuration

`@cycle/mcp` SHOULD be configurable entirely through constructor options and environment variables.
It MUST NOT require desktop-specific config services at runtime.

Recognized environment variables SHOULD include:

- `CYCLE_API_URL`
- `CYCLE_API_TOKEN`
- `CYCLE_API_RUNTIME_FILE`
- `CYCLE_CONFIG_PATH`
- `CYCLE_MCP_TRANSPORT`
- `CYCLE_MCP_HOST`
- `CYCLE_MCP_PORT`
- `CYCLE_MCP_PATH`
- `CYCLE_MCP_TOKEN`
- `CYCLE_MCP_HTTP_AUTH`

Environment variable values MUST have lower precedence than explicit constructor options or binary
flags.

Invalid configuration MUST fail startup in HTTP mode when it affects binding or authentication.
Invalid API discovery configuration MAY be deferred to tool-call failure unless
`requireApiOnStart` is enabled.

## 20. HTTP MCP Server Lifecycle

The HTTP MCP server handle MUST expose:

- bound base URL;
- MCP path;
- port;
- close/dispose function.

The close function MUST release the HTTP listener and Effect scope. It SHOULD be idempotent.

If the HTTP server writes a runtime discovery file for MCP clients, the file MUST:

- be optional;
- use owner-only permissions where the platform supports them;
- omit API tokens unless explicitly configured otherwise;
- be removed on clean shutdown.

MCP HTTP runtime discovery is separate from Cycle REST API discovery.

## 21. Compatibility and Versioning

Tool names and input field names are public API. Removing or renaming a v0.2 tool MUST be treated as
a breaking change.

The implementation MAY add optional input fields to existing tools in minor versions if:

- existing inputs remain valid;
- default behavior is unchanged;
- tests cover backwards compatibility.

The implementation MAY add new tools in minor versions. New tools MUST follow the `cycle_` prefix
and MUST be listed in this spec or a successor spec before implementation.

The package MUST tolerate supported Effect MCP protocol versions handled by `McpServer.ts`.

## 22. Reference Algorithms

### 22.1 Tool Call Handling

```text
handleTool(toolName, rawInput):
  requestStartedAt = now()
  input = decode tool schema from rawInput
  requestId = input.requestId or generateRequestId()

  api = discover or read cached API client
  if api unavailable:
    return toolError(API_UNAVAILABLE, requestId, input.repositoryId, input.issueId)

  restRequest = map toolName and input to REST method, path, query, body
  response = send REST request with bearer token and x-request-id

  if response is not reachable:
    return toolError(API_UNAVAILABLE, requestId, input.repositoryId, input.issueId)

  payload = parse JSON response

  if response.status is not 2xx:
    return toolErrorFromApiEnvelope(payload, response.status, input)

  success = decode expected success schema from payload
  if success decoding fails:
    return toolError(INVALID_API_RESPONSE, requestId, input.repositoryId, input.issueId)

  return toolSuccess(success, requestId, input.repositoryId, input.issueId)
```

### 22.2 API Discovery

```text
discoverApi(options, env):
  if options.apiUrl and options.apiToken:
    return normalize(options.apiUrl), options.apiToken

  if env.CYCLE_API_URL and env.CYCLE_API_TOKEN:
    return normalize(env.CYCLE_API_URL), env.CYCLE_API_TOKEN

  token = read config token from CYCLE_CONFIG_PATH or default app config path
  runtime = read CYCLE_API_RUNTIME_FILE or default runtime file
  if token and runtime.baseUrl:
    return normalize(runtime.baseUrl), token

  if token:
    return defaultBaseUrl(), token

  fail API_UNAVAILABLE
```

## 23. Test and Validation Matrix

### 23.1 Unit Tests

The package MUST test:

- all v0.2 tool names are registered;
- each tool exposes the expected MCP annotations;
- repository-scoped write tools reject missing `repositoryId`;
- issue-specific tools reject missing `issueId`;
- workspace discovery tools accept inputs without an active issue context;
- `targetIssueId` defaults to `issueId` where supported;
- REST path/query/body mapping for every tool;
- `cycle_issue_create` sends the expected create payload;
- `cycle_inbox_list` maps mention and status filters to the REST query format;
- `cycle_plan_apply` creates issues in order, maps client IDs to created issue IDs, and applies
  relations after issue creation;
- `cycle_plan_apply` reports already-created issues when a later REST call fails;
- REST success envelope decoding;
- REST error envelope mapping to `isError: true`;
- API token redaction in failures and logs;
- invalid API JSON mapping to `INVALID_API_RESPONSE`;
- API discovery precedence.

### 23.2 Integration Tests

The package MUST test against a local in-process API fixture or fetch mock:

- initialize stdio MCP server, list tools, and call `cycle_issue_get`;
- initialize HTTP MCP server, preserve MCP session headers, list tools, and call a read tool;
- HTTP MCP rejects unauthenticated requests when auth is enabled;
- `cycle_repository_list`, `cycle_autocomplete`, and `cycle_issue_search` can be called without an
  active issue context;
- `cycle_issue_update` sends the expected PATCH request and returns a structured issue document;
- `cycle_issue_comment_add` sends the expected POST request and returns a linked record;
- API 404 for an issue becomes a tool-level error, not an MCP protocol error;
- malformed tool input is rejected before REST mutation occurs.

### 23.3 End-to-End Smoke Tests

When the desktop local API is available, smoke tests SHOULD verify:

- `cycle-mcp --transport stdio` can be initialized by an MCP client fixture;
- `cycle-mcp --transport http` serves `/mcp` on loopback;
- tools can read an existing issue from an opened repository;
- tools can create planned issues from global chat when an explicit repository is provided;
- inbox mention workflows can list the mention, read the target issue, add a reply, and mark the
  inbox item read or archived;
- write tools modify only the repository and issue requested by explicit tool input;
- no repository open, sync, or push operation is available from the MCP tool list.

## 24. Implementation Checklist

An implementation is complete when:

1. `packages/mcp` exists as `@cycle/mcp`.
2. Package exports include stdio and HTTP server construction.
3. The package uses `effect/unstable/ai/McpServer` for protocol handling.
4. The package uses local REST API discovery and bearer authentication.
5. The curated v0.2 tool set is implemented and no non-goal tools are listed.
6. Repository and issue context requirements match section 10.
7. Every tool has Effect schemas and MCP annotations.
8. Write tools execute immediately when called.
9. Tool-level failures use `isError: true`.
10. Protocol-level failures are limited to MCP/protocol defects and invalid params.
11. Stdio mode writes protocol messages only to stdout.
12. HTTP mode binds to loopback and requires auth by default.
13. Tests cover the validation matrix in section 23.
14. Root `pnpm typecheck` passes.
15. Package-specific tests pass.

## 25. Open Questions

No critical open questions remain for v0.2.

Future implementation discussions may decide:

- whether REST API source metadata should support `mcp` as a first-class source;
- whether optional MCP resources should be implemented in the initial PR;
- whether local REST discovery should stay exported from `@cycle/cli` or move to a smaller shared
  package.
