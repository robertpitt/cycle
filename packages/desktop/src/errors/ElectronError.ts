import { Schema } from "effect";

export const ElectronErrorCategorySchema = Schema.Literals([
  "configuration",
  "electron",
  "security",
]);
export type ElectronErrorCategory = typeof ElectronErrorCategorySchema.Type;

export class ElectronError extends Schema.TaggedErrorClass<ElectronError>(
  "@cycle/desktop/ElectronError",
)("ElectronError", {
  category: ElectronErrorCategorySchema,
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  operation: Schema.String,
}) {}
