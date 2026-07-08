import { GitStoresTestLive } from "@cycle/git-store/testing";
import { Effect, Layer } from "effect";
import type { Actor } from "../domain/index.ts";
import {
  DatabaseIdGenerator,
  type DatabaseIdGeneratorShape,
} from "../services/DatabaseIdGenerator.ts";
import { DatabaseIdentity } from "../services/DatabaseIdentity.ts";
import { DatabaseLiveWithOptions } from "../services/DatabaseService.ts";

export const DatabaseIdentityTest = (
  actor: Actor = {
    email: "test@example.invalid",
    name: "Test User",
    type: "human",
  },
) =>
  Layer.succeed(
    DatabaseIdentity,
    DatabaseIdentity.of({
      currentActor: Effect.succeed(actor),
    }),
  );

export const makeDeterministicIdGenerator = (prefix = "test"): DatabaseIdGeneratorShape => {
  let ticket = 0;
  let draft = 0;
  let event = 0;
  let label = 0;
  let record = 0;
  let template = 0;
  let view = 0;

  const next = (kind: string, value: number): string =>
    `${kind}_${prefix}_${String(value).padStart(4, "0")}`;
  const nextBase36 = (value: number): string => {
    const base = value.toString(36).toUpperCase().padStart(5, "0");
    const expansion = (value % 36).toString(36).toUpperCase();

    return `${base}${expansion}`;
  };

  return {
    draftId: Effect.sync(() => next("drf", ++draft)),
    eventId: Effect.sync(() => next("evt", ++event)),
    labelId: Effect.sync(() => next("lbl", ++label)),
    recordId: Effect.sync(() => next("rec", ++record)),
    templateId: Effect.sync(() => next("tpl", ++template)),
    ticketId: Effect.sync(() => nextBase36(++ticket)),
    viewId: Effect.sync(() => next("view", ++view)),
  };
};

export const DatabaseIdGeneratorDeterministic = (prefix?: string) =>
  Layer.succeed(DatabaseIdGenerator, DatabaseIdGenerator.of(makeDeterministicIdGenerator(prefix)));

export const DatabaseTest = (prefix?: string) =>
  Layer.mergeAll(
    DatabaseLiveWithOptions({ projectionPath: ":memory:" }).pipe(
      Layer.provide(
        Layer.mergeAll(DatabaseIdentityTest(), DatabaseIdGeneratorDeterministic(prefix)),
      ),
    ),
    GitStoresTestLive,
  );
