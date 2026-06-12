import { Schema } from "effect";

export const PointerSyncStatus = Schema.Literals([
  "diverged",
  "fast-forwarded",
  "merged",
  "pushed",
  "rejected",
  "up-to-date",
]);
export type PointerSyncStatus = typeof PointerSyncStatus.Type;
