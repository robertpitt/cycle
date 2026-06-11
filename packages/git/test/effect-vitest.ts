import { Effect } from "effect";
import { describe, it as vitestIt, type TestContext, type TestOptions } from "vitest";

type EffectTestFunction = (context: TestContext) => Effect.Effect<unknown, unknown, never>;

type EffectTest = {
  (name: string, fn: EffectTestFunction, options?: number | TestOptions): void;
  readonly only: (name: string, fn: EffectTestFunction, options?: number | TestOptions) => void;
  readonly skip: (name: string, fn: EffectTestFunction, options?: number | TestOptions) => void;
};

type VitestCallable = (
  name: string,
  fn: (context: TestContext) => Promise<unknown>,
  options?: number | TestOptions,
) => void;

const makeEffectTest = (test: unknown): EffectTest =>
  ((name: string, fn: EffectTestFunction, options?: number | TestOptions): void => {
    (test as VitestCallable)(name, (context) => Effect.runPromise(fn(context)), options);
  }) as EffectTest;

const effect = makeEffectTest(vitestIt);

Object.defineProperties(effect, {
  only: {
    value: makeEffectTest(vitestIt.only),
  },
  skip: {
    value: makeEffectTest(vitestIt.skip),
  },
});

export { describe };
export const it = Object.assign(vitestIt, {
  effect,
}) as typeof vitestIt & {
  readonly effect: EffectTest;
};
