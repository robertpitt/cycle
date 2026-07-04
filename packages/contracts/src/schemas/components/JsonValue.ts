import { Schema } from "effect";

export const JsonValue = Schema.Json.pipe(
  Schema.annotate({
    description: "Any JSON-compatible value accepted at public extension boundaries.",
    identifier: "@cycle/contracts/JsonValue",
    title: "JsonValue",
  }),
);
export type JsonValue = typeof JsonValue.Type;
