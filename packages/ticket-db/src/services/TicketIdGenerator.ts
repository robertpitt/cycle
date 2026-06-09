import { Context, Crypto, Effect, Layer } from "effect";
import type { TicketDbFailure } from "../errors/TicketDbFailure.ts";
import { validationError } from "../errors/ValidationError.ts";
import type { DraftId } from "../schemas/DraftId.ts";
import type { IssueId } from "../schemas/IssueId.ts";
import type { RecordId } from "../schemas/RecordId.ts";

export type TicketIdGeneratorShape = {
  readonly draftId: Effect.Effect<DraftId, TicketDbFailure>;
  readonly issueId: Effect.Effect<IssueId, TicketDbFailure>;
  readonly recordId: Effect.Effect<RecordId, TicketDbFailure>;
};

export class TicketIdGenerator extends Context.Service<TicketIdGenerator, TicketIdGeneratorShape>()(
  "@cycle/ticket-db/TicketIdGenerator",
) {}

export const makeDeterministicIdGenerator = (prefix = "test"): TicketIdGeneratorShape => {
  let issue = 0;
  let draft = 0;
  let record = 0;

  const next = (kind: string, value: number): string =>
    `${kind}_${prefix}_${String(value).padStart(4, "0")}`;

  return {
    draftId: Effect.sync(() => next("drf", ++draft)),
    issueId: Effect.sync(() => next("iss", ++issue)),
    recordId: Effect.sync(() => next("rec", ++record)),
  };
};

export const TicketIdGeneratorDeterministic = (prefix?: string) =>
  Layer.succeed(TicketIdGenerator, TicketIdGenerator.of(makeDeterministicIdGenerator(prefix)));

export const TicketIdGeneratorLive = Layer.effect(
  TicketIdGenerator,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const makeId = (prefix: string) =>
      crypto.randomUUIDv7.pipe(
        Effect.map((uuid) => `${prefix}_${uuid.replaceAll("-", "")}`),
        Effect.mapError(
          (error): TicketDbFailure => validationError("id", "failed to generate ticket id", error),
        ),
      );

    return TicketIdGenerator.of({
      draftId: makeId("drf"),
      issueId: makeId("iss"),
      recordId: makeId("rec"),
    });
  }),
);
