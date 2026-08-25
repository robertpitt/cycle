import { Context, Layer } from "effect";

export type CycleLogFileShape = {
  readonly path: string;
};

export class CycleLogFile extends Context.Service<CycleLogFile, CycleLogFileShape>()(
  "@cycle/logging/CycleLogFile",
) {}

export const CycleLogFileLive = (path: string): Layer.Layer<CycleLogFile> =>
  Layer.succeed(CycleLogFile, CycleLogFile.of({ path }));
