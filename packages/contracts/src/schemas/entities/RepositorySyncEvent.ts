import { Schema } from "effect";
import { JsonObject } from "../components/JsonObject.ts";

export const RepositorySyncEvent = Schema.Struct({
  completedAt: Schema.optional(Schema.String),
  details: Schema.optional(JsonObject),
  durationMs: Schema.optional(Schema.Finite),
  id: Schema.String,
  message: Schema.optional(Schema.String),
  operation: Schema.Literals(["fetch", "sync", "push", "rebuild"]),
  repositoryId: Schema.String,
  startedAt: Schema.String,
  status: Schema.Literals(["started", "completed", "failed", "skipped"]),
  strategy: Schema.optional(Schema.String),
}).pipe(
  Schema.annotate({
    description: "A repository synchronization operation recorded by the local runtime.",
    identifier: "@cycle/contracts/RepositorySyncEvent",
    title: "RepositorySyncEvent",
  }),
);
export type RepositorySyncEvent = typeof RepositorySyncEvent.Type;
