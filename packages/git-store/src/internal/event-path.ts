import { Crypto, Effect, Encoding } from "effect";
import { InvalidEventIdentifierError } from "../GitStoreErrors.ts";
import { bytesFromString } from "./bytes.ts";
import { eventSegmentPattern } from "./patterns.ts";
import { splitPath, tailAfterLastHyphen } from "./strings.ts";

const eventFileExtension = ".json";
const shardedAggregateTypes = new Set(["ticket"]);
const pageAggregateType = "page";
const uuidV7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type EventPathParts = {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly eventId: string;
};

export type ParsedEventPath = EventPathParts & {
  readonly path: string;
};

export const aggregatePath = (
  input: Pick<EventPathParts, "aggregateId" | "aggregateType"> & { readonly root: string },
): string =>
  shardedAggregateTypes.has(input.aggregateType)
    ? `${input.root}/${input.aggregateType}/${aggregateShard(input.aggregateId)}/${input.aggregateId}`
    : `${input.root}/${input.aggregateType}/${input.aggregateId}`;

export const pageAggregateShard = Effect.fn("pageAggregateShard")(function* (
  pageId: string,
) {
  const crypto = yield* Crypto.Crypto;
  const digest = yield* crypto.digest("SHA-256", bytesFromString(pageId)).pipe(
    Effect.mapError(
      () =>
        new InvalidEventIdentifierError({
          kind: "page id",
          message: "Unable to compute Page event shard",
          value: pageId,
        }),
    ),
  );

  return Encoding.encodeHex(digest).toLowerCase().slice(0, 2);
});

export const canonicalAggregatePath = Effect.fn("canonicalAggregatePath")(function* (
  input: Pick<EventPathParts, "aggregateId" | "aggregateType"> & { readonly root: string },
) {
  if (input.aggregateType !== pageAggregateType) return aggregatePath(input);

  const shard = yield* pageAggregateShard(input.aggregateId);
  return `${input.root}/${pageAggregateType}/${shard}/${input.aggregateId}`;
});

export const aggregateShard = (aggregateId: string): string =>
  tailAfterLastHyphen(aggregateId).slice(0, 2);

export const validatePageAggregateId = (
  value: string,
): Effect.Effect<string, InvalidEventIdentifierError> =>
  uuidV7Pattern.test(value)
    ? Effect.succeed(value)
    : Effect.fail(
        new InvalidEventIdentifierError({
          kind: "page id",
          message: `Invalid Page event aggregate id: ${value}`,
          value,
        }),
      );

export const parseEventPath = (path: string, root: string): ParsedEventPath | null => {
  const prefix = `${root}/`;

  if (!path.startsWith(prefix) || !path.endsWith(eventFileExtension)) return null;

  const segments = splitPath(path.slice(prefix.length));
  if (segments.length !== 3 && segments.length !== 4) return null;

  const [aggregateType, first, second, third] = segments;
  if (aggregateType === undefined || first === undefined || second === undefined) return null;

  if (segments.length === 3) {
    if (aggregateType === pageAggregateType) return null;

    return {
      aggregateId: first,
      aggregateType,
      eventId: second.slice(0, -eventFileExtension.length),
      path,
    };
  }

  if (third === undefined) return null;

  if (aggregateType === pageAggregateType) {
    if (!/^[0-9a-f]{2}$/u.test(first) || !uuidV7Pattern.test(second)) return null;
  } else if (aggregateType === "ticket") {
    if (first !== aggregateShard(second)) return null;
  } else {
    return null;
  }

  return {
    aggregateId: second,
    aggregateType,
    eventId: third.slice(0, -eventFileExtension.length),
    path,
  };
};

export const parseCanonicalEventPath = Effect.fn("parseCanonicalEventPath")(
  function* (path: string, root: string) {
    const parsed = parseEventPath(path, root);

    if (parsed === null || parsed.aggregateType !== pageAggregateType) return parsed;

    const expectedAggregatePath = yield* canonicalAggregatePath({
      aggregateId: parsed.aggregateId,
      aggregateType: parsed.aggregateType,
      root,
    });

    return path === `${expectedAggregatePath}/${parsed.eventId}${eventFileExtension}`
      ? parsed
      : null;
  },
);

export const validateEventSegment = (
  kind: string,
  value: string,
): Effect.Effect<string, InvalidEventIdentifierError> =>
  eventSegmentPattern.test(value) && !value.includes("/") && !value.includes("\0")
    ? Effect.succeed(value)
    : Effect.fail(
        new InvalidEventIdentifierError({
          kind,
          message: `Invalid event ${kind}: ${value}`,
          value,
        }),
      );
