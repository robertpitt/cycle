import { Schema } from "effect";

export const StringList = Schema.Array(Schema.String).pipe(
  Schema.annotate({
    description: "An ordered list of strings.",
    identifier: "@cycle/contracts/StringList",
    title: "StringList",
  }),
);
export type StringList = typeof StringList.Type;
