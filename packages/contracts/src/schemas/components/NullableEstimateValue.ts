import { Schema } from "effect";
import { EstimateValue } from "./EstimateValue.ts";

export const NullableEstimateValue = Schema.NullOr(EstimateValue).pipe(
  Schema.annotate({
    description: "An estimate value that may be explicitly cleared with null.",
    identifier: "@cycle/contracts/NullableEstimateValue",
    title: "NullableEstimateValue",
  }),
);
export type NullableEstimateValue = typeof NullableEstimateValue.Type;
