import { strict as assert } from "node:assert";
import { Schema } from "effect";
import { describe, it } from "vitest";
import {
  HttpPageCollectionEnvelope,
  PageListQueryParams,
} from "../src/http/schemas/HttpPageResourceEnvelope.ts";

const decode = <S extends Schema.Top>(schema: S, value: unknown): S["Type"] =>
  Schema.decodeUnknownSync(schema as never)(value) as S["Type"];

describe("Page HTTP schemas", () => {
  it("accepts the three-state archived query contract", () => {
    const query = Schema.Struct(PageListQueryParams);

    assert.equal(decode(query, { archived: "include", "page[limit]": "100" }).archived, "include");
    assert.equal(decode(query, { archived: "only" }).archived, "only");
    assert.throws(() => decode(query, { archived: "true" }));
  });

  it("encodes Page summaries rather than full documents in list envelopes", () => {
    const value = decode(HttpPageCollectionEnvelope, {
      data: [
        {
          archived: false,
          createdAt: "2026-07-11T00:00:00.000Z",
          id: "018f0f9d-7b2a-7a35-9f6d-b6419e987abc",
          path: "architecture/index.md",
          repositoryId: "repo-test",
          revisionId: "revision-1",
          title: "Architecture",
          updatedAt: "2026-07-11T00:00:00.000Z",
        },
      ],
      links: { next: null, self: "/v1/repositories/repo-test/pages" },
      meta: { requestId: "request-1", totalCount: null },
      page: { hasMore: false, limit: 100, nextCursor: null },
    });

    assert.equal(value.data[0]?.title, "Architecture");
  });
});
