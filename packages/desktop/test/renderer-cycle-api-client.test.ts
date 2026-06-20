import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { decodeRepositoryIssueCursor } from "../src/renderer/lib/cycleApiClient.ts";

describe("renderer cycle API client", () => {
  it("schema-decodes repository issue cursors", () => {
    const cursor = JSON.stringify({
      __cycleRepositoryIssueCursors: {
        repo_a: "cursor-a",
        repo_b: "",
      },
    });

    assert.deepEqual(decodeRepositoryIssueCursor(cursor), {
      repo_a: "cursor-a",
    });
  });

  it("rejects malformed repository issue cursors", () => {
    assert.equal(
      decodeRepositoryIssueCursor(
        JSON.stringify({
          __cycleRepositoryIssueCursors: {
            repo_a: 42,
          },
        }),
      ),
      undefined,
    );
    assert.equal(
      decodeRepositoryIssueCursor(
        JSON.stringify({
          __cycleRepositoryIssueCursors: {},
          debug: true,
        }),
      ),
      undefined,
    );
  });
});
