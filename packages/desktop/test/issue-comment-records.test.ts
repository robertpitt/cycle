import type { Actor, LinkedRecord } from "@cycle/contracts/schemas";
import { describe, expect, it } from "vitest";
import {
  issueRecordActivityBody,
  materializeIssueCommentRecords,
} from "../src/renderer/lib/issueCommentRecords.ts";

const actor: Actor = { email: "robert@example.com", name: "Robert", type: "human" };
let recordSequence = 0;
const record = (
  id: string,
  recordType: string,
  payload: Readonly<Record<string, unknown>>,
): LinkedRecord => ({
  createdAt: `2026-08-25T10:00:${String(recordSequence++).padStart(2, "0")}.000Z`,
  createdBy: actor,
  createdDate: "2026-08-25",
  id,
  issueId: "CYC-42",
  payload,
  recordType,
  schemaVersion: 1,
});

describe("issue comment records", () => {
  it("reduces edits, archive events, reactions, and threaded replies", () => {
    const comments = materializeIssueCommentRecords(
      [
        record("comment-1", "comment", { body: "Original" }),
        record("reply-1", "comment", { body: "Reply", parentCommentId: "comment-1" }),
        record("edit-1", "comment.edit", { body: "Edited", commentId: "comment-1" }),
        record("reaction-1", "comment.reaction", {
          commentId: "comment-1",
          emoji: "👍",
          operation: "add",
        }),
        record("archive-1", "comment.archive", { commentId: "comment-1" }),
      ],
      actor,
    );

    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({
      archived: true,
      body: "Edited",
      reactions: [{ active: true, count: 1, emoji: "👍" }],
    });
    expect(comments[1]?.parentCommentId).toBe("comment-1");
  });

  it("provides a readable fallback for every record type", () => {
    expect(issueRecordActivityBody(record("x", "integration.sync-result", {}))).toBe(
      "recorded integration sync result",
    );
  });
});
