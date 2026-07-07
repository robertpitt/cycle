import { strict as assert } from "node:assert";
import { Effect, Schema } from "effect";
import { describe, it } from "vitest";
import { AgentRuntimeEvent } from "../src/runtime-events.ts";
import {
  makeAgentOrchestrationService,
  type AgentEvent,
  type AgentService,
  type AgentOrchestrationServiceShape,
  type AgentSession,
  type AgentServiceRegistryShape,
  type AgentTurnRequest,
  type AgentTurnResult,
} from "../src/index.ts";

const collect = async <A>(iterable: AsyncIterable<A>): Promise<readonly A[]> => {
  const values: A[] = [];
  for await (const value of iterable) values.push(value);
  return values;
};

const makeSession = (id = "session_test"): AgentSession => ({
  createdAt: new Date("2026-06-22T00:00:00.000Z"),
  harnessId: "codex",
  id,
  provider: "codex",
  updatedAt: new Date("2026-06-22T00:00:00.000Z"),
});

const makeService = (
  stream: (request: AgentTurnRequest<any>) => AsyncIterable<AgentEvent>,
): AgentService => ({
  abortTurn: async () => ({ accepted: true, reason: "cancel_request" as never }),
  capabilities: () =>
    ({
      provider: "codex",
      sessionPersistence: "provider-local",
      streaming: true,
      structuredOutput: true,
      supportedJobTypes: [],
      supports: {
        abort: true,
        artifacts: true,
        fileChanges: true,
        mcp: true,
        toolEvents: true,
        usage: true,
      },
      workspace: "provider-defined",
    }) as never,
  listModels: async () => ({
    defaultModelId: null,
    fetchedAt: new Date("2026-06-22T00:00:00.000Z").toISOString(),
    models: [],
    provider: "codex",
    source: "unsupported",
  }),
  close: async () => {},
  createSession: async () => makeSession(),
  provider: "codex",
  respondToApproval: async (_sessionId, requestId) => ({
    requestId,
    sessionId: "session_test",
    status: "not_found",
  }),
  respondToUserInput: async (_sessionId, requestId) => ({
    requestId,
    sessionId: "session_test",
    status: "not_found",
  }),
  resumeSession: async (sessionId) => makeSession(sessionId),
  run: async <TStructured = unknown>(): Promise<AgentTurnResult<TStructured>> => {
    throw new Error("run is not used by orchestration tests");
  },
  stream: <TStructured = unknown>(_sessionId: string, request: AgentTurnRequest<TStructured>) =>
    stream(request) as AsyncIterable<AgentEvent<TStructured>>,
});

const makeRegistry = (service: AgentService): AgentServiceRegistryShape => ({
  serviceFor: () => Effect.succeed(service),
});

const makeOrchestration = (service: AgentService): AgentOrchestrationServiceShape =>
  makeAgentOrchestrationService({
    agentServices: makeRegistry(service),
    makeId: (() => {
      let id = 0;
      return (prefix) => `${prefix}_${++id}`;
    })(),
    now: () => new Date("2026-06-22T12:00:00.000Z"),
  });

