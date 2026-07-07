import { strict as assert } from "node:assert";
import { ConfigProvider, Effect, Stream } from "effect";
import { describe, it } from "vitest";
import type { AgentEvent } from "../src/types.ts";
import {
  makeAgentRuntime,
  makeAgentHarnessRegistry,
  makeDefaultAgentAuthorityPolicy,
  makeDefaultAgentMcpConnector,
  makeInMemoryAgentDurability,
  makePromptAssembler,
  makePromptTemplateRegistry,
  type AgentHarnessAdapter,
  type AgentRunStartRequest,
} from "../src/index.ts";
import { agentRuntimeEnvironmentConfig } from "../src/AgentRuntimeConfig.ts";

const collect = async <A>(stream: Stream.Stream<A, unknown>): Promise<readonly A[]> =>
  Array.from(await Effect.runPromise(Stream.runCollect(stream)));

const makeIds = () => {
  let id = 0;
  return (prefix: string) => `${prefix}_${++id}`;
};

const fixedNow = () => new Date("2026-06-30T12:00:00.000Z");

const completedProviderEvents = (): readonly AgentEvent[] => [
  {
    at: fixedNow(),
    provider: "codex",
    sessionId: "provider_session",
    turnId: "provider_turn",
    type: "turn.started",
  },
  {
    at: fixedNow(),
    delta: "Done",
    sessionId: "provider_session",
    snapshot: "Done",
    streamKind: "assistant_text",
    turnId: "provider_turn",
    type: "content.delta",
  },
  {
    at: fixedNow(),
    sessionId: "provider_session",
    turnId: "provider_turn",
    type: "usage",
    usage: {
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
    },
  },
  {
    at: fixedNow(),
    result: {
      artifacts: [],
      createdAt: fixedNow(),
      finishReason: "stop",
      id: "provider_turn",
      provider: "codex",
      sessionId: "provider_session",
      status: "completed",
      text: "Done",
    },
    sessionId: "provider_session",
    turnId: "provider_turn",
    type: "turn.completed",
  },
];

const makeHarness = (
  events: readonly AgentEvent[] = completedProviderEvents(),
): AgentHarnessAdapter => ({
  capabilities: Effect.succeed({
    approvalRequests: true,
    interrupt: true,
    mcpHttp: true,
    mcpStdio: false,
    nativeThreadResume: true,
    providerNativeCodeTools: true,
    readOnlyWorkspace: true,
    sessionResume: true,
    steering: false,
    streaming: true,
    structuredOutput: true,
    usageReporting: true,
    userInputRequests: true,
    workspaceWrite: true,
  }),
  cancel: () => Effect.succeed({ accepted: true }),
  execute: () => Stream.fromIterable(events),
  harnessId: "codex",
  openSession: ({ attempt, run, session }) =>
    Effect.succeed({
      attemptId: attempt.attemptId,
      bindingId: `binding_${attempt.attemptId}`,
      createdAt: attempt.startedAt,
      harnessId: run.harnessId,
      native: {
        threadId: "native_thread",
      },
      providerId: run.providerId,
      runId: run.runId,
      sessionId: session.sessionId,
      status: "active",
      updatedAt: attempt.startedAt,
    }),
  providerId: "codex",
  resolveInteraction: () => Effect.succeed({ status: "accepted" }),
  steer: () =>
    Effect.succeed({
      accepted: false,
      reason: "not supported",
    }),
});

const makeRuntime = (events?: readonly AgentEvent[]) => {
  const durability = makeInMemoryAgentDurability();
  const makeId = makeIds();
  const promptRegistry = makePromptTemplateRegistry();

  return {
    durability,
    runtime: makeAgentRuntime({
      authorityPolicy: makeDefaultAgentAuthorityPolicy(),
      durability,
      harnessRegistry: makeAgentHarnessRegistry([makeHarness(events)]),
      makeId,
      mcpConnector: makeDefaultAgentMcpConnector(),
      now: fixedNow,
      promptAssembler: makePromptAssembler(promptRegistry, fixedNow, makeId),
    }),
  };
};

const baseRequest = (patch: Partial<AgentRunStartRequest> = {}): AgentRunStartRequest => ({
  agent: {
    agentId: "agent_local",
  },
  authority: {
    mode: "ticket-context",
    repositoryId: "repo_1",
    ticketId: "CYC-1",
  },
  idempotencyKey: "runtime-test",
  mcp: {
    mode: "disabled",
  },
  prompt: {
    input: {
      message: "Inspect the ticket.",
    },
    templateId: "ticket.research",
  },
  session: {
    conversationKey: "ticket:CYC-1",
    type: "by-conversation-key",
  },
  source: "agent-work",
  ...patch,
});

