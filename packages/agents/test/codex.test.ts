import { strict as assert } from "node:assert";
import type {
  CodexOptions,
  RunResult,
  ThreadEvent,
  ThreadOptions,
  TurnOptions,
} from "@openai/codex-sdk";
import { describe, it } from "vitest";
import { makeCodexAgentService, type CodexClientLike, type CodexThreadLike } from "../src/codex.ts";
import type { AgentSessionBinding, AgentSessionStore } from "../src/types.ts";

describe("@cycle/agents codex adapter", () => {
  it("runs the Codex SDK with per-turn MCP config and selected cwd", async () => {
    let capturedCodexOptions: CodexOptions | undefined;
    let capturedThreadOptions: ThreadOptions | undefined;
    let capturedInput: string | undefined;
    let capturedTurnOptions: TurnOptions | undefined;
    const thread: CodexThreadLike = {
      id: "native_thread_test",
      run: async (input, options): Promise<RunResult> => {
        capturedInput = input;
        capturedTurnOptions = options;

        return {
          finalResponse: "Codex response",
          items: [],
          usage: {
            cached_input_tokens: 2,
            input_tokens: 10,
            output_tokens: 5,
            reasoning_output_tokens: 3,
          },
        };
      },
      runStreamed: async () => ({
        events: (async function* () {})(),
      }),
    };
    const client: CodexClientLike = {
      resumeThread: (_id, options) => {
        capturedThreadOptions = options;
        return thread;
      },
      startThread: (options) => {
        capturedThreadOptions = options;
        return thread;
      },
    };
    const service = makeCodexAgentService({
      codex: (options) => {
        capturedCodexOptions = options;
        return client;
      },
    });
    const session = await service.createSession({ title: "Test chat" });
    const result = await service.run(session.id, {
      context: {
        cwd: "/tmp/cycle",
      },
      input: "What should I work on next?",
      mcp: {
        headers: {
          authorization: "Bearer test-token",
        },
        mode: "http",
        url: "http://127.0.0.1:4738/mcp",
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(result.text, "Codex response");
    assert.equal(result.usage?.inputTokens, 10);
    assert.equal(capturedInput, "What should I work on next?");
    assert.equal(capturedThreadOptions?.approvalPolicy, "never");
    assert.equal(capturedThreadOptions?.sandboxMode, "read-only");
    assert.equal(capturedThreadOptions?.skipGitRepoCheck, true);
    assert.equal(capturedThreadOptions?.workingDirectory, "/tmp/cycle");
    assert.equal(capturedTurnOptions?.signal instanceof AbortSignal, true);
    assert.equal(capturedCodexOptions?.env?.CYCLE_AGENT_MCP_TOKEN, "test-token");
    assert.deepEqual(capturedCodexOptions?.config, {
      mcp_servers: {
        cycle: {
          bearer_token_env_var: "CYCLE_AGENT_MCP_TOKEN",
          enabled: true,
          url: "http://127.0.0.1:4738/mcp",
        },
      },
    });
  });

  it("streams normalized events from Codex SDK runStreamed", async () => {
    let runCalled = false;
    let capturedInput: string | undefined;
    let resumedThreadId: string | undefined;
    const sdkEvents: ThreadEvent[] = [
      { thread_id: "native_thread_stream", type: "thread.started" },
      { type: "turn.started" },
      {
        item: {
          id: "message_1",
          text: "Hel",
          type: "agent_message",
        },
        type: "item.started",
      },
      {
        item: {
          id: "message_1",
          text: "Hello",
          type: "agent_message",
        },
        type: "item.updated",
      },
      {
        item: {
          id: "tool_1",
          server: "cycle",
          status: "in_progress",
          tool: "list_issues",
          type: "mcp_tool_call",
          arguments: {
            repositoryId: "repo_test",
          },
        },
        type: "item.started",
      },
      {
        item: {
          id: "tool_1",
          result: {
            content: [],
            structured_content: {
              count: 1,
            },
          },
          server: "cycle",
          status: "completed",
          tool: "list_issues",
          type: "mcp_tool_call",
          arguments: {
            repositoryId: "repo_test",
          },
        },
        type: "item.completed",
      },
      {
        item: {
          id: "message_1",
          text: "Hello world",
          type: "agent_message",
        },
        type: "item.completed",
      },
      {
        type: "turn.completed",
        usage: {
          cached_input_tokens: 1,
          input_tokens: 7,
          output_tokens: 3,
          reasoning_output_tokens: 2,
        },
      },
    ];
    const thread: CodexThreadLike = {
      id: "native_thread_stream",
      run: async (): Promise<RunResult> => {
        runCalled = true;
        return {
          finalResponse: "not used",
          items: [],
          usage: null,
        };
      },
      runStreamed: async (input) => {
        capturedInput = typeof input === "string" ? input : JSON.stringify(input);

        return {
          events: (async function* () {
            for (const event of sdkEvents) yield event;
          })(),
        };
      },
    };
    const client: CodexClientLike = {
      resumeThread: (id) => {
        resumedThreadId = id;
        return thread;
      },
      startThread: () => thread,
    };
    const service = makeCodexAgentService({ codex: client });
    const session = await service.createSession({ title: "Streaming chat" });
    const events = [];

    for await (const event of service.stream(session.id, {
      input: "Stream this response",
    })) {
      events.push(event);
    }

    assert.equal(runCalled, false);
    assert.equal(capturedInput, "Stream this response");
    assert.deepEqual(
      events.map((event) => event.type),
      [
        "turn.started",
        "text.delta",
        "text.delta",
        "artifact",
        "progress",
        "artifact",
        "progress",
        "text.delta",
        "usage",
        "turn.completed",
      ],
    );
    assert.deepEqual(
      events.filter((event) => event.type === "text.delta").map((event) => event.delta),
      ["Hel", "lo", " world"],
    );
    const completed = events.find((event) => event.type === "turn.completed");
    assert.equal(completed?.type, "turn.completed");
    assert.equal(completed?.result.text, "Hello world");
    assert.equal(completed?.result.usage?.totalTokens, 10);
    assert.equal(completed?.result.artifacts.length, 1);

    await service.run(session.id, { input: "Continue" });
    assert.equal(resumedThreadId, "native_thread_stream");
  });

  it("persists Codex native thread bindings and resumes them through a session store", async () => {
    const bindings = new Map<string, AgentSessionBinding>();
    const sessionStore: AgentSessionStore = {
      get: async (sessionId) => bindings.get(sessionId),
      upsert: async (binding) => {
        bindings.set(binding.sessionId, binding);
      },
    };
    let firstStartCount = 0;
    const firstThread: CodexThreadLike = {
      id: "native_thread_persisted",
      run: async (): Promise<RunResult> => ({
        finalResponse: "not used",
        items: [],
        usage: null,
      }),
      runStreamed: async () => ({
        events: (async function* () {
          yield { thread_id: "native_thread_persisted", type: "thread.started" };
          yield { type: "turn.started" };
          yield {
            item: {
              id: "message_1",
              text: "Persisted",
              type: "agent_message",
            },
            type: "item.completed",
          };
          yield {
            type: "turn.completed",
            usage: {
              cached_input_tokens: 0,
              input_tokens: 1,
              output_tokens: 1,
              reasoning_output_tokens: 0,
            },
          };
        })(),
      }),
    };
    const firstClient: CodexClientLike = {
      resumeThread: () => {
        throw new Error("first turn should start a fresh Codex thread");
      },
      startThread: () => {
        firstStartCount += 1;
        return firstThread;
      },
    };
    const firstService = makeCodexAgentService({
      codex: firstClient,
      sessionStore,
    });

    for await (const _event of firstService.stream("session_persisted", {
      context: {
        cwd: "/tmp/cycle",
        threadId: "thread_persisted",
      },
      input: "Start persisted session",
      model: {
        id: "test-model",
      },
    })) {
      // exhaust stream
    }

    const stored = bindings.get("session_persisted");
    assert.equal(firstStartCount, 1);
    assert.equal(stored?.native?.threadId, "native_thread_persisted");
    assert.equal(stored?.status, "idle");
    assert.equal(stored?.activeTurnId, undefined);
    assert.equal(stored?.cwd, "/tmp/cycle");
    assert.equal(stored?.model, "test-model");
    assert.equal(stored?.threadId, "thread_persisted");

    let resumedThreadId: string | undefined;
    const secondThread: CodexThreadLike = {
      id: "native_thread_persisted",
      run: async (): Promise<RunResult> => ({
        finalResponse: "resumed",
        items: [],
        usage: null,
      }),
      runStreamed: async () => ({
        events: (async function* () {})(),
      }),
    };
    const secondService = makeCodexAgentService({
      codex: {
        resumeThread: (id) => {
          resumedThreadId = id;
          return secondThread;
        },
        startThread: () => {
          throw new Error("stored native thread id should resume Codex thread");
        },
      },
      sessionStore,
    });
    const result = await secondService.run("session_persisted", { input: "Continue" });

    assert.equal(resumedThreadId, "native_thread_persisted");
    assert.equal(result.text, "resumed");
  });
});
