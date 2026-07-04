import { Schema } from "effect";
import { UserProfileDocument } from "./UserProfileDocument.ts";

export const UserProfilePage = Schema.Struct({
  entries: Schema.Array(UserProfileDocument).pipe(
    Schema.annotateKey({ description: "User profiles for the current page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque cursor for the next page, when more results are available.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Paged user profile response.",
    identifier: "@cycle/contracts/UserProfilePage",
    title: "UserProfilePage",
  }),
);
export type UserProfilePage = typeof UserProfilePage.Type;
