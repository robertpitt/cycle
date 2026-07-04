import { Schema } from "effect";
import { PositiveInteger } from "../../components/PositiveInteger.ts";

export const UserProfileQuery = Schema.Struct({
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque pagination cursor returned by a previous user response.",
    }),
  ),
  disabled: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Optional disabled-state filter." }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of users to return." }),
  ),
  text: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional text search over user profile fields." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Filters and pagination options for user profiles.",
    identifier: "@cycle/contracts/UserProfileQuery",
    title: "UserProfileQuery",
  }),
);
export type UserProfileQuery = typeof UserProfileQuery.Type;
