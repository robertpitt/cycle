import { Schema } from "effect";

export const NonEmptyTrimmedString = Schema.String.check(
  Schema.makeFilter<string>((value) => value.trim().length > 0 || "a non-empty string", {
    expected: "a non-empty string",
  }),
).pipe(
  Schema.annotate({
    description: "A string containing at least one non-whitespace character.",
    identifier: "@cycle/contracts/NonEmptyTrimmedString",
    title: "NonEmptyTrimmedString",
  }),
);
export type NonEmptyTrimmedString = typeof NonEmptyTrimmedString.Type;