describe("@cycle/agents orchestration", () => {
  it("schema-decodes runtime events", () => {
    const service = makeOrchestration(
      makeService(async function* () {
        yield {
          at: new Date("2026-06-22T12:00:00.000Z"),
          provider: "codex",
          sessionId: "session_test",
          turnId: "turn_test",
          type: "turn.started",
        };
        yield {
          at: new Date("2026-06-22T12:00:01.000Z"),
          result: {
            artifacts: [],
            createdAt: new Date("2026-06-22T12:00:00.000Z"),
            finishReason: "stop",
            id: "turn_test",
            provider: "codex",
            sessionId: "session_test",
            status: "completed",
            text: "Done",
          },
          sessionId: "session_test",
          turnId: "turn_test",
          type: "turn.completed",
        };
      }),
    );

    return collect(
      service.run({
        authority: {
          jobId: "job_test",
          mode: "ticket-context",
          repositoryId: "repo_test",
          ticketId: "TST-1",
        },
        mode: "agent-work",
        prompt: "Do the task",
        root: {
          agentId: "codex",
          providerId: "codex",
        },
      }),
    ).then((events) => {
      assert.equal(Schema.decodeUnknownSync(AgentRuntimeEvent)(events[0])._tag, "AgentRunStarted");
      assert.equal(
        Schema.decodeUnknownSync(AgentRuntimeEvent)(events.at(-1))._tag,
        "AgentRunCompleted",
      );
    });
  });

  it("maps provider stream events into root run events", async () => {
    const service = makeOrchestration(
      makeService(async function* () {
        yield {
          at: new Date("2026-06-22T12:00:00.000Z"),
          provider: "codex",
          sessionId: "session_test",
          turnId: "turn_test",
          type: "turn.started",
        };
        yield {
          at: new Date("2026-06-22T12:00:01.000Z"),
          delta: "Working",
          sessionId: "session_test",
          snapshot: "Working",
          streamKind: "assistant_text",
          turnId: "turn_test",
          type: "content.delta",
        };
        yield {
          at: new Date("2026-06-22T12:00:02.000Z"),
          sessionId: "session_test",
          turnId: "turn_test",
          type: "usage",
          usage: {
            inputTokens: 3,
            outputTokens: 4,
            totalTokens: 7,
          },
        };
        yield {
          at: new Date("2026-06-22T12:00:03.000Z"),
          result: {
            artifacts: [],
            createdAt: new Date("2026-06-22T12:00:00.000Z"),
            finishReason: "stop",
            id: "turn_test",
            provider: "codex",
            sessionId: "session_test",
            status: "completed",
            text: "Working",
            usage: {
              inputTokens: 3,
              outputTokens: 4,
              totalTokens: 7,
            },
          },
          sessionId: "session_test",
          turnId: "turn_test",
          type: "turn.completed",
        };
      }),
    );

    const events = await collect(
      service.run({
        authority: {
          jobId: "job_test",
          mode: "ticket-context",
          repositoryId: "repo_test",
          ticketId: "TST-1",
        },
        metadata: {
          requestId: "request_test",
        },
        mode: "agent-work",
        prompt: "Do the task",
        root: {
          agentId: "codex",
          model: "gpt-test",
          providerId: "codex",
        },
      }),
    );

    assert.deepEqual(
      events.map((event) => event._tag),
      ["AgentRunStarted", "AgentMessageDelta", "UsageReported", "AgentRunCompleted"],
    );
    assert.equal(events[0]?.runId, "run_1");
    assert.equal(
      events.every((event) => event.rootRunId === "run_1"),
      true,
    );
    assert.equal(events.at(-1)?._tag, "AgentRunCompleted");
    assert.equal(events.at(-1)?.jobId, "job_test");
  });

  it("does not suppress providers that only emit text deltas", async () => {
    const service = makeOrchestration(
      makeService(async function* () {
        yield {
          at: new Date("2026-06-22T12:00:01.000Z"),
          delta: "Hello",
          sessionId: "session_test",
          turnId: "turn_test",
          type: "text.delta",
        };
        yield {
          at: new Date("2026-06-22T12:00:02.000Z"),
          delta: " world",
          sessionId: "session_test",
          turnId: "turn_test",
          type: "text.delta",
        };
        yield {
          at: new Date("2026-06-22T12:00:03.000Z"),
          result: {
            artifacts: [],
            createdAt: new Date("2026-06-22T12:00:00.000Z"),
            finishReason: "stop",
            id: "turn_test",
            provider: "codex",
            sessionId: "session_test",
            status: "completed",
            text: "Hello world",
          },
          sessionId: "session_test",
          turnId: "turn_test",
          type: "turn.completed",
        };
      }),
    );

    const events = await collect(
      service.run({
        authority: {
          mode: "ticket-context",
          repositoryId: "repo_test",
        },
        mode: "chat",
        prompt: "Say hello",
        root: {
          agentId: "codex",
          providerId: "codex",
        },
      }),
    );

    assert.deepEqual(
      events.filter((event) => event._tag === "AgentMessageDelta").map((event) => event.delta),
      ["Hello", " world"],
    );
  });
});
