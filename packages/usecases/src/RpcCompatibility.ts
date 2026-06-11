import { Effect, Schema } from "effect";
import {
  contractFor,
  makeUseCase,
  useCaseNameForAlias,
  type CycleUseCase,
  type UseCaseMeta,
} from "./contracts/index.ts";
import {
  invalidInputFailure,
  unsupportedAliasFailure,
  type UseCaseFailure,
} from "./UseCaseFailure.ts";

export const useCaseFromAlias = (
  alias: string,
  payload: unknown,
  meta: UseCaseMeta = {},
): Effect.Effect<CycleUseCase, UseCaseFailure> => {
  const name = useCaseNameForAlias(alias);
  const requestId = meta.requestId ?? "unknown";

  if (name === null) return Effect.fail(unsupportedAliasFailure(alias, requestId));

  const contract = contractFor(name);

  return Schema.decodeUnknownEffect(contract.inputSchema)(payload).pipe(
    Effect.mapError((error) =>
      invalidInputFailure({
        details: {
          alias,
          parseError: String(error),
        },
        message: `Invalid payload for ${alias}.`,
        requestId,
        useCase: name,
      }),
    ),
    Effect.map(
      (input) =>
        makeUseCase(name, input as never, {
          ...meta,
          requestId,
        }) as CycleUseCase,
    ),
  ) as Effect.Effect<CycleUseCase, UseCaseFailure>;
};
