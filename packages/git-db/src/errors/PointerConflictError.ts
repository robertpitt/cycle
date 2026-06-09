import { Schema } from "effect";

export class PointerConflictError extends Schema.TaggedErrorClass<PointerConflictError>(
  "@cycle/git-db/PointerConflictError",
)("PointerConflictError", {
  actual: Schema.NullOr(Schema.String),
  cause: Schema.optional(Schema.Defect()),
  expected: Schema.NullOr(Schema.String),
  message: Schema.String,
  pointer: Schema.String,
}) {}

export const pointerConflict = (
  pointer: string,
  expected: string | null,
  actual: string | null,
  cause?: unknown,
): PointerConflictError =>
  new PointerConflictError({
    actual,
    cause,
    expected,
    message: `Pointer conflict for ${pointer}: expected ${expected ?? "<missing>"}, actual ${
      actual ?? "<missing>"
    }`,
    pointer,
  });
