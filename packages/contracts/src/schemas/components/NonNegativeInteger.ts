import { Schema } from "effect";

export const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.annotate({
    description: "An integer greater than or equal to zero.",
    identifier: "@cycle/contracts/NonNegativeInteger",
    title: "NonNegativeInteger",
  }),
);
export type NonNegativeInteger = typeof NonNegativeInteger.Type;
