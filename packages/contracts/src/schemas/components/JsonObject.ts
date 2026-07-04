import { Schema } from "effect";
import { JsonValue } from "./JsonValue.ts";

export const JsonObject = Schema.Record(Schema.String, JsonValue).pipe(
  Schema.annotate({
    description:
      "A JSON object used for extension data, provider configuration, and structured metadata.",
    identifier: "@cycle/contracts/JsonObject",
    title: "JsonObject",
  }),
);
export type JsonObject = typeof JsonObject.Type;
