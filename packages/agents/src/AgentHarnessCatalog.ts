import { Context, Effect, Layer } from "effect";
import { AgentHarnessError } from "./AgentErrors.ts";
import type { AgentHarness } from "./AgentHarness.ts";

export type AgentHarnessCatalogShape = {
  readonly get: (harnessId: string) => Effect.Effect<AgentHarness, AgentHarnessError>;
  readonly list: Effect.Effect<ReadonlyArray<AgentHarness>>;
};

export class AgentHarnessCatalog extends Context.Service<
  AgentHarnessCatalog,
  AgentHarnessCatalogShape
>()("@cycle/agents/AgentHarnessCatalog") {}

export const AgentHarnessCatalogLive = (harnesses: ReadonlyArray<AgentHarness>) => {
  const entries = new Map(harnesses.map((harness) => [harness.id, harness]));
  return Layer.succeed(
    AgentHarnessCatalog,
    AgentHarnessCatalog.of({
      get: (harnessId) => {
        const harness = entries.get(harnessId);
        return harness === undefined
          ? Effect.fail(
              new AgentHarnessError({
                code: "agent_harness_unavailable",
                harnessId,
                message: `Agent harness is not registered: ${harnessId}`,
                reason: "ExecutableMissing",
                retryable: false,
              }),
            )
          : Effect.succeed(harness);
      },
      list: Effect.succeed(harnesses),
    }),
  );
};
