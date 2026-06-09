import { Schema } from "effect";

export const safeSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const filter = (expected: string, predicate: (value: string) => boolean) =>
  Schema.makeFilter<string>((value) => predicate(value) || expected, { expected });

export const isValidPathSegment = (segment: string): boolean =>
  segment.length > 0 &&
  segment !== "." &&
  segment !== ".." &&
  !segment.endsWith(".lock") &&
  !segment.includes("/");

export const isSafeSegment = (value: string): boolean =>
  safeSegmentPattern.test(value) && isValidPathSegment(value);

export const SafeSegment = Schema.String.check(
  Schema.isPattern(safeSegmentPattern, {
    expected: "a non-empty identifier segment containing letters, numbers, dots, underscores, or hyphens",
  }),
  filter("a valid path segment", isValidPathSegment),
);
export type SafeSegment = typeof SafeSegment.Type;

export const DatabaseName = SafeSegment;
export type DatabaseName = typeof DatabaseName.Type;

export const CollectionName = SafeSegment.check(
  filter("a collection name that does not start with .", (value) => !value.startsWith(".")),
);
export type CollectionName = typeof CollectionName.Type;

export const DocumentId = SafeSegment;
export type DocumentId = typeof DocumentId.Type;

export const IndexKey = SafeSegment;
export type IndexKey = typeof IndexKey.Type;

export const IndexName = SafeSegment;
export type IndexName = typeof IndexName.Type;

export const RemoteName = SafeSegment;
export type RemoteName = typeof RemoteName.Type;

export const ShardLength = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export type ShardLength = typeof ShardLength.Type;
