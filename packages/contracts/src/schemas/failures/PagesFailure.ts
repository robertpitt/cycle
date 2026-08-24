import { Schema } from "effect";
import { CommentFailure } from "./CommentFailure.ts";
import { PageFailure } from "./PageFailure.ts";

export const PagesFailure = Schema.Union([PageFailure, CommentFailure]).pipe(
  Schema.annotate({
    description: "Recoverable failures for the Pages and generic comment surfaces.",
    identifier: "@cycle/contracts/PagesFailure",
    title: "PagesFailure",
  }),
);
export type PagesFailure = typeof PagesFailure.Type;
