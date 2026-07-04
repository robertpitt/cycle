import { Schema } from "effect";

export const ExternalLink = Schema.Struct({
  source: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional source system or integration that produced the link.",
    }),
  ),
  title: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional human-readable label for the link." }),
  ),
  url: Schema.String.pipe(
    Schema.annotateKey({ description: "Absolute or caller-provided URL preserved on the ticket." }),
  ),
}).pipe(
  Schema.annotate({
    description: "A link exposed from ticket frontmatter.",
    identifier: "@cycle/contracts/ExternalLink",
    title: "ExternalLink",
  }),
);
export type ExternalLink = typeof ExternalLink.Type;
