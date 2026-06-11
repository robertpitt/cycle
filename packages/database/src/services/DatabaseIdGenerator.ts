import { Context, Crypto, Effect, Layer } from "effect";
import type { DatabaseFailure } from "../errors.ts";
import { validationError } from "../errors.ts";

export type DatabaseIdGeneratorShape = {
  readonly draftId: Effect.Effect<string, DatabaseFailure>;
  readonly labelId: Effect.Effect<string, DatabaseFailure>;
  readonly recordId: Effect.Effect<string, DatabaseFailure>;
  readonly templateId: Effect.Effect<string, DatabaseFailure>;
  readonly ticketId: Effect.Effect<string, DatabaseFailure>;
  readonly viewId: Effect.Effect<string, DatabaseFailure>;
};

export class DatabaseIdGenerator extends Context.Service<
  DatabaseIdGenerator,
  DatabaseIdGeneratorShape
>()("@cycle/database/DatabaseIdGenerator") {}

export const makeDeterministicIdGenerator = (prefix = "test"): DatabaseIdGeneratorShape => {
  let ticket = 0;
  let draft = 0;
  let label = 0;
  let record = 0;
  let template = 0;
  let view = 0;

  const next = (kind: string, value: number): string =>
    `${kind}_${prefix}_${String(value).padStart(4, "0")}`;

  return {
    draftId: Effect.sync(() => next("drf", ++draft)),
    labelId: Effect.sync(() => next("lbl", ++label)),
    recordId: Effect.sync(() => next("rec", ++record)),
    templateId: Effect.sync(() => next("tpl", ++template)),
    ticketId: Effect.sync(() => next("iss", ++ticket)),
    viewId: Effect.sync(() => next("view", ++view)),
  };
};

export const DatabaseIdGeneratorDeterministic = (prefix?: string) =>
  Layer.succeed(DatabaseIdGenerator, DatabaseIdGenerator.of(makeDeterministicIdGenerator(prefix)));

export const DatabaseIdGeneratorLive = Layer.effect(
  DatabaseIdGenerator,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const makeId = (prefix: string) =>
      crypto.randomUUIDv7.pipe(
        Effect.map((uuid) => `${prefix}_${uuid.replaceAll("-", "")}`),
        Effect.mapError(
          (error): DatabaseFailure =>
            validationError("id", "failed to generate database id", error),
        ),
      );

    return DatabaseIdGenerator.of({
      draftId: makeId("drf"),
      labelId: makeId("lbl"),
      recordId: makeId("rec"),
      templateId: makeId("tpl"),
      ticketId: makeId("iss"),
      viewId: makeId("view"),
    });
  }),
);
