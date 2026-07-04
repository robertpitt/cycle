import { Schema } from "effect";
import { PositiveInteger } from "./PositiveInteger.ts";

export const ConcurrencyLimit = Schema.NullOr(PositiveInteger).pipe(
  Schema.annotate({
    description: "A positive concurrency cap, or null when no contract-level cap is configured.",
    identifier: "@cycle/contracts/ConcurrencyLimit",
    title: "ConcurrencyLimit",
  }),
);
export type ConcurrencyLimit = typeof ConcurrencyLimit.Type;
