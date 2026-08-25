import { exitCodes } from "../services/CliRuntime.ts";
import { cliFailure } from "../services/errors.ts";

export const parseJsonObject = (
  value: string | undefined,
  flagName = "--data",
): Record<string, unknown> => {
  if (value === undefined) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Report the same stable usage error for invalid JSON and non-object JSON.
  }

  throw cliFailure(exitCodes.invalidUsage, "INVALID_USAGE", `${flagName} must be a JSON object.`);
};

export const parseJsonValue = (value: string, flagName: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw cliFailure(exitCodes.invalidUsage, "INVALID_USAGE", `${flagName} must be valid JSON.`);
  }
};

export const parseBoolean = (value: string | undefined, flagName: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;

  throw cliFailure(exitCodes.invalidUsage, "INVALID_USAGE", `${flagName} must be true or false.`);
};

export const parsePositiveInteger = (
  value: string | undefined,
  flagName: string,
): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;

  throw cliFailure(
    exitCodes.invalidUsage,
    "INVALID_USAGE",
    `${flagName} must be a positive integer.`,
  );
};

export const queryString = (
  values: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    params.set(key, typeof value === "string" ? value : value.join(","));
  }
  const encoded = params.toString();
  return encoded.length === 0 ? "" : `?${encoded}`;
};

export const prettyJson = (value: unknown): string => JSON.stringify(value, null, 2);
