import { Data } from "effect";

export type ElectronErrorCategory = "configuration" | "electron" | "security";

export class ElectronError extends Data.TaggedError("ElectronError")<{
  readonly category: ElectronErrorCategory;
  readonly cause?: unknown;
  readonly message: string;
  readonly operation: string;
}> {}
