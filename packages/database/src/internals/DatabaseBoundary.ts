import { Clock, Effect } from "effect";
import type { DatabaseIdGeneratorShape } from "../DatabaseIdGenerator.ts";
import type { Actor } from "../domain/index.ts";
import {
  DatabaseSqliteError,
  DatabaseStorageError,
  type DatabaseFailure,
} from "../DatabaseErrors.ts";

export const DEFAULT_POINTER = "main";
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const isRemotePushRejection = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;

  const record = error as {
    readonly _tag?: unknown;
    readonly message?: unknown;
    readonly stderr?: unknown;
  };

  if (record._tag !== "RemotePushError" && record._tag !== "GitRemoteError") return false;

  const text = `${String(record.message ?? "")}\n${String(record.stderr ?? "")}`;

  return /fetch first|non-fast-forward|remote contains work|stale info|updates were rejected/iu.test(
    text,
  );
};
export const gitIdentity = (actor: Actor) => ({
  email: actor.email ?? "",
  name: actor.name,
});

export const nowIso = (): Effect.Effect<string> =>
  Clock.currentTimeMillis.pipe(Effect.map((millis) => new Date(millis).toISOString()));

export const elapsedMs = (startedAt: number, endedAt: number): number =>
  Number((endedAt - startedAt).toFixed(2));

export const nextEventId = (
  ids: DatabaseIdGeneratorShape,
): Effect.Effect<string, DatabaseFailure> => {
  const maybeIds = ids as Partial<DatabaseIdGeneratorShape>;

  return maybeIds.eventId ?? ids.recordId;
};

export const storage = <A, E>(
  operation: string,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, DatabaseFailure> =>
  effect.pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseStorageError({
          operation: operation,
          cause: cause,
          message: `GitDB operation failed: ${operation}`,
        }),
    ),
  );

export const sqlite = <A>(operation: string, f: () => A): Effect.Effect<A, DatabaseFailure> =>
  Effect.try({
    catch: (cause) =>
      new DatabaseSqliteError({
        operation: operation,
        cause: cause,
        message: `SQLite operation failed: ${operation}`,
      }),
    try: f,
  });
