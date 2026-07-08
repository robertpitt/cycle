import type { RepositoryStatus } from "@cycle/contracts";
import type { RepositoryOpenInput } from "@cycle/contracts/schemas";
import { Context, Effect, Layer } from "effect";
import type { UseCaseContext } from "./UseCaseDefinition.ts";
import { useCaseFailure, type UseCaseFailure } from "./UseCaseFailure.ts";

export type RepositoryOpenServiceShape = {
  readonly open: (
    input: RepositoryOpenInput,
    context: UseCaseContext<"RepositoryOpen">,
  ) => Effect.Effect<RepositoryStatus, UseCaseFailure>;
};

export class RepositoryOpenService extends Context.Service<
  RepositoryOpenService,
  RepositoryOpenServiceShape
>()("@cycle/usecases/RepositoryOpenService") {}

export const RepositoryOpenServiceUnavailableLive = Layer.succeed(
  RepositoryOpenService,
  RepositoryOpenService.of({
    open: (_input, context) =>
      Effect.fail(
        useCaseFailure({
          code: "REPOSITORY_OPEN_UNAVAILABLE",
          message: "Opening repositories requires a backend-provided repository open service.",
          requestId: context.requestId,
          tag: "RepositoryUnavailableFailure",
          useCase: context.name,
        }),
      ),
  }),
);
