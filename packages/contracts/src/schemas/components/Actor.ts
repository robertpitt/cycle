import { Schema } from "effect";

export const Actor = Schema.Struct({
  email: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional email address when the actor is backed by a user identity.",
    }),
  ),
  name: Schema.String.pipe(Schema.annotateKey({ description: "Display name for the actor." })),
  provider: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional provider id for imported or agent-originated actors.",
    }),
  ),
  type: Schema.Literals(["agent", "human", "import"]).pipe(
    Schema.annotateKey({
      description: "Actor category used by clients to choose presentation and attribution.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "A normalized actor shown on public documents and history records.",
    identifier: "@cycle/contracts/Actor",
    title: "Actor",
  }),
);
export type Actor = typeof Actor.Type;
