import { Schema } from "effect";
import { PointerSyncResult } from "./PointerSyncResult.ts";

export const SyncResult = Schema.Struct({
  pointers: Schema.Array(PointerSyncResult),
  remote: Schema.String,
});
export type SyncResult = typeof SyncResult.Type;
