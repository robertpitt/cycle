import { Schema } from "effect";
import { PageDocumentInvalid } from "./PageDocumentInvalid.ts";
import { PageInvalidState } from "./PageInvalidState.ts";
import { PageNotFound } from "./PageNotFound.ts";
import { PagePathConflict } from "./PagePathConflict.ts";
import { PagePathInvalid } from "./PagePathInvalid.ts";
import { PageRevisionConflict } from "./PageRevisionConflict.ts";
import { PageRevisionNotFound } from "./PageRevisionNotFound.ts";

export const PageFailure = Schema.Union([
  PageNotFound,
  PagePathInvalid,
  PagePathConflict,
  PageRevisionNotFound,
  PageRevisionConflict,
  PageInvalidState,
  PageDocumentInvalid,
]).pipe(
  Schema.annotate({
    description: "Recoverable Page contract failures.",
    identifier: "@cycle/contracts/PageFailure",
    title: "PageFailure",
  }),
);
export type PageFailure = typeof PageFailure.Type;
