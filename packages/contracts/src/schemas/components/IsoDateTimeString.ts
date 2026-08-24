import { Schema } from "effect";
import { isIsoDateTimeString } from "../../internal/pageValidation.ts";

export const IsoDateTimeString = Schema.String.check(
  Schema.makeFilter<string>((value) => isIsoDateTimeString(value) || "an ISO-8601 timestamp", {
    expected: "an ISO-8601 timestamp with an explicit timezone",
  }),
).pipe(
  Schema.annotate({
    description: "An ISO-8601 timestamp with an explicit UTC or numeric timezone.",
    identifier: "@cycle/contracts/IsoDateTimeString",
    title: "IsoDateTimeString",
  }),
);
export type IsoDateTimeString = typeof IsoDateTimeString.Type;
