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

export const ChatMessagePayload = Schema.Struct({
  content: Schema.String,
  createdAt: Schema.optional(Schema.String),
  id: Schema.optional(Schema.String),
  role: Schema.Literals(["agent", "assistant", "system", "user"]),
});

export const ChatRepositoryPayload = Schema.Struct({
  displayName: Schema.optional(Schema.String),
  id: Schema.String,
  path: Schema.optional(Schema.String),
});

export const ChatStreamOptionsPayload = Schema.Struct({
  heartbeatMs: Schema.optional(Schema.Number),
  includeArtifacts: Schema.optional(Schema.Boolean),
  includeProgress: Schema.optional(Schema.Boolean),
});

export const ChatTurnPayload = Schema.Struct({
  instructions: Schema.optional(Schema.String),
  message: Schema.String,
  messages: Schema.optional(Schema.Array(ChatMessagePayload)),
  model: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.Literals(["codex", "claude", "opencode"])),
  repositories: Schema.optional(Schema.Array(ChatRepositoryPayload)),
  sessionId: Schema.optional(Schema.String),
  stream: Schema.optional(ChatStreamOptionsPayload),
  threadId: Schema.optional(Schema.String),
});

export const ChatThreadParams = { threadId: Schema.String };
export const ChatMessageParams = { messageId: Schema.String, threadId: Schema.String };
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
