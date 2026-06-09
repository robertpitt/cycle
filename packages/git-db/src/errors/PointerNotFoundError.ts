import { Schema } from "effect";

export class PointerNotFoundError extends Schema.TaggedErrorClass<PointerNotFoundError>(
  "@cycle/git-db/PointerNotFoundError",
)("PointerNotFoundError", {
  message: Schema.String,
  pointer: Schema.String,
}) {}

export const pointerNotFound = (pointer: string): PointerNotFoundError =>
  new PointerNotFoundError({ message: `Pointer not found: ${pointer}`, pointer });
