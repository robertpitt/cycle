import { Schema } from "effect";
import { ActorType } from "./ActorType.ts";

export class Actor extends Schema.Class<Actor>("@cycle/ticket-db/Actor")({
  email: Schema.optional(Schema.String),
  name: Schema.String,
  provider: Schema.optional(Schema.String),
  type: ActorType,
}) {}
