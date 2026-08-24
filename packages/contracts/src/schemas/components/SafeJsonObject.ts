import { Schema } from "effect";
import { hasUnsafeObjectKey } from "../../internal/pageValidation.ts";
import { JsonValue } from "./JsonValue.ts";

export const SafeJsonObject = Schema.Record(Schema.String, JsonValue)
  .check(
    Schema.makeFilter<Readonly<Record<string, unknown>>>(
      (value) => !hasUnsafeObjectKey(value) || "an object without unsafe keys",
      { expected: "a JSON object without __proto__, prototype, or constructor keys" },
    ),
  )
  .pipe(
    Schema.annotate({
      description: "JSON extension data with prototype-polluting keys rejected recursively.",
      identifier: "@cycle/contracts/SafeJsonObject",
      title: "SafeJsonObject",
    }),
  );
export type SafeJsonObject = typeof SafeJsonObject.Type;
