import { Schema } from "effect";

export const SyncMode = Schema.Literals(["fetch", "full", "pull", "push"]);
export type SyncMode = typeof SyncMode.Type;
