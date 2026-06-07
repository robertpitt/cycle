import { Effect } from "effect";

import { createCycleMessage, type CycleMessage } from "./message.ts";

const program = Effect.gen(function* () {
  const message = createCycleMessage();

  yield* Effect.log(message.text);

  return message;
});

export const runCycle = (): Promise<CycleMessage> => Effect.runPromise(program);
