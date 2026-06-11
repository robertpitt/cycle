import { Schema } from "effect";
import { ObjectId, PointerName } from "@cycle/git/schemas";
import { PointerSyncStatus } from "../domain/PointerSyncStatus.ts";
import { RemoteName } from "./Identifier.ts";

export const PointerSyncResult = Schema.Struct({
  localAfter: Schema.optional(ObjectId),
  localBefore: Schema.optional(ObjectId),
  pointer: PointerName,
  remoteAfter: Schema.optional(ObjectId),
  remoteBefore: Schema.optional(ObjectId),
  status: PointerSyncStatus,
});
export type PointerSyncResult = typeof PointerSyncResult.Type;

export const SyncResult = Schema.Struct({
  pointers: Schema.Array(PointerSyncResult),
  remote: RemoteName,
});
export type SyncResult = typeof SyncResult.Type;
