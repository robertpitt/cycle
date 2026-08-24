import { Result, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ArchivePageInput,
  CommentDocument,
  CreatePageInput,
  PageDirectoryPath,
  PageDocument,
  PageFrontmatter,
  PageHierarchy,
  PageId,
  PagePath,
  PageSummary,
  SafeJsonObject,
  UpdatePageInput,
} from "../src/schemas/index.ts";

const pageId = "0198f6d4-90a2-7a2a-9f0f-04d232812d31";
const otherPageId = "0198f6d4-90a2-7a2a-8f0f-04d232812d32";
const actor = { name: "Robert", type: "human" as const };

const frontmatter = () => ({
  createdAt: "2026-07-11T10:00:00.000Z",
  createdBy: actor,
  id: pageId,
  schemaVersion: 1 as const,
  title: "Payments",
  updatedAt: "2026-07-11T10:00:00.000Z",
  updatedBy: actor,
});

const decode = <S extends Schema.Decoder<unknown, never>>(schema: S, value: unknown) =>
  Schema.decodeUnknownResult(schema, { onExcessProperty: "error" })(value);

describe("Pages contract schemas", () => {
  it("validates UUIDv7 Page ids", () => {
    expect(Result.isSuccess(decode(PageId, pageId))).toBe(true);
    expect(Result.isFailure(decode(PageId, "0198f6d4-90a2-4a2a-9f0f-04d232812d31"))).toBe(true);
    expect(Result.isFailure(decode(PageId, "not-a-uuid"))).toBe(true);
  });

  it("normalizes Page paths to NFC before validating without changing case", () => {
    const normalized = decode(PagePath, "Payments/cafe\u0301.md");
    expect(Result.isSuccess(normalized)).toBe(true);
    if (Result.isSuccess(normalized)) expect(normalized.success).toBe("Payments/café.md");

    const invalid = [
      "",
      "/index.md",
      "payments/",
      "payments//index.md",
      "payments/../index.md",
      "payments\\index.md",
      "payments/index.MD",
      `payments/${"x".repeat(257)}.md`,
      "payments/\u0000.md",
    ];
    for (const path of invalid) expect(Result.isFailure(decode(PagePath, path))).toBe(true);
  });

  it("uses a separate root-capable derived directory grammar", () => {
    expect(Result.isSuccess(decode(PageDirectoryPath, ""))).toBe(true);
    expect(Result.isSuccess(decode(PageDirectoryPath, "payments/providers"))).toBe(true);
    expect(Result.isFailure(decode(PageDirectoryPath, "payments/"))).toBe(true);
    expect(Result.isFailure(decode(PageDirectoryPath, "../payments"))).toBe(true);
  });

  it("rejects half-archived frontmatter and unsafe extension keys", () => {
    expect(
      Result.isFailure(
        decode(PageFrontmatter, {
          ...frontmatter(),
          archivedAt: "2026-07-11T11:00:00.000Z",
        }),
      ),
    ).toBe(true);

    const unsafe = JSON.parse('{"nested":{"constructor":"pollute"}}') as unknown;
    expect(Result.isFailure(decode(SafeJsonObject, unsafe))).toBe(true);
    expect(Result.isFailure(decode(PageFrontmatter, { ...frontmatter(), extension: unsafe }))).toBe(
      true,
    );
    expect(
      Result.isFailure(
        decode(PageFrontmatter, {
          ...frontmatter(),
          createdAt: "2026-02-30T10:00:00.000Z",
        }),
      ),
    ).toBe(true);

    expect(
      Result.isSuccess(
        decode(PageFrontmatter, {
          ...frontmatter(),
          archivedAt: "2026-07-11T11:00:00.000Z",
          archivedBy: actor,
          owner: { team: "payments" },
        }),
      ),
    ).toBe(true);
  });

  it("enforces Page document identity and comment repository invariants", () => {
    const document = {
      body: "# Payments",
      bodyFormat: "markdown" as const,
      frontmatter: frontmatter(),
      id: pageId,
      path: "payments/index.md",
      repositoryId: "repo_123",
      revisionId: "snapshot-1",
    };
    expect(Result.isSuccess(decode(PageDocument, document))).toBe(true);
    expect(Result.isFailure(decode(PageDocument, { ...document, id: otherPageId }))).toBe(true);

    const comment = {
      body: "Looks good.",
      bodyFormat: "markdown" as const,
      createdAt: "2026-07-11T12:00:00.000Z",
      createdBy: actor,
      id: "comment-1",
      repositoryId: "repo_123",
      schemaVersion: 1 as const,
      target: { repositoryId: "repo_other", resourceId: pageId, resourceKind: "page" as const },
    };
    expect(Result.isFailure(decode(CommentDocument, comment))).toBe(true);
  });

  it("keeps mutation inputs strict and requires an actual Page replacement", () => {
    const base = { expectedRevisionId: "snapshot-1", pageId };
    expect(Result.isFailure(decode(UpdatePageInput, base))).toBe(true);
    expect(Result.isSuccess(decode(UpdatePageInput, { ...base, body: "" }))).toBe(true);
    expect(Result.isFailure(decode(UpdatePageInput, { ...base, title: "   " }))).toBe(true);
    expect(
      Result.isFailure(
        decode(UpdatePageInput, {
          ...base,
          frontmatterExtensionPatch: { title: "not an extension" },
        }),
      ),
    ).toBe(true);

    expect(
      Result.isFailure(
        decode(CreatePageInput, {
          body: "",
          extra: true,
          path: "index.md",
          title: "Home",
        }),
      ),
    ).toBe(true);
    expect(
      Result.isSuccess(
        decode(ArchivePageInput, {
          expectedRevisionId: "snapshot-1",
          humanApproved: false,
          pageId,
        }),
      ),
    ).toBe(true);
  });

  it("decodes recursive derived hierarchy nodes", () => {
    const summary = Schema.decodeUnknownSync(PageSummary)({
      archived: false,
      createdAt: "2026-07-11T10:00:00.000Z",
      id: pageId,
      path: "payments/index.md",
      repositoryId: "repo_123",
      revisionId: "snapshot-1",
      title: "Payments",
      updatedAt: "2026-07-11T10:00:00.000Z",
    });
    const hierarchy = {
      root: {
        directories: [
          {
            cover: summary,
            directories: [],
            name: "payments",
            pages: [],
            path: "payments",
          },
        ],
        name: "",
        pages: [],
        path: "",
      },
    };
    expect(Result.isSuccess(decode(PageHierarchy, hierarchy))).toBe(true);
  });
});
