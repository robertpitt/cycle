import { Schema } from "effect";

export const EmptyInput = Schema.Struct({}).pipe(
  Schema.annotate({
    description: "An explicit empty input object for usecases that do not accept a payload.",
    identifier: "@cycle/contracts/EmptyInput",
    title: "EmptyInput",
  }),
);
export type EmptyInput = typeof EmptyInput.Type;
