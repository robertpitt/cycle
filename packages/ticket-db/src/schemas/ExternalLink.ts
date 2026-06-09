import { Schema } from "effect";

export class ExternalLink extends Schema.Class<ExternalLink>("@cycle/ticket-db/ExternalLink")({
  source: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  url: Schema.String,
}) {}
