import { type CliApiError, isCliApiError } from "../client.ts";
import { exitCodes } from "./CliRuntime.ts";

export type CliFailure = {
  readonly _tag: "CliFailure";
  readonly code: string;
  readonly details?: unknown;
  readonly exitCode: number;
  readonly message: string;
  readonly requestId?: string;
};

export const cliFailure = (
  exitCode: number,
  code: string,
  message: string,
  details?: unknown,
): CliFailure => ({
  _tag: "CliFailure",
  code,
  ...(details === undefined ? {} : { details }),
  exitCode,
  message,
});

export const normalizeFailure = (error: unknown): CliFailure => {
  if (isCliFailure(error)) return error;

  if (isCliApiError(error)) {
    return {
      _tag: "CliFailure",
      code: error.code,
      details: error.details,
      exitCode: exitCodeForApiError(error.status, error.code),
      message: error.message,
      requestId: error.requestId,
    };
  }

  if (isDiscoveryError(error)) {
    return cliFailure(exitCodes.apiUnavailable, error.code, error.message);
  }

  if (isCliParseError(error)) {
    return cliFailure(exitCodes.invalidUsage, "INVALID_USAGE", String(error));
  }

  return cliFailure(exitCodes.unexpected, "UNEXPECTED_FAILURE", "Cycle CLI failed unexpectedly.");
};

const exitCodeForApiError = (status: number, code: string): number => {
  if (status === 0 || status === 503 || status === 504) return exitCodes.apiUnavailable;
  if (status === 401 || code === "UNAUTHORIZED") return exitCodes.apiAuth;
  if (status === 404) return exitCodes.notFound;
  if (status === 409) return exitCodes.conflict;
  if (status === 400 || status === 422) return exitCodes.validation;

  return exitCodes.unexpected;
};

const isCliFailure = (value: unknown): value is CliFailure =>
  typeof value === "object" && value !== null && "_tag" in value && value._tag === "CliFailure";

const isDiscoveryError = (
  value: unknown,
): value is {
  readonly _tag: "CliDiscoveryError";
  readonly code: string;
  readonly message: string;
} =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  value._tag === "CliDiscoveryError";

const isCliParseError = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "_tag" in value;

export type { CliApiError };
