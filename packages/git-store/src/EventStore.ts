import { Context, Crypto, Effect, Layer, Schema } from "effect";
import {
  EventAppendConflictError,
  InvalidJsonDocumentError,
  type GitStoreError,
} from "./GitStoreErrors.ts";
import type { Change, Snapshot, StorePath } from "./GitStoreSchemas.ts";
import { Document } from "./Document.ts";
import { GitStore, type GitStoreTransaction } from "./GitStore.ts";
import {
  aggregatePath,
  canonicalAggregatePath,
  parseCanonicalEventPath,
  parseEventPath,
  validateEventSegment,
  validatePageAggregateId,
  type ParsedEventPath,
} from "./internal/event-path.ts";
import { normalizeStorePath } from "./internal/refs.ts";
import { stableJsonBytes, encodeSchemaValue } from "./internal/json.ts";

export type { ParsedEventPath } from "./internal/event-path.ts";

export const EVENT_ROOT = "collections/events";

export type EventPathInput = {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly eventId: string;
};

export type AppendEventInput<TPayload = unknown> = EventPathInput & {
  readonly payload: TPayload;
  readonly schema?: Schema.Top;
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

export const aggregateEventPath = (
  input: Pick<EventPathInput, "aggregateId" | "aggregateType">,
): string => aggregatePath({ ...input, root: EVENT_ROOT });

export const parseEventMetadataPath = (path: string): ParsedEventPath | null =>
  parseEventPath(path, EVENT_ROOT);

export const parseCanonicalEventMetadataPath = (path: string) =>
  parseCanonicalEventPath(path, EVENT_ROOT);

export type EventStoreShape = {
  readonly aggregatePath: (
    input: Pick<EventPathInput, "aggregateId" | "aggregateType">,
  ) => Effect.Effect<string, GitStoreError>;
  readonly append: <TPayload>(
    tx: GitStoreTransaction,
    input: AppendEventInput<TPayload>,
  ) => Effect.Effect<string, GitStoreError>;
  readonly introduced: (
    snapshot: Snapshot,
    options?: { readonly root?: string },
  ) => Effect.Effect<ReadonlyArray<EventChange>, GitStoreError>;
  readonly list: <TPayload = unknown>(options?: {
    readonly from?: string;
    readonly payloadSchema?: Schema.Top;
    readonly root?: string;
  }) => Effect.Effect<ReadonlyArray<EventDocument<TPayload>>, GitStoreError>;
  readonly parsePath: (path: string) => Effect.Effect<ParsedEventPath | null, GitStoreError>;
  readonly path: (input: EventPathInput) => Effect.Effect<string, GitStoreError>;
};

export class EventStore extends Context.Service<EventStore, EventStoreShape>()(
  "@cycle/git-store/EventStore",
) {}

export const EventStoreLive = Layer.effect(
  EventStore,
  Effect.gen(function* () {
    const store = yield* GitStore;
    const crypto = yield* Crypto.Crypto;
    const provideCrypto = <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto>) =>
      effect.pipe(Effect.provideService(Crypto.Crypto, crypto));

    const eventAggregatePath = Effect.fn("EventStore.aggregatePath")(function* (
      input: Pick<EventPathInput, "aggregateId" | "aggregateType">,
    ) {
      const aggregateType = yield* validateEventSegment("aggregate type", input.aggregateType);
      const aggregateId = yield* validateEventSegment("aggregate id", input.aggregateId);

      if (aggregateType === "page") yield* validatePageAggregateId(aggregateId);

      return yield* provideCrypto(
        canonicalAggregatePath({ aggregateId, aggregateType, root: EVENT_ROOT }),
      );
    });

    const parsePath = Effect.fn("EventStore.parsePath")(function* (path: string) {
      return yield* provideCrypto(parseCanonicalEventPath(path, EVENT_ROOT));
    });

    const path = Effect.fn("EventStore.path")(function* (input: EventPathInput) {
      const eventId = yield* validateEventSegment("event id", input.eventId);
      const aggregate = yield* eventAggregatePath(input);

      return `${aggregate}/${eventId}.json`;
    });

    const append = Effect.fn("EventStore.append")(function* <TPayload>(
      tx: GitStoreTransaction,
      input: AppendEventInput<TPayload>,
    ) {
      const eventPath = yield* path(input);
      const existing = yield* tx.get(eventPath);

      if (existing !== null) {
        return yield* new EventAppendConflictError({
          message: `Event already exists: ${eventPath}`,
          path: eventPath,
        });
      }

      const bytes =
        input.schema === undefined
          ? yield* stableJsonBytes(input.payload, { message: "Cannot encode event JSON" })
          : yield* encodeSchemaValue(input.schema, input.payload, {
              message: "Cannot encode event JSON",
              path: eventPath,
            }).pipe(
              Effect.flatMap((json) =>
                stableJsonBytes(json, {
                  message: "Cannot encode event JSON",
                  path: eventPath,
                }),
              ),
            ) as Effect.Effect<Uint8Array, InvalidJsonDocumentError>;

      yield* tx.put(eventPath, Document.bytes(bytes));
      return eventPath;
    });

    const list = Effect.fn("EventStore.list")(function* <TPayload = unknown>(
      options: {
        readonly from?: string;
        readonly payloadSchema?: Schema.Top;
        readonly root?: string;
      } = {},
    ) {
      const root = yield* normalizeStorePath(options.root ?? EVENT_ROOT);
      const documents = yield* collectDocuments(store, root, options.from);
      const events: Array<EventDocument<TPayload>> = [];

      for (const document of documents) {
        const parsed = yield* provideCrypto(parseCanonicalEventPath(document.path, root));

        if (parsed === null) continue;

        const payload = yield* parsePayload<TPayload>(document, options.payloadSchema);

        events.push({
          ...parsed,
          document,
          payload,
        });
      }

      return events.sort((left, right) => left.path.localeCompare(right.path));
    });

    const introduced = Effect.fn("EventStore.introduced")(function* (
      snapshot: Snapshot,
      options: { readonly root?: string } = {},
    ) {
      const root = yield* normalizeStorePath(options.root ?? EVENT_ROOT);
      const changes: Array<EventChange> = [];

      if (snapshot.parents.length === 0) {
        for (const event of yield* list({ from: snapshot.id, root })) {
          changes.push({
            aggregateId: event.aggregateId,
            aggregateType: event.aggregateType,
            change: {
              newObjectId: event.document.objectId as Change["newObjectId"],
              path: event.path as StorePath,
            },
            eventId: event.eventId,
            path: event.path,
          });
        }

        return changes;
      }

      for (const parent of snapshot.parents) {
        const diff = yield* store.diff(parent, snapshot.id);

        for (const change of [...diff.added, ...diff.modified, ...diff.deleted]) {
          const parsed = yield* provideCrypto(parseCanonicalEventPath(change.path, root));

          if (parsed !== null) {
            changes.push({
              ...parsed,
              change,
            });
          }
        }
      }

      return changes.sort((left, right) => left.path.localeCompare(right.path));
    });

    return EventStore.of({
      aggregatePath: eventAggregatePath,
      append,
      introduced,
      list,
      parsePath,
      path,
    });
  }),
);

