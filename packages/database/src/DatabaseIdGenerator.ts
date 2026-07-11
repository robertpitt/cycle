import { Context, Crypto, Effect, Layer } from "effect";
import { DatabaseValidationError, type DatabaseFailure } from "./DatabaseErrors.ts";

export type DatabaseIdGeneratorShape = {
  readonly commentId: Effect.Effect<string, DatabaseFailure>;
  readonly draftId: Effect.Effect<string, DatabaseFailure>;
  readonly eventId: Effect.Effect<string, DatabaseFailure>;
  readonly labelId: Effect.Effect<string, DatabaseFailure>;
  readonly pageId: Effect.Effect<string, DatabaseFailure>;
  readonly recordId: Effect.Effect<string, DatabaseFailure>;
  readonly templateId: Effect.Effect<string, DatabaseFailure>;
  readonly ticketId: Effect.Effect<string, DatabaseFailure>;
  readonly viewId: Effect.Effect<string, DatabaseFailure>;
};

export class DatabaseIdGenerator extends Context.Service<
  DatabaseIdGenerator,
  DatabaseIdGeneratorShape
>()("@cycle/database/DatabaseIdGenerator") {}

export const DatabaseIdGeneratorLive = Layer.effect(
  DatabaseIdGenerator,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const makeId = (prefix: string) =>
      crypto.randomUUIDv7.pipe(
        Effect.map((uuid) => `${prefix}_${uuid.replaceAll("-", "")}`),
        Effect.mapError(
          (error): DatabaseFailure =>
            new DatabaseValidationError({
              field: "id",
              message: "failed to generate database id",
              cause: error,
            }),
        ),
      );
    const makeTicketSeed = crypto.randomUUIDv7.pipe(
      Effect.map((uuid) =>
        BigInt(`0x${uuid.replaceAll("-", "")}`)
          .toString(36)
          .toUpperCase()
          .padStart(5, "0"),
      ),
      Effect.mapError(
        (error): DatabaseFailure =>
          new DatabaseValidationError({
            field: "id",
            message: "failed to generate database id",
            cause: error,
          }),
      ),
    );
    const makePageId = crypto.randomUUIDv7.pipe(
      Effect.mapError(
        (error): DatabaseFailure =>
          new DatabaseValidationError({
            field: "page.id",
            message: "failed to generate Page id",
            cause: error,
          }),
      ),
    );

    return DatabaseIdGenerator.of({
      commentId: makeId("cmt"),
      draftId: makeId("drf"),
      eventId: makeId("evt"),
      labelId: makeId("lbl"),
      pageId: makePageId,
      recordId: makeId("rec"),
      templateId: makeId("tpl"),
      ticketId: makeTicketSeed,
      viewId: makeId("view"),
    });
  }),
);
