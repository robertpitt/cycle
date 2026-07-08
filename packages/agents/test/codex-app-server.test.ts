import { strict as assert } from "node:assert";
import {
  CodexAppServerProcessExitedError,
  CodexAppServerProtocolParseError,
  CodexAppServerSchemaDecodeError,
  makeCodexAppServerClient,
  makeCodexAppServerProtocol,
} from "../src/providers/codex/app-server/CodexAppServer.ts";
import { describe, it } from "vitest";

class Pushable<T> implements AsyncIterable<T> {
  private ended = false;
  private readonly items: T[] = [];
  private readonly waiters: Array<(value: IteratorResult<T>) => void> = [];

  push(item: T): void {
    const waiter = this.waiters.shift();
    if (waiter === undefined) {
      this.items.push(item);
      return;
    }
    waiter({ done: false, value: item });
  }

  end(): void {
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ done: false, value: item });
        if (this.ended) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

const parseLine = (line: string): Readonly<Record<string, unknown>> =>
  JSON.parse(line.trim()) as Readonly<Record<string, unknown>>;

describe("Codex app-server protocol", () => {
  it("correlates JSON-RPC requests across chunk boundaries", async () => {
    const input = new Pushable<string>();
    const outgoing: string[] = [];
    const protocol = makeCodexAppServerProtocol({
      transport: {
        input,
        send: (line) => {
          outgoing.push(line);
        },
      },
    });

    const response = protocol.request("initialize", { clientInfo: { name: "cycle" } });
    const request = parseLine(outgoing[0] ?? "");
    assert.equal(request.method, "initialize");

    input.push(`{"id":${String(request.id)},"res`);
    input.push('ult":{"userAgent":"mock"}}\n');

    assert.deepEqual(await response, { userAgent: "mock" });
  });

  it("dispatches server requests and writes handler responses", async () => {
    const input = new Pushable<string>();
    const outgoing: string[] = [];
    const client = makeCodexAppServerClient({
      transport: {
        input,
        send: (line) => {
          outgoing.push(line);
        },
      },
    });

    client.handleServerRequest("item/commandExecution/requestApproval", (payload) => {
      assert.equal(payload.itemId, "item_1");
      return { decision: "accept" as const };
    });
    input.push(
      JSON.stringify({
        id: "server_req_1",
        method: "item/commandExecution/requestApproval",
        params: {
          itemId: "item_1",
          threadId: "native_thread",
          turnId: "native_turn",
        },
      }) + "\n",
    );

    await waitFor(() => outgoing.length > 0);
    assert.deepEqual(parseLine(outgoing[0] ?? ""), {
      id: "server_req_1",
      result: { decision: "accept" },
    });
  });

  it("fails pending requests when the transport closes", async () => {
    const input = new Pushable<string>();
    const protocol = makeCodexAppServerProtocol({
      transport: {
        input,
        send: () => undefined,
      },
    });
    const pending = protocol.request("thread/start", {});

    await protocol.close(new CodexAppServerProcessExitedError({ code: 1 }));
    await assert.rejects(pending, CodexAppServerProcessExitedError);
  });

  it("surfaces schema decode failures for typed client responses", async () => {
    const input = new Pushable<string>();
    const outgoing: string[] = [];
    const client = makeCodexAppServerClient({
      transport: {
        input,
        send: (line) => {
          outgoing.push(line);
        },
      },
    });
    const response = client.request("thread/start", { cwd: "/tmp/cycle" });
    const request = parseLine(outgoing[0] ?? "");

    input.push(JSON.stringify({ id: request.id, result: { cwd: "/tmp/cycle" } }) + "\n");

    await assert.rejects(response, CodexAppServerSchemaDecodeError);
  });

  it("decodes typed model list responses", async () => {
    const input = new Pushable<string>();
    const outgoing: string[] = [];
    const client = makeCodexAppServerClient({
      transport: {
        input,
        send: (line) => {
          outgoing.push(line);
        },
      },
    });
    const response = client.request("model/list", { includeHidden: false });
    const request = parseLine(outgoing[0] ?? "");

    assert.equal(request.method, "model/list");
    assert.deepEqual(request.params, { includeHidden: false });

    input.push(
      JSON.stringify({
        id: request.id,
        result: {
          data: [
            {
              displayName: "GPT-5 Codex",
              hidden: false,
              id: "model_gpt_5_codex",
              isDefault: true,
              model: "gpt-5-codex",
            },
          ],
          nextCursor: null,
        },
      }) + "\n",
    );

    const result = await response;
    assert.deepEqual(
      result.data.map((model) => model.model),
      ["gpt-5-codex"],
    );
    assert.equal(result.nextCursor, null);
  });

  it("rejects undeclared JSON-RPC frame fields before dispatch", async () => {
    const input = new Pushable<string>();
    const errors: unknown[] = [];
    const outgoing: string[] = [];
    makeCodexAppServerProtocol({
      onError: (error) => {
        errors.push(error);
      },
      transport: {
        input,
        send: (line) => {
          outgoing.push(line);
        },
      },
    });

    input.push(
      JSON.stringify({
        debug: true,
        id: "server_req_1",
        method: "thread/start",
        params: {},
      }) + "\n",
    );

    await waitFor(() => errors.length === 1);
    assert.equal(errors[0] instanceof CodexAppServerProtocolParseError, true);
    assert.equal(
      (errors[0] as CodexAppServerProtocolParseError).detail,
      "Invalid JSON-RPC message.",
    );
    assert.equal(outgoing.length, 0);
  });

  it("dispatches typed notifications", async () => {
    const input = new Pushable<string>();
    const seen: string[] = [];
    const client = makeCodexAppServerClient({
      transport: {
        input,
        send: () => undefined,
      },
    });

    client.handleServerNotification("item/agentMessage/delta", (payload) => {
      seen.push(payload.delta);
    });
    input.push(
      JSON.stringify({
        method: "item/agentMessage/delta",
        params: {
          delta: "Hello",
          itemId: "item_message",
          threadId: "native_thread",
          turnId: "native_turn",
        },
      }) + "\n",
    );

    await waitFor(() => seen.length === 1);
    assert.deepEqual(seen, ["Hello"]);
  });
});

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 1000) throw new Error("Timed out waiting for condition.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
