import { ContractSchemas } from "@cycle/contracts";
import { Schema } from "effect";
import {
  AcceptedResourceEnvelopeOf,
  CollectionEnvelopeOf,
  CollectionPaginationQueryParams,
  CreatedResourceEnvelopeOf,
  OptionalSearchParam,
  OptionalStringParam,
  ResourceEnvelopeOf,
  strictSchema,
} from "./shared.ts";

export const RepositoryStatusResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.RepositoryStatus,
);
export const RepositoryStatusCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.RepositoryStatus,
);
export const RepositoryStatusCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.RepositoryStatus,
);
export const RepositoryStatusAcceptedEnvelope = AcceptedResourceEnvelopeOf(
  ContractSchemas.RepositoryStatus,
);
export const RepositoryHistoryCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.HistoryCommit,
);
export const RepositoryWarningCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.MaterializationWarning,
);
export const RepositoryPushAcceptedEnvelope = AcceptedResourceEnvelopeOf(
  ContractSchemas.SyncResult,
);

export const RepositoryOpenPayload = strictSchema(
  Schema.Struct({
    displayName: Schema.optional(Schema.String),
    path: Schema.optional(Schema.String),
    repositoryId: Schema.optional(Schema.String),
    // Store is implementation-owned repository bootstrap data.
    store: Schema.optional(Schema.Unknown),
    syncOnOpen: Schema.optional(Schema.Boolean),
    worktreePath: Schema.optional(Schema.String),
  }),
);

export const RepositoryCollectionQuery = Schema.Struct({
  "filter[id]": OptionalStringParam("Repository id to match exactly."),
  "filter[path]": OptionalStringParam(
    "Repository worktree or Git directory path to match exactly.",
  ),
  "filter[status]": OptionalStringParam("Repository materialization status to match."),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
});

export const RepositoryWarningQuery = Schema.Struct(CollectionPaginationQueryParams);

export const RepositoryHistoryQuery = Schema.Struct({
  "filter[ticketId]": OptionalStringParam("Ticket id used to narrow history to relevant commits."),
  ...CollectionPaginationQueryParams,
});

export const RepositoryParams = { repositoryId: Schema.String };
