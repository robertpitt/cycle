import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export const JsonObject = Schema.Record(Schema.String, Schema.Json);
export const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const PositiveIntegerFromString = Schema.FiniteFromString.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(100),
);
export const ApiPort = PositiveInteger.check(Schema.isLessThanOrEqualTo(65535));
const StrictDecodeOptions = { onExcessProperty: "error" } as const;

export const strictSchema = <S extends Schema.Top>(schema: S): S =>
  schema.annotate({ parseOptions: StrictDecodeOptions }) as S;

export const OptionalStringParam = (description: string) =>
  Schema.optional(Schema.String).annotate({ description });

export const RequiredStringParam = (description: string) => Schema.String.annotate({ description });

export const OptionalBooleanStringParam = (description: string) =>
  Schema.optional(Schema.Literals(["false", "true"])).annotate({ description });

const OptionalPageCursorParam = (description: string) =>
  Schema.optional(Schema.String).annotate({ description });

const OptionalPageLimitParam = (description: string) =>
  Schema.optional(PositiveIntegerFromString).annotate({ description });

export const OptionalCsvStringParam = (description: string) =>
  Schema.optional(Schema.String).annotate({ description });

export const OptionalSearchParam = OptionalStringParam(
  "Free-text search string applied by the endpoint to its primary display fields.",
);

const GenericPageCursorParam = OptionalPageCursorParam(
  "Opaque pagination cursor returned by the previous collection response.",
);

const GenericPageLimitParam = OptionalPageLimitParam(
  "Maximum number of collection entries to return. Defaults to 50 and must be between 1 and 100.",
);

export const CollectionPaginationQueryParams = {
  "page[cursor]": GenericPageCursorParam,
  "page[limit]": GenericPageLimitParam,
};

const ResourceMeta = Schema.Struct({
  requestId: Schema.String.annotate({
    description: "Request identifier returned in the x-request-id response header.",
  }),
});

const CollectionMeta = Schema.Struct({
  requestId: Schema.String.annotate({
    description: "Request identifier returned in the x-request-id response header.",
  }),
  totalCount: Schema.NullOr(NonNegativeInteger).annotate({
    description: "Total matching entry count when it is inexpensive to compute; otherwise null.",
  }),
});

export const ResourceEnvelopeOf = <A extends Schema.Top>(data: A) =>
  Schema.Struct({
    data,
    meta: ResourceMeta,
  });

export const CreatedResourceEnvelopeOf = <A extends Schema.Top>(data: A) =>
  ResourceEnvelopeOf(data).pipe(HttpApiSchema.status("Created"));

export const AcceptedResourceEnvelopeOf = <A extends Schema.Top>(data: A) =>
  ResourceEnvelopeOf(data).pipe(HttpApiSchema.status("Accepted"));

export const CollectionEnvelopeOf = <A extends Schema.Top>(entry: A) =>
  Schema.Struct({
    data: Schema.Array(entry).annotate({
      description: "Collection entries for the current page.",
    }),
    links: Schema.Struct({
      next: Schema.NullOr(Schema.String).annotate({
        description: "Relative URL for the next page, or null when no next page is available.",
      }),
      self: Schema.String.annotate({
        description: "Relative URL for the current request.",
      }),
    }),
    meta: CollectionMeta,
    page: Schema.Struct({
      hasMore: Schema.Boolean.annotate({
        description: "Whether another page is available.",
      }),
      limit: PositiveInteger.check(Schema.isLessThanOrEqualTo(100)).annotate({
        description: "Maximum number of entries requested for this page.",
      }),
      nextCursor: Schema.NullOr(Schema.String).annotate({
        description: "Opaque cursor to pass as page[cursor] for the next page.",
      }),
    }),
  });

export const CollectionEnvelopeWithMetaOf = <A extends Schema.Top, F extends Schema.Struct.Fields>(
  entry: A,
  metaFields: F,
) =>
  Schema.Struct({
    data: Schema.Array(entry).annotate({
      description: "Collection entries for the current page.",
    }),
    links: Schema.Struct({
      next: Schema.NullOr(Schema.String).annotate({
        description: "Relative URL for the next page, or null when no next page is available.",
      }),
      self: Schema.String.annotate({
        description: "Relative URL for the current request.",
      }),
    }),
    meta: Schema.Struct({
      requestId: Schema.String.annotate({
        description: "Request identifier returned in the x-request-id response header.",
      }),
      totalCount: Schema.NullOr(NonNegativeInteger).annotate({
        description:
          "Total matching entry count when it is inexpensive to compute; otherwise null.",
      }),
      ...metaFields,
    }),
    page: Schema.Struct({
      hasMore: Schema.Boolean.annotate({
        description: "Whether another page is available.",
      }),
      limit: PositiveInteger.check(Schema.isLessThanOrEqualTo(100)).annotate({
        description: "Maximum number of entries requested for this page.",
      }),
      nextCursor: Schema.NullOr(Schema.String).annotate({
        description: "Opaque cursor to pass as page[cursor] for the next page.",
      }),
    }),
  });
