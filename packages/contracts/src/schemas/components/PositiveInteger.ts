import { Schema } from "effect";

export const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).pipe(
  Schema.annotate({
    description: "An integer greater than or equal to one.",
    identifier: "@cycle/contracts/PositiveInteger",
    title: "PositiveInteger",
  }),
);
export type PositiveInteger = typeof PositiveInteger.Type;
