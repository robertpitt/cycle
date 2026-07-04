import { Schema } from "effect";
import { StringList } from "../components/StringList.ts";
import { UnknownRecord } from "../components/UnknownRecord.ts";

export const UserProfileDocument = Schema.StructWithRest(
  Schema.Struct({
    aliases: Schema.optional(StringList).pipe(
      Schema.annotateKey({ description: "Alternate names or ids that can resolve to this user." }),
    ),
    avatarUrl: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({ description: "Optional avatar image URL." }),
    ),
    createdAt: Schema.String.pipe(
      Schema.annotateKey({ description: "ISO timestamp when the profile was created." }),
    ),
    disabledAt: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({ description: "ISO timestamp when the user was disabled." }),
    ),
    displayName: Schema.String.pipe(
      Schema.annotateKey({ description: "Display name shown in Cycle clients." }),
    ),
    email: Schema.String.pipe(Schema.annotateKey({ description: "Primary email address." })),
    id: Schema.String.pipe(Schema.annotateKey({ description: "Stable user id." })),
    schemaVersion: Schema.Literal(1).pipe(
      Schema.annotateKey({ description: "Schema version for the profile document." }),
    ),
    source: Schema.Literals(["import", "local-profile", "manual"]).pipe(
      Schema.annotateKey({ description: "Source that created or last asserted the profile." }),
    ),
    timezone: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({ description: "Optional IANA timezone id." }),
    ),
    updatedAt: Schema.String.pipe(
      Schema.annotateKey({ description: "ISO timestamp when the profile last changed." }),
    ),
  }),
  [UnknownRecord],
).pipe(
  Schema.annotate({
    description: "Public user profile document.",
    identifier: "@cycle/contracts/UserProfileDocument",
    title: "UserProfileDocument",
  }),
);
export type UserProfileDocument = typeof UserProfileDocument.Type;
