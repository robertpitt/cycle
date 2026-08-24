import { Result, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { parseCycleReference, parseCycleUri, serializeCycleUri } from "../src/CycleUri.ts";
import { PageId } from "../src/schemas/components/PageId.ts";

const pageId = Schema.decodeUnknownSync(PageId)("0198f6d4-90a2-7a2a-9f0f-04d232812d31");

describe("canonical cycle:// references", () => {
  it("round-trips repositories, tickets, and Pages with component encoding", () => {
    const targets = [
      { kind: "repository" as const, repositoryId: "repo 123" },
      { kind: "ticket" as const, repositoryId: "repo 123", ticketId: "UKN-B9NZJ" },
      { kind: "page" as const, pageId, repositoryId: "repo 123" },
    ];

    for (const target of targets) {
      const serialized = serializeCycleUri(target);
      expect(Result.isSuccess(serialized)).toBe(true);
      if (Result.isFailure(serialized)) continue;
      expect(serialized.success).toContain("repo%20123");

      const parsed = parseCycleUri(serialized.success);
      expect(Result.isSuccess(parsed)).toBe(true);
      if (Result.isSuccess(parsed)) expect(parsed.success).toEqual(target);
    }
  });

  it("distinguishes malformed input from well-formed unsupported targets", () => {
    const unsupported = parseCycleUri("cycle://repository/repo/widgets/id");
    expect(Result.isFailure(unsupported)).toBe(true);
    if (Result.isFailure(unsupported))
      expect(unsupported.failure._tag).toBe("UnsupportedCycleUriTarget");
    const wrongCase = parseCycleUri("cycle://Repository/repo");
    expect(Result.isFailure(wrongCase)).toBe(true);
    if (Result.isFailure(wrongCase))
      expect(wrongCase.failure._tag).toBe("UnsupportedCycleUriTarget");

    const malformed = [
      "https://repository/repo",
      "cycle:repository/repo",
      "cycle://user@repository/repo",
      "cycle://repository:443/repo",
      "cycle://repository/repo/",
      "cycle://repository/repo/pages/not-a-page-id",
      "cycle://repository/repo/tickets/a/extra",
      "cycle://repository/repo?query=true",
      "cycle://repository/repo#fragment",
      "cycle://repository/repo%2Fescape",
    ];
    for (const input of malformed) {
      const result = parseCycleUri(input);
      expect(Result.isFailure(result), input).toBe(true);
      if (Result.isFailure(result)) expect(result.failure._tag, input).toBe("MalformedCycleUri");
    }
  });

  it("percent-decodes identifiers exactly once", () => {
    const result = parseCycleUri("cycle://repository/repo%252Fname");
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success).toEqual({ kind: "repository", repositoryId: "repo%2Fname" });
    }
  });

  it("reads legacy references without inventing canonical forms", () => {
    const contextFree = parseCycleReference("cycle-issue:UKN-B9NZJ");
    expect(Result.isSuccess(contextFree)).toBe(true);
    if (Result.isSuccess(contextFree)) {
      expect(contextFree.success).toEqual({ kind: "issue", ticketId: "UKN-B9NZJ" });
    }

    const contextual = parseCycleReference("cycle-issue:UKN-B9NZJ", {
      repositoryId: "repo_123",
    });
    expect(Result.isSuccess(contextual)).toBe(true);
    if (Result.isSuccess(contextual)) {
      expect(contextual.success).toEqual({
        kind: "ticket",
        repositoryId: "repo_123",
        ticketId: "UKN-B9NZJ",
      });
    }

    expect(Result.isSuccess(parseCycleReference("cycle-repository:repo_123"))).toBe(true);
    const legacyRepository = parseCycleReference("cycle-repository: owner/repo ");
    expect(Result.isSuccess(legacyRepository)).toBe(true);
    if (Result.isSuccess(legacyRepository)) {
      expect(legacyRepository.success).toEqual({
        kind: "repository",
        repositoryId: "owner/repo",
      });
    }
    expect(Result.isSuccess(parseCycleReference("cycle-agent:codex"))).toBe(true);
    expect(Result.isSuccess(parseCycleReference("cycle-user:robert"))).toBe(true);
    expect(Result.isSuccess(parseCycleReference("cycle-commit:abcdef1"))).toBe(true);
  });
});
