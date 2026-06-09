import { Schema } from "effect";

export class SyncConflictError extends Schema.TaggedErrorClass<SyncConflictError>(
  "@cycle/git-db/SyncConflictError",
)("SyncConflictError", {
  localSnapshot: Schema.String,
  mergeBase: Schema.optional(Schema.String),
  message: Schema.String,
  pointer: Schema.String,
  remoteSnapshot: Schema.String,
}) {}

export const syncConflict = (
  pointer: string,
  localSnapshot: string,
  remoteSnapshot: string,
  mergeBase?: string,
): SyncConflictError =>
  new SyncConflictError({
    localSnapshot,
    mergeBase,
    message: `Sync conflict for ${pointer}: local ${localSnapshot}, remote ${remoteSnapshot}`,
    pointer,
    remoteSnapshot,
  });