describe("@cycle/agents AgentRuntime", () => {
  it("reads runtime defaults from Effect Config", async () => {
    const config = await Effect.runPromise(
      agentRuntimeEnvironmentConfig.parse(
        ConfigProvider.fromEnv({
          env: {
            CYCLE_AGENT_AUTOMATIC_RESUME: "true",
            CYCLE_AGENT_DEFAULT_HARNESS_ID: "claude-code",
            CYCLE_AGENT_DEFAULT_MCP_FAILURE_POLICY: "fail-run",
            CYCLE_AGENT_DEFAULT_PROVIDER_ID: "claude-code",
            CYCLE_AGENT_DEFAULT_TIMEOUT_MS: "1234",
            CYCLE_AGENT_EVENT_DIAGNOSTICS: "raw-private",
            CYCLE_AGENT_LEASE_DURATION_MS: "4321",
            CYCLE_AGENT_PROMPT_DIAGNOSTICS: "redacted-full",
            CYCLE_AGENT_RUNTIME_OWNER_ID: "test-owner",
          },
        }),
      ),
    );

    assert.equal(config.automaticResume, true);
    assert.equal(config.defaultHarnessId, "claude-code");
    assert.equal(config.defaultMcpFailurePolicy, "fail-run");
    assert.equal(config.defaultProviderId, "claude-code");
    assert.equal(config.defaultTimeoutMs, 1234);
    assert.equal(config.eventDiagnostics, "raw-private");
    assert.equal(config.leaseDurationMs, 4321);
    assert.equal(config.ownerId, "test-owner");
    assert.equal(config.promptDiagnostics, "redacted-full");
  });

  it("starts a durable run and maps provider events into canonical runtime events", async () => {
    const { durability, runtime } = makeRuntime();
    const handle = await Effect.runPromise(runtime.start(baseRequest()));
    const events = await collect(handle.events);

    assert.deepEqual(
      events.map((event) => event._tag),
      [
        "AgentRuntimeRunStarted",
        "AgentRuntimeMessageDelta",
        "AgentRuntimeUsageReported",
        "AgentRuntimeMessageFinal",
        "AgentRuntimeRunCompleted",
      ],
    );
    assert.equal(
      events.every((event) => event.runId === handle.runId),
      true,
    );
    assert.deepEqual(
      events.map((event) => event.sequence),
      [1, 2, 3, 4, 5],
    );

    const stored = await Effect.runPromise(durability.getRun(handle.runId));
    assert.equal(stored?.status, "completed");
    assert.equal(stored?.terminal?.status, "completed");
  });

  it("uses idempotency keys to avoid duplicate non-terminal runs", async () => {
    const { runtime } = makeRuntime();
    const first = await Effect.runPromise(runtime.start(baseRequest()));
    const second = await Effect.runPromise(runtime.start(baseRequest()));

    assert.equal(second.runId, first.runId);
    assert.equal(second.sessionId, first.sessionId);
  });

  it("rejects implementation-worktree authority without a worktree path", async () => {
    const { runtime } = makeRuntime();
    const result = await Effect.runPromiseExit(
      runtime.start(
        baseRequest({
          authority: {
            mode: "implementation-worktree",
            repositoryId: "repo_1",
            ticketId: "CYC-1",
          },
          prompt: {
            input: {
              message: "Implement the ticket.",
            },
            templateId: "ticket.implementation",
          },
        }),
      ),
    );

    assert.equal(result._tag, "Failure");
  });

  it("cancels a run before provider execution is consumed", async () => {
    const { runtime } = makeRuntime();
    const handle = await Effect.runPromise(runtime.start(baseRequest()));
    const snapshot = await Effect.runPromise(
      runtime.cancel({
        reason: "user requested cancellation",
        runId: handle.runId,
      }),
    );
    const events = await collect(handle.events);

    assert.equal(snapshot.run.status, "cancelled");
    assert.deepEqual(
      events.map((event) => event._tag),
      ["AgentRuntimeRunStarted", "AgentRuntimeRunCancelled"],
    );
  });

  it("reconciles stale unconsumed attempts as interrupted", async () => {
    const { runtime } = makeRuntime();
    const handle = await Effect.runPromise(
      runtime.start(
        baseRequest({
          idempotencyKey: "runtime-reconcile-test",
        }),
      ),
    );
    const reconciled = await Effect.runPromise(runtime.reconcile());

    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0]?.run.runId, handle.runId);
    assert.equal(reconciled[0]?.run.status, "interrupted");
  });
});
