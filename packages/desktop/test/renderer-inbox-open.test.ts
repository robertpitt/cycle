import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { markReadInputForOpenedInboxEntry } from "../src/renderer/components/inboxOpen.ts";

describe("renderer inbox open behavior", () => {
  it("marks an unread inbox entry read when opened", () => {
    assert.deepEqual(
      markReadInputForOpenedInboxEntry(
        {
          itemId: "inbox-1",
          status: "unread",
        },
        "ada@example.com",
      ),
      {
        itemIds: ["inbox-1"],
        userId: "ada@example.com",
      },
    );
  });

  it("does not mark an already-read inbox entry again when opened", () => {
    assert.equal(
      markReadInputForOpenedInboxEntry(
        {
          itemId: "inbox-1",
          status: "read",
        },
        "ada@example.com",
      ),
      undefined,
    );
  });
});
