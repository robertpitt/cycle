import { Schema } from "effect";
import { BranchNamespace, PointerName } from "@cycle/git/schemas";
import { DatabaseName } from "./Identifier.ts";

export const Options = Schema.Struct({
  allowBranchNamespace: Schema.optional(Schema.Boolean),
  cwd: Schema.optional(Schema.String),
  database: Schema.optional(Schema.String),
  defaultPointer: Schema.optional(Schema.String),
  gitDir: Schema.optional(Schema.String),
  namespace: Schema.optional(Schema.String),
  verifyGitDir: Schema.optional(Schema.Boolean),
});
export type Options = typeof Options.Type;

export class Store extends Schema.Class<Store>("@cycle/git-db/Store")({
  cwd: Schema.String,
  database: DatabaseName,
  defaultPointer: PointerName,
  gitDir: Schema.String,
  namespace: BranchNamespace,
}) {
  get refPrefix(): string {
    return `${this.namespace}/${this.database}`;
  }
}
