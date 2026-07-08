import { Effect } from "effect";
import { InvalidEventIdentifierError } from "../GitStoreErrors.ts";
import { eventSegmentPattern } from "./patterns.ts";
import { splitPath, tailAfterLastHyphen } from "./strings.ts";

const eventFileExtension = ".json";
const shardedAggregateTypes = new Set(["ticket"]);

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

export const aggregateShard = (aggregateId: string): string =>
  tailAfterLastHyphen(aggregateId).slice(0, 2);

export const parseEventPath = (path: string, root: string): ParsedEventPath | null => {
  const prefix = `${root}/`;

  if (!path.startsWith(prefix) || !path.endsWith(eventFileExtension)) return null;

  const segments = splitPath(path.slice(prefix.length));
  if (segments.length !== 3 && segments.length !== 4) return null;

  const [aggregateType, first, second, third] = segments;
  if (aggregateType === undefined || first === undefined || second === undefined) return null;

  if (segments.length === 3) {
    return {
      aggregateId: first,
      aggregateType,
      eventId: second.slice(0, -eventFileExtension.length),
      path,
    };
  }

  if (third === undefined) return null;

  return {
    aggregateId: second,
    aggregateType,
    eventId: third.slice(0, -eventFileExtension.length),
    path,
  };
};

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
