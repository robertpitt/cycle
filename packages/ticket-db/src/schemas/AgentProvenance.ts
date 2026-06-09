import { Schema } from "effect";

export class AgentProvenance extends Schema.Class<AgentProvenance>(
  "@cycle/ticket-db/AgentProvenance",
)({
  assumptions: Schema.optional(Schema.Array(Schema.String)),
  model: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.String),
  sourceSummary: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
}) {}
