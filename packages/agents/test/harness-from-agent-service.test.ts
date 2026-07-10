import { strict as assert } from "node:assert";
import { DateTime, Effect } from "effect";
import { describe, it } from "vitest";
import type { AgentHarnessCapabilities, AgentHarnessOpenInput } from "../src/AgentHarness.ts";
import { AgentMessage } from "../src/AgentMessage.ts";
import { makeHarnessFromAgentService } from "../src/providers/HarnessFromAgentService.ts";
import { codexAgentCapabilities } from "../src/providers/codex/capabilities.ts";
import type { AgentService, AgentTurnRequest } from "../src/types.ts";

const harnessCapabilities: AgentHarnessCapabilities = {
  approvalRequests: true,
  artifactEvents: true,
  commandEvents: true,
  fileChangeEvents: true,
  historyReplay: true,
  httpMcp: true,
  interruption: true,
  liveReattachment: true,
  modelListing: true,
  nativeSessions: true,
  providerCodeTools: true,
  readOnlySandbox: true,
  reasoningSummaryEvents: true,
  stdioMcp: false,
  steering: false,
  streaming: true,
  structuredOutput: true,
  usageReporting: true,
  userInputRequests: true,
  workspaceWriteSandbox: true,
};

const openInput = (input: {
  readonly message: string;
  readonly messages?: ReadonlyArray<AgentMessage>;
  readonly runId: string;
  readonly taskId: string;
}) =>
  ({
    attempt: {
      attemptId: `agent_attempt_${input.runId}`,
      runId: input.runId,
    },
    messages: input.messages ?? [],
    run: {
      runId: input.runId,
    },
    task: {
      authority: {
        allowedOperations: [],
        mode: "conversation-read",
      },
      input: { message: input.message },
      metadata: {},
      taskId: input.taskId,
      threadId: "agent_thread_test",
    },
  }) as unknown as AgentHarnessOpenInput;

describe("agent service harness", () => {
  it("resolves and attaches Cycle MCP before starting the provider stream", async () => {
    let request: AgentTurnRequest | undefined;
    const now = new Date();
    const service: AgentService = {
      abortTurn: async () => ({ accepted: true }),
      capabilities: () => codexAgentCapabilities,
      close: async () => {},
      createSession: async () => {
        throw new Error("unused");
      },
      listModels: async () => {
        throw new Error("unused");
      },
      provider: "codex",
      respondToApproval: async () => {
        throw new Error("unused");
      },
      respondToUserInput: async () => {
        throw new Error("unused");
      },
      resumeSession: async (sessionId) => ({
        createdAt: now,
        harnessId: "codex",
        id: sessionId,
        provider: "codex",
        updatedAt: now,
      }),
      run: async () => {
        throw new Error("unused");
      },
      stream: (_sessionId, input) => {
        request = input;
        return (async function* () {})();
      },
    };
    const mcp = {
      headers: { authorization: "Bearer cycle-token" },
      mode: "http" as const,
      url: "http://127.0.0.1:4738/mcp",
    };
    const harness = makeHarnessFromAgentService({
      capabilities: harnessCapabilities,
      harnessId: "codex",
      mcp: () => Effect.succeed(mcp),
      providerId: "codex",
      service,
    });

    await Effect.runPromise(
      Effect.scoped(
        harness.open(
          openInput({
            message: "List my Cycle tickets",
            runId: "agent_run_first",
            taskId: "agent_task_first",
          }),
        ),
      ),
    );

    assert.deepEqual(request?.mcp, mcp);
  });

  it("reuses a thread-level provider session and supplies prior messages", async () => {
    const requests: AgentTurnRequest[] = [];
    const resumedSessionIds: string[] = [];
    const timestamp = DateTime.makeUnsafe("2026-07-10T12:00:00.000Z");
    const service: AgentService = {
      abortTurn: async () => ({ accepted: true }),
      capabilities: () => codexAgentCapabilities,
      close: async () => {},
      createSession: async () => {
        throw new Error("unused");
      },
      listModels: async () => {
        throw new Error("unused");
      },
      provider: "codex",
      respondToApproval: async () => {
        throw new Error("unused");
      },
      respondToUserInput: async () => {
        throw new Error("unused");
      },
      resumeSession: async (sessionId) => {
        resumedSessionIds.push(sessionId);
        return {
          createdAt: new Date(),
          harnessId: "codex",
          id: sessionId,
          provider: "codex",
          updatedAt: new Date(),
        };
      },
      run: async () => {
        throw new Error("unused");
      },
      stream: (_sessionId, input) => {
        requests.push(input);
        return (async function* () {})();
      },
    };
    const harness = makeHarnessFromAgentService({
      capabilities: harnessCapabilities,
      harnessId: "codex",
      providerId: "codex",
      service,
    });
    const messages = [
      new AgentMessage({
        completedAt: timestamp,
        createdAt: timestamp,
        messageId: "agent_message_user" as never,
        parts: [{ _tag: "text", text: "Which tickets can be closed?" }],
        role: "user",
        status: "completed",
        taskId: "agent_task_first" as never,
        threadId: "agent_thread_test" as never,
        updatedAt: timestamp,
        visibility: "public",
      }),
      new AgentMessage({
        completedAt: timestamp,
        createdAt: timestamp,
        messageId: "agent_message_assistant" as never,
        parts: [{ _tag: "text", text: "UKN-70MK3 and UKN-66FC7 can be closed." }],
        role: "assistant",
        status: "completed",
        taskId: "agent_task_first" as never,
        threadId: "agent_thread_test" as never,
        updatedAt: timestamp,
        visibility: "public",
      }),
    ];

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* harness.open(
            openInput({
              message: "Which tickets can be closed?",
              runId: "agent_run_first",
              taskId: "agent_task_first",
            }),
          );
          yield* harness.open(
            openInput({
              message: "Close them all",
              messages,
              runId: "agent_run_second",
              taskId: "agent_task_second",
            }),
          );
        }),
      ),
    );

    assert.deepEqual(resumedSessionIds, ["agent_session_test", "agent_session_test"]);
    assert.match(String(requests[1]?.input), /UKN-70MK3 and UKN-66FC7/u);
    assert.match(String(requests[1]?.input), /Current user message:\nClose them all/u);
  });
});
