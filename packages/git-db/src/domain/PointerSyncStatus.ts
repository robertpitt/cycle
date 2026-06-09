import { Schema } from "effect";

export const PointerSyncStatus = Schema.Literals([
  "diverged",
  "fast-forwarded",
  "pushed",
  "rejected",
  "up-to-date",
]);
export type PointerSyncStatus = typeof PointerSyncStatus.Type;
