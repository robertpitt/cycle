import { Schema } from "effect";

export const TicketRevisionMetadataChange = Schema.Struct({
  after: Schema.Unknown.pipe(
    Schema.annotateKey({ description: "New field value. Shape depends on the frontmatter field." }),
  ),
  before: Schema.Unknown.pipe(
    Schema.annotateKey({
      description: "Previous field value. Shape depends on the frontmatter field.",
    }),
  ),
  field: Schema.String.pipe(
    Schema.annotateKey({ description: "Frontmatter field name that changed." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Metadata field change between two ticket revisions.",
    identifier: "@cycle/contracts/TicketRevisionMetadataChange",
    title: "TicketRevisionMetadataChange",
  }),
);
export type TicketRevisionMetadataChange = typeof TicketRevisionMetadataChange.Type;
