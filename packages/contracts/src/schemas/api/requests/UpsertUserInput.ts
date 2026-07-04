import { Schema } from "effect";

export const UpsertUserInput = Schema.Struct({
  aliases: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional alternate names or ids for matching mentions." }),
  ),
  avatarUrl: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional avatar image URL." }),
  ),
  disabledAt: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Optional ISO timestamp when the user was disabled, or null to re-enable.",
    }),
  ),
  displayName: Schema.String.pipe(
    Schema.annotateKey({ description: "Display name shown in Cycle clients." }),
  ),
  email: Schema.String.pipe(Schema.annotateKey({ description: "Primary email address." })),
  source: Schema.optional(Schema.Literals(["import", "local-profile", "manual"])).pipe(
    Schema.annotateKey({ description: "Source that created or last asserted the profile." }),
  ),
  timezone: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional IANA timezone id." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for creating or updating a user profile.",
    identifier: "@cycle/contracts/UpsertUserInput",
    title: "UpsertUserInput",
  }),
);
export type UpsertUserInput = typeof UpsertUserInput.Type;
