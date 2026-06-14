import { Schema } from "effect";

export const DivergenceMode = Schema.Literals([
  "error",
  "keep-local",
  "keep-remote",
  "merge",
  "rebase",
]);
export type DivergenceMode = typeof DivergenceMode.Type;
