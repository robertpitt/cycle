import { Schema } from "effect";
import { OptionalCsvStringParam, OptionalSearchParam, ResourceEnvelopeOf } from "./shared.ts";

export const AutocompleteEntityType = Schema.Literals(["repository", "ticket"]);
export type AutocompleteEntityType = typeof AutocompleteEntityType.Type;

const AutocompleteLimit = Schema.FiniteFromString.check(
  Schema.makeFilter<number>(
    (value) =>
      (Number.isInteger(value) && value > 0 && value <= 100) || "an integer between 1 and 100",
    { expected: "an autocomplete limit between 1 and 100" },
  ),
);

export const AutocompleteQuery = Schema.Struct({
  "filter[type][in]": OptionalCsvStringParam(
    "Comma-separated autocomplete entity types to include. Supported values are repository and ticket.",
  ),
  "page[limit]": Schema.optional(AutocompleteLimit).annotate({
    description: "Maximum number of autocomplete results to return. Defaults to 50.",
  }),
  q: OptionalSearchParam,
});
export type AutocompleteQuery = typeof AutocompleteQuery.Type;
export const AutocompleteQueryParams = AutocompleteQuery.fields;

export const HttpAutocompleteResultOutput = Schema.Struct({
  id: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  name: Schema.String,
  repositoryId: Schema.optional(Schema.String),
  subtitle: Schema.optional(Schema.String),
  type: AutocompleteEntityType,
  uri: Schema.String,
});
export type HttpAutocompleteResultOutput = typeof HttpAutocompleteResultOutput.Type;
export const AutocompleteOutput = Schema.Struct({
  results: Schema.Array(HttpAutocompleteResultOutput),
});
export const AutocompleteResourceEnvelope = ResourceEnvelopeOf(AutocompleteOutput);
