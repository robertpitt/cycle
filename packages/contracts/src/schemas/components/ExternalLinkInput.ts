import { Schema } from "effect";

export const ExternalLinkInput = Schema.Struct({
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
    description: "A link supplied when creating or drafting a ticket.",
    identifier: "@cycle/contracts/ExternalLinkInput",
    title: "ExternalLinkInput",
  }),
);
export type ExternalLinkInput = typeof ExternalLinkInput.Type;