const collectDocuments = (
  store: import("./GitStore.ts").GitStoreShape,
  root: StorePath,
  from?: string,
): Effect.Effect<ReadonlyArray<Document>, GitStoreError> =>
  Effect.gen(function* () {
    const output: Array<Document> = [];
    const stack = [root];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) continue;

      for (const entry of yield* store.list(current, { from: from as never })) {
        if (entry.type === "tree") stack.push(entry.path);
        else {
          const document = yield* store.get(entry.path, { from: from as never });
          if (document !== null) output.push(document);
        }
      }
    }

    return output.sort((left, right) => left.path.localeCompare(right.path));
  });

const parsePayload = <TPayload>(
  document: Document,
  payloadSchema?: Schema.Top,
): Effect.Effect<TPayload, GitStoreError> =>
  Effect.try({
    try: () => document.json(),
    catch: (cause) =>
      new InvalidJsonDocumentError({
        cause,
        message: `Invalid event JSON at ${document.path}`,
        path: document.path,
      }),
  }).pipe(
    Effect.flatMap((value) =>
      payloadSchema === undefined
        ? Effect.succeed(value as TPayload)
        : (Schema.decodeUnknownEffect(payloadSchema)(value, { errors: "all" }).pipe(
            Effect.map((decoded) => decoded as TPayload),
            Effect.mapError(
              (cause) =>
                new InvalidJsonDocumentError({
                  cause,
                  message: `Invalid event JSON at ${document.path}: ${String(cause)}`,
                  path: document.path,
                }),
            ),
          ) as Effect.Effect<TPayload, InvalidJsonDocumentError>),
    ),
  );
