import { Data } from "effect";

export type ElectronErrorCategory = "configuration" | "electron" | "security";

export class ElectronError extends Data.TaggedError("ElectronError")<{
  readonly category: ElectronErrorCategory;
  readonly cause?: unknown;
  readonly message: string;
  readonly operation: string;
}> {}

export const electronError = (operation: string, cause: unknown): ElectronError =>
  new ElectronError({
    category: "electron",
    cause,
    message: cause instanceof Error ? cause.message : `${operation} failed.`,
    operation,
  });

export const electronConfigurationError = (
  operation: string,
  message: string,
  cause?: unknown,
): ElectronError =>
  new ElectronError({
    category: "configuration",
    cause,
    message,
    operation,
  });

export const electronSecurityError = (
  operation: string,
  message: string,
  cause?: unknown,
): ElectronError =>
  new ElectronError({
    category: "security",
    cause,
    message,
    operation,
  });
