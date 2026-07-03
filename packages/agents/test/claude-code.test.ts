import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { defaultClaudeCodeProviderConfig } from "../src/providers/claude-code/config.ts";
import { claudeCodeError, mapClaudeCodeSdkMessage } from "../src/providers/claude-code/events.ts";
import { claudeCodeSdkOptionsFromTurn } from "../src/providers/claude-code/service.ts";

describe("@cycle/agents Claude Code provider", () => {
  it("attaches Cycle MCP tools to read-only Claude Code turns", () => {
    const options = claudeCodeSdkOptionsFromTurn({
      abortController: new AbortController(),
      providerConfig: defaultClaudeCodeProviderConfig(),
      request: {
        input: "List Cycle issues",
        mcp: {
          headers: {
            authorization: "Bearer test-token",
          },
          mode: "http",
          url: "http://127.0.0.1:4738/mcp",
        },
      },
    });

    assert.deepEqual(options.mcpServers, {
      cycle: {
        alwaysLoad: true,
        headers: {
          authorization: "Bearer test-token",
        },
        type: "http",
        url: "http://127.0.0.1:4738/mcp",
      },
    });
    assert.deepEqual(options.allowedTools, ["mcp__cycle__*"]);
    assert.deepEqual(options.tools, ["Read", "Grep", "Glob", "LS", "mcp__cycle__*"]);
  });

  it("auto-allows Cycle MCP tools without narrowing writable Claude Code tools", () => {
    const options = claudeCodeSdkOptionsFromTurn({
      abortController: new AbortController(),
      providerConfig: defaultClaudeCodeProviderConfig(),
      request: {
        input: "Update a Cycle issue",
        mcp: {
          headers: {
            authorization: "Bearer test-token",
          },
          mode: "http",
          url: "http://127.0.0.1:4738/mcp",
        },
        runtimeMode: "workspace-write",
      },
    });

    assert.deepEqual(options.allowedTools, ["mcp__cycle__*"]);
    assert.deepEqual(options.tools, {
      preset: "claude_code",
      type: "preset",
    });
  });

  it("maps assistant SDK text blocks to content deltas", () => {
    const at = new Date("2026-06-20T00:00:00.000Z");
    const events = mapClaudeCodeSdkMessage({
      at,
      message: {
        message: {
          content: [
            {
              text: "Hello from Claude.",
              type: "text",
            },
          ],
        },
        type: "assistant",
      } as any,
      sessionId: "session_claude",
      turnId: "turn_claude",
    });

    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      at,
      delta: "Hello from Claude.",
      sessionId: "session_claude",
      streamKind: "assistant_text",
      turnId: "turn_claude",
      type: "content.delta",
    });
  });

  it("maps successful SDK results to usage and completed turn events", () => {
    const at = new Date("2026-06-20T00:00:00.000Z");
    const events = mapClaudeCodeSdkMessage({
      at,
      message: {
        duration_ms: 42,
        is_error: false,
        num_turns: 1,
        result: "Done.",
        stop_reason: "end_turn",
        subtype: "success",
        total_cost_usd: 0.003,
        type: "result",
        usage: {
          cache_creation_input_tokens: 3,
          cache_read_input_tokens: 2,
          input_tokens: 5,
          output_tokens: 7,
        },
      } as any,
      sessionId: "session_claude",
      turnId: "turn_claude",
    });

    assert.equal(events.length, 2);
    assert.equal(events[0]?.type, "usage");
    assert.deepEqual(events[0]?.usage, {
      cacheReadTokens: 2,
      cacheWriteTokens: 3,
      cost: {
        amount: 0.003,
        currency: "USD",
      },
      inputTokens: 5,
      outputTokens: 7,
      totalTokens: 17,
    });
    assert.equal(events[1]?.type, "turn.completed");
    assert.equal(events[1]?.result?.provider, "claude-code");
    assert.equal(events[1]?.result?.status, "completed");
    assert.equal(events[1]?.result?.text, "Done.");
  });

  it("classifies common Claude Code runtime errors", () => {
    assert.equal(claudeCodeError(new Error("OAuth login required")).code, "authentication_error");
    assert.equal(claudeCodeError(new Error("rate limit exceeded")).code, "rate_limit");
    assert.equal(claudeCodeError(new Error("operation timeout")).code, "timeout");
    assert.equal(claudeCodeError(new Error("aborted by caller")).code, "cancelled");
  });
});
