import { Schema } from "effect";

export const EstimateValue = Schema.Union([Schema.Finite, Schema.String]).pipe(
  Schema.annotate({
    description: "A numeric or string estimate value preserved from ticket frontmatter.",
    identifier: "@cycle/contracts/EstimateValue",
    title: "EstimateValue",
  }),
);
export type EstimateValue = typeof EstimateValue.Type;
