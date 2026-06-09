import { Schema } from "effect";

export const DivergenceMode = Schema.Literals(["error", "keep-local", "keep-remote"]);
export type DivergenceMode = typeof DivergenceMode.Type;
