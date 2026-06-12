import { Schema } from "effect";

export const PointerSyncStatus = Schema.Literals([
  "diverged",
  "fast-forwarded",
  "merged",
  "pushed",
  "rejected",
  "remote-deleted",
  "up-to-date",
]);
export type PointerSyncStatus = typeof PointerSyncStatus.Type;
