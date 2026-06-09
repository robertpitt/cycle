import { Schema } from "effect";
import { DatabaseName, ShardLength } from "./Identifier.ts";
import { BranchNamespace, PointerName } from "./Ref.ts";

export const Options = Schema.Struct({
  allowBranchNamespace: Schema.optional(Schema.Boolean),
  cwd: Schema.optional(Schema.String),
  database: Schema.optional(Schema.String),
  defaultPointer: Schema.optional(Schema.String),
  gitDir: Schema.optional(Schema.String),
  namespace: Schema.optional(Schema.String),
  shardLength: Schema.optional(Schema.Number),
  verifyGitDir: Schema.optional(Schema.Boolean),
});
export type Options = typeof Options.Type;

export class Store extends Schema.Class<Store>("@cycle/git-db/Store")({
  cwd: Schema.String,
  database: DatabaseName,
  defaultPointer: PointerName,
  gitDir: Schema.String,
  namespace: BranchNamespace,
  shardLength: ShardLength,
}) {
  get refPrefix(): string {
    return `${this.namespace}/${this.database}`;
  }
}
