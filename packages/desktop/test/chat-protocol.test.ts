import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { parseChatProtocolMessage } from "../src/renderer/lib/chatProtocol.ts";

describe("renderer chat protocol", () => {
  it("decodes valid WebSocket server envelopes", () => {
    const message = parseChatProtocolMessage(
      JSON.stringify({
        payload: {
          connectionId: "connection_1",
        },
        type: "connection.ready",
        version: 1,
      }),
    );

    assert.equal(message.type, "connection.ready");
    assert.equal(message.version, 1);
  });

  it("rejects invalid or undeclared WebSocket server envelope fields", () => {
    assert.throws(() =>
      parseChatProtocolMessage(
        JSON.stringify({
          payload: {},
          type: "connection.ready",
          version: 1,
          debug: true,
        }),
      ),
    );

    assert.throws(() =>
      parseChatProtocolMessage(
        JSON.stringify({
          payload: {},
          version: 1,
        }),
      ),
    );
  });
});
