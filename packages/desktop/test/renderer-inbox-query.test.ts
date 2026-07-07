import type { InboxEntry, InboxPage, InboxQuery } from "@cycle/contracts/schemas";
import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import {
  inboxListEntriesFromPages,
  inboxListInfiniteQueryKey,
  inboxListPageQuery,
} from "../src/renderer/queries/inbox.ts";

const inboxEntry = (index: number): InboxEntry => ({
  actor: {
    email: "ada@example.com",
    name: "Ada Lovelace",
  },
  bodyExcerpt: `Excerpt ${index}`,
  createdAt: "2026-06-14T08:45:00.000Z",
  eventPath: `event-${index}`,
  itemId: `inbox-${index}`,
  reason: "mention",
  recordId: `record-${index}`,
  repositoryId: "repo_1",
  sequence: index,
  snapshotId: `snapshot-${index}`,
  sourceState: "active",
  status: "unread",
  ticketId: `CYC-${index}`,
  title: `Inbox item ${index}`,
});

const inboxPage = (entries: readonly InboxEntry[], nextCursor?: string): InboxPage => ({
  activeSnapshotIds: {},
  entries,
  ...(nextCursor === undefined ? {} : { nextCursor }),
});

describe("renderer inbox queries", () => {
  it("builds paged inbox queries without keying on stale cursors", () => {
    const query: InboxQuery = {
      cursor: "stale-cursor",
      reason: "mention",
      repositoryIds: ["repo_1"],
      status: "unread",
      userId: "ada@example.com",
    };

    assert.deepEqual(inboxListPageQuery(query, undefined), {
      limit: 100,
      reason: "mention",
      repositoryIds: ["repo_1"],
      status: "unread",
      userId: "ada@example.com",
    });
    assert.deepEqual(inboxListPageQuery(query, "next-cursor"), {
      cursor: "next-cursor",
      limit: 100,
      reason: "mention",
      repositoryIds: ["repo_1"],
      status: "unread",
      userId: "ada@example.com",
    });
    assert.deepEqual(inboxListInfiniteQueryKey(query), [
      "desktop",
      "api",
      "inbox",
      "list",
      "infinite",
      {
        reason: "mention",
        repositoryIds: ["repo_1"],
        status: "unread",
        userId: "ada@example.com",
      },
    ]);
  });

  it("flattens appended inbox pages beyond the first 100 entries", () => {
    const firstPageEntries = Array.from({ length: 100 }, (_, index) => inboxEntry(index + 1));
    const nextPageEntries = [inboxEntry(101), inboxEntry(102)];

    const entries = inboxListEntriesFromPages({
      pages: [inboxPage(firstPageEntries, "cursor-100"), inboxPage(nextPageEntries)],
    });

    assert.equal(entries.length, 102);
    assert.equal(entries.at(0)?.itemId, "inbox-1");
    assert.equal(entries.at(100)?.itemId, "inbox-101");
    assert.equal(entries.at(101)?.itemId, "inbox-102");
  });
});
