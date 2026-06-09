import { Schema } from "effect";
import { PointerSyncStatus } from "./PointerSyncStatus.ts";

export const PointerSyncResult = Schema.Struct({
  localAfter: Schema.optional(Schema.String),
  localBefore: Schema.optional(Schema.String),
  pointer: Schema.String,
  remoteAfter: Schema.optional(Schema.String),
  remoteBefore: Schema.optional(Schema.String),
  status: PointerSyncStatus,
});
export type PointerSyncResult = typeof PointerSyncResult.Type;
