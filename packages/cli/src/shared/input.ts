import { exitCodes, type CliRuntimeShape } from "../services/CliRuntime.ts";
import { cliFailure } from "../services/errors.ts";

export const bodyFromInput = async (
  runtime: CliRuntimeShape,
  bodyFlag: string | undefined,
  optional: boolean,
): Promise<string | undefined> => {
  const stdinHasBody = runtime.stdinIsTTY !== true;

  if (stdinHasBody && bodyFlag !== undefined && bodyFlag !== "-") {
    throw cliFailure(
      exitCodes.invalidUsage,
      "INVALID_USAGE",
      "Body cannot be supplied by both stdin and --body.",
    );
  }

  if (bodyFlag === "-") return runtime.readStdin();
  if (bodyFlag !== undefined) return bodyFlag;
  if (stdinHasBody) {
    const body = await runtime.readStdin();
    return optional && body.length === 0 ? undefined : body;
  }
  if (optional) return undefined;

  return undefined;
};
