import { Schema } from "effect";

export const IdentityInput = Schema.Struct({
  date: Schema.optional(Schema.Union([Schema.Date, Schema.String])),
  email: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
});
export type IdentityInput = typeof IdentityInput.Type;

export const Identity = Schema.Struct({
  date: Schema.String,
  email: Schema.String,
  name: Schema.String,
  timestamp: Schema.Number,
  timezone: Schema.String,
});
export type Identity = typeof Identity.Type;
