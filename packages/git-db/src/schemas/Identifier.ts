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
    expected:
      "a non-empty identifier segment containing letters, numbers, dots, underscores, or hyphens",
  }),
  filter("a valid path segment", isValidPathSegment),
);
export type SafeSegment = typeof SafeSegment.Type;

export const DatabaseName = SafeSegment;
export type DatabaseName = typeof DatabaseName.Type;

export const RemoteName = SafeSegment;
export type RemoteName = typeof RemoteName.Type;
