import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);
const UnknownArray = Schema.Array(Schema.Unknown);

const ResourceMeta = Schema.Struct({
  requestId: Schema.String,
});

const CollectionMeta = Schema.Struct({
  requestId: Schema.String,
  totalCount: Schema.NullOr(Schema.Number),
});

export const ResourceEnvelope = Schema.Struct({
  data: Schema.Unknown,
  meta: ResourceMeta,
});

export const CreatedResourceEnvelope = ResourceEnvelope.pipe(HttpApiSchema.status("Created"));
export const AcceptedResourceEnvelope = ResourceEnvelope.pipe(HttpApiSchema.status("Accepted"));

export const CollectionEnvelope = Schema.Struct({
  data: UnknownArray,
  links: Schema.Struct({
    next: Schema.NullOr(Schema.String),
    self: Schema.String,
  }),
  meta: CollectionMeta,
  page: Schema.Struct({
    hasMore: Schema.Boolean,
    limit: Schema.Number,
    nextCursor: Schema.NullOr(Schema.String),
  }),
});

export const AnyPayload = UnknownRecord;

export const RepositoryParams = { repositoryId: Schema.String };
export const IssueParams = { repositoryId: Schema.String, issueId: Schema.String };
export const IssueRevisionParams = {
  issueId: Schema.String,
  repositoryId: Schema.String,
  snapshotId: Schema.String,
};
export const IssueCommentParams = {
  commentId: Schema.String,
  issueId: Schema.String,
  repositoryId: Schema.String,
};
export const DraftParams = { draftId: Schema.String, repositoryId: Schema.String };
export const LabelParams = { labelId: Schema.String, repositoryId: Schema.String };
export const UserParams = { repositoryId: Schema.String, userId: Schema.String };
export const ViewParams = { repositoryId: Schema.String, viewId: Schema.String };
export const TemplateParams = { repositoryId: Schema.String, templateId: Schema.String };
export const InitiativeParams = { initiativeId: Schema.String, repositoryId: Schema.String };
