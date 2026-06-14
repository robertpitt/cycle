import { Effect } from "effect";
import type { Change, Snapshot } from "../domain/index.ts";
import { invalidJsonDocument, invalidPath, type GitDbError } from "../errors/index.ts";
import { bytesFromString } from "../internals/bytes.ts";
import { normalizeStorePath } from "./Path.ts";
import type { Document } from "./Document.ts";
import type { StoreServiceShape, Transaction } from "./Store.ts";

export const EVENT_ROOT = "collections/events";

export type EventPayload = Readonly<Record<string, unknown>>;

export type EventPathInput = {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly eventId: string;
};

export type EventDocument<TPayload = unknown> = {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly document: Document;
  readonly eventId: string;
  readonly path: string;
  readonly payload: TPayload;
};

export type EventChange = {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly change: Change;
  readonly eventId: string;
  readonly path: string;
};

const safeEventSegment = /^[A-Za-z0-9_][A-Za-z0-9._@+-]*$/u;
const shardedAggregateTypes = new Set(["ticket"]);

export const aggregatePath = (
  input: Pick<EventPathInput, "aggregateId" | "aggregateType">,
): string => {
  if (!shardedAggregateTypes.has(input.aggregateType)) {
    return `${EVENT_ROOT}/${input.aggregateType}/${input.aggregateId}`;
  }

  return `${EVENT_ROOT}/${input.aggregateType}/${aggregateShard(input.aggregateId)}/${
    input.aggregateId
  }`;
};

export const canonicalJson = (value: unknown): Effect.Effect<string, GitDbError> =>
  Effect.try({
    catch: (cause) =>
      invalidJsonDocument(cause instanceof Error ? cause.message : "Cannot encode event JSON", {
        cause,
      }),
    try: () => JSON.stringify(normalizeJson(value)),
  });

export const canonicalJsonBytes = (value: unknown): Effect.Effect<Uint8Array, GitDbError> =>
  canonicalJson(value).pipe(Effect.map(bytesFromString));

export const path = (input: EventPathInput): Effect.Effect<string, GitDbError> =>
  Effect.gen(function* () {
    const aggregateType = yield* validateEventSegment("aggregate type", input.aggregateType);
    const aggregateId = yield* validateEventSegment("aggregate id", input.aggregateId);
    const eventId = yield* validateEventSegment("event id", input.eventId);

    return `${aggregatePath({ aggregateId, aggregateType })}/${eventId}.json`;
  });

export const append = (
  tx: Transaction,
  input: EventPathInput & {
    readonly payload: EventPayload;
  },
): Effect.Effect<string, GitDbError> =>
  Effect.gen(function* () {
    const eventPath = yield* path(input);
    const existing = yield* tx.get(eventPath);

    if (existing !== null) {
      return yield* Effect.fail(invalidPath(eventPath, "event path already exists"));
    }

    yield* tx.put(eventPath, yield* canonicalJsonBytes(input.payload));
    return eventPath;
  });

export const list = <TPayload = unknown>(
  store: StoreServiceShape,
  options: {
    readonly from?: string;
    readonly root?: string;
  } = {},
): Effect.Effect<ReadonlyArray<EventDocument<TPayload>>, GitDbError> =>
  Effect.gen(function* () {
    const root = yield* normalizeStorePath(options.root ?? EVENT_ROOT);
    const documents: Array<EventDocument<TPayload>> = [];

    const visit = (visitPath: string): Effect.Effect<void, GitDbError> =>
      Effect.gen(function* () {
        const entries = yield* store.list(visitPath, { from: options.from });

        for (const entry of entries) {
          if (entry.type === "tree") {
            yield* visit(entry.path);
            continue;
          }

          const parsed = parseEventPath(entry.path, root);

          if (parsed === null) continue;

          const document = yield* store.get(entry.path, { from: options.from });

          if (document === null) continue;

          documents.push({
            ...parsed,
            document,
            payload: document.json<TPayload>(),
          });
        }
      });

    yield* visit(root).pipe(Effect.orElseSucceed(() => undefined));

    return documents.sort((a, b) => a.path.localeCompare(b.path));
  });

export const introduced = (
  store: StoreServiceShape,
  snapshot: Snapshot,
  options: {
    readonly root?: string;
  } = {},
): Effect.Effect<ReadonlyArray<EventChange>, GitDbError> =>
  Effect.gen(function* () {
    const root = yield* normalizeStorePath(options.root ?? EVENT_ROOT);
    const changes =
      snapshot.parents[0] === undefined
        ? (yield* list(store, { from: snapshot.id })).map((event) => ({
            newObjectId: event.document.objectId,
            path: event.path,
          }))
        : [
            ...(yield* store.diff(snapshot.parents[0], snapshot.id)).added,
            ...(yield* store.diff(snapshot.parents[0], snapshot.id)).modified,
            ...(yield* store.diff(snapshot.parents[0], snapshot.id)).deleted,
          ];
    const events: Array<EventChange> = [];

    for (const change of changes) {
      const parsed = parseEventPath(change.path, root);

      if (parsed === null) continue;

      events.push({
        ...parsed,
        change,
      });
    }

    return events.sort((a, b) => a.path.localeCompare(b.path));
  });

export const parseEventPath = (
  path: string,
  root = EVENT_ROOT,
): {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly eventId: string;
  readonly path: string;
} | null => {
  const prefix = `${root}/`;

  if (!path.startsWith(prefix) || !path.endsWith(".json")) return null;

  const rest = path.slice(prefix.length);
  const segments = rest.split("/");

  if (segments.length !== 3 && segments.length !== 4) return null;

  const [aggregateType, first, second, third] = segments;

  if (aggregateType === undefined || first === undefined || second === undefined) {
    return null;
  }

  const aggregateId = third === undefined ? first : second;
  const filename = third === undefined ? second : third;

  if (third !== undefined) {
    const shard = first;

    if (!shardedAggregateTypes.has(aggregateType) || shard !== aggregateShard(aggregateId)) {
      return null;
    }
  }

  return {
    aggregateId,
    aggregateType,
    eventId: filename.slice(0, -".json".length),
    path,
  };
};

const aggregateShard = (aggregateId: string): string => {
  // Ticket ids are PREFIX-HASH; shard by the hash segment so repository prefixes do not hot-spot.
  const shardSource = aggregateId.includes("-") ? aggregateId.split("-").at(-1)! : aggregateId;

  return shardSource.slice(0, 2);
};

const validateEventSegment = (label: string, value: string): Effect.Effect<string, GitDbError> => {
  if (safeEventSegment.test(value)) return Effect.succeed(value);

  return Effect.fail(invalidPath(value, `invalid event ${label}`));
};

const normalizeJson = (value: unknown): unknown => {
  if (value === undefined) {
    throw new TypeError("Cannot encode undefined as event JSON");
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : normalizeJson(item)));
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const key of Object.keys(input).sort()) {
    const normalized = input[key] === undefined ? undefined : normalizeJson(input[key]);

    if (normalized !== undefined) {
      output[key] = normalized;
    }
  }

  return output;
};
