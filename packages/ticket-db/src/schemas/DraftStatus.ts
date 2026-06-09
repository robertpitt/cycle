import { Schema } from "effect";

export const DraftStatus = Schema.Literals(["abandoned", "committed", "open", "ready"]);
export type DraftStatus = typeof DraftStatus.Type;
