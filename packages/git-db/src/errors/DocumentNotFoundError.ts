import { Schema } from "effect";

export class DocumentNotFoundError extends Schema.TaggedErrorClass<DocumentNotFoundError>(
  "@cycle/git-db/DocumentNotFoundError",
)("DocumentNotFoundError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export const documentNotFound = (path: string): DocumentNotFoundError =>
  new DocumentNotFoundError({ message: `Document not found: ${path}`, path });
