import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { parseRuntimeBaseUrlFromDiscoveryText } from "../src/main/DesktopApiRuntimeDiscovery.ts";

describe("desktop API runtime discovery", () => {
  it("schema-decodes runtime discovery files and normalizes base URLs", () => {
    assert.equal(
      parseRuntimeBaseUrlFromDiscoveryText(
        JSON.stringify({
          baseUrl: "http://127.0.0.1:4738/",
          mcpPath: "/mcp",
        }),
      ),
      "http://127.0.0.1:4738",
    );
  });

  it("rejects malformed runtime discovery files", () => {
    assert.throws(() =>
      parseRuntimeBaseUrlFromDiscoveryText(
        JSON.stringify({
          baseUrl: 4738,
        }),
      ),
    );
    assert.throws(() => parseRuntimeBaseUrlFromDiscoveryText("{ nope"));
  });
});
