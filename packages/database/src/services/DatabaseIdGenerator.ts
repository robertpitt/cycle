import { Context, Crypto, Effect, Layer } from "effect";
import type { DatabaseFailure } from "../errors.ts";
import { validationError } from "../errors.ts";

export type DatabaseIdGeneratorShape = {
  readonly draftId: Effect.Effect<string, DatabaseFailure>;
  readonly recordId: Effect.Effect<string, DatabaseFailure>;
  readonly ticketId: Effect.Effect<string, DatabaseFailure>;
};

export class DatabaseIdGenerator extends Context.Service<
  DatabaseIdGenerator,
  DatabaseIdGeneratorShape
>()("@cycle/database/DatabaseIdGenerator") {}

export const makeDeterministicIdGenerator = (prefix = "test"): DatabaseIdGeneratorShape => {
  let ticket = 0;
  let draft = 0;
  let record = 0;

  const next = (kind: string, value: number): string =>
    `${kind}_${prefix}_${String(value).padStart(4, "0")}`;

  return {
    draftId: Effect.sync(() => next("drf", ++draft)),
    recordId: Effect.sync(() => next("rec", ++record)),
    ticketId: Effect.sync(() => next("iss", ++ticket)),
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
      recordId: makeId("rec"),
      ticketId: makeId("iss"),
    });
  }),
);
