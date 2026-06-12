import { Schema } from "effect";
import { CreateDraftInput, IssueQuery } from "./Inputs.ts";

const StringList = Schema.Array(Schema.String);
const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);

export const ActorOutput = Schema.Struct({
  email: Schema.optional(Schema.String),
  name: Schema.String,
  provider: Schema.optional(Schema.String),
  type: Schema.Literals(["agent", "human", "import"]),
});

export const ExternalLinkOutput = Schema.Struct({
  source: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  url: Schema.String,
});

export const UserProfileDocumentOutput = Schema.StructWithRest(
  Schema.Struct({
    aliases: Schema.optional(StringList),
    avatarUrl: Schema.optional(Schema.String),
    createdAt: Schema.String,
    disabledAt: Schema.optional(Schema.String),
    displayName: Schema.String,
    email: Schema.String,
    id: Schema.String,
    schemaVersion: Schema.Literal(1),
    source: Schema.Literals(["import", "local-profile", "manual"]),
    timezone: Schema.optional(Schema.String),
    updatedAt: Schema.String,
  }),
  [UnknownRecord],
);

export const UserProfilePageOutput = Schema.Struct({
  entries: Schema.Array(UserProfileDocumentOutput),
  nextCursor: Schema.optional(Schema.String),
});

export const LabelDefinitionDocumentOutput = Schema.StructWithRest(
  Schema.Struct({
    archivedAt: Schema.optional(Schema.String),
    color: Schema.String,
    createdAt: Schema.String,
    createdBy: ActorOutput,
    description: Schema.optional(Schema.String),
    id: Schema.String,
    name: Schema.String,
    schemaVersion: Schema.Literal(1),
    updatedAt: Schema.String,
  }),
  [UnknownRecord],
);

export const LabelDefinitionPageOutput = Schema.Struct({
  entries: Schema.Array(LabelDefinitionDocumentOutput),
  nextCursor: Schema.optional(Schema.String),
});

const SavedViewKindOutput = Schema.Literals(["board", "list"]);
const SavedViewGroupByOutput = Schema.Literals([
  "assignee",
  "dueDate",
  "label",
  "none",
  "parent",
  "priority",
  "status",
]);
const SavedViewSortOutput = Schema.Struct({
  direction: Schema.optional(Schema.Literals(["asc", "desc"])),
  field: Schema.optional(
    Schema.Literals(["createdAt", "dueDate", "priority", "title", "updatedAt"]),
  ),
});
const SavedViewDisplayOutput = Schema.Struct({
  density: Schema.optional(Schema.Literals(["comfortable", "compact"])),
  properties: Schema.optional(
    Schema.Array(
      Schema.Literals(["assignee", "dueDate", "estimate", "labels", "priority", "status"]),
    ),
  ),
});

export const SavedViewDocumentOutput = Schema.StructWithRest(
  Schema.Struct({
    builtIn: Schema.optional(Schema.Boolean),
    createdAt: Schema.String,
    createdBy: ActorOutput,
    description: Schema.optional(Schema.String),
    display: Schema.optional(SavedViewDisplayOutput),
    groupBy: SavedViewGroupByOutput,
    id: Schema.String,
    kind: SavedViewKindOutput,
    name: Schema.String,
    ownerUserId: Schema.optional(Schema.String),
    pinned: Schema.Boolean,
    query: IssueQuery,
    repositoryScope: Schema.optional(Schema.Literal("current-repository")),
    schemaVersion: Schema.Literal(1),
    sort: Schema.optional(SavedViewSortOutput),
    updatedAt: Schema.String,
  }),
  [UnknownRecord],
);

export const SavedViewPageOutput = Schema.Struct({
  entries: Schema.Array(SavedViewDocumentOutput),
  nextCursor: Schema.optional(Schema.String),
});

export const IssueTemplateDefaultsOutput = Schema.Struct({
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  body: Schema.optional(Schema.String),
  dueDate: Schema.optional(Schema.NullOr(Schema.String)),
  estimate: Schema.optional(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
  externalLinks: Schema.optional(Schema.Array(ExternalLinkOutput)),
  labels: Schema.optional(StringList),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  planningNotRequired: Schema.optional(Schema.Boolean),
  priority: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
});

export const IssueTemplateDocumentOutput = Schema.StructWithRest(
  Schema.Struct({
    active: Schema.Boolean,
    bodyTemplate: Schema.String,
    childTemplates: Schema.optional(StringList),
    createdAt: Schema.String,
    createdBy: ActorOutput,
    defaults: Schema.optional(IssueTemplateDefaultsOutput),
    description: Schema.optional(Schema.String),
    id: Schema.String,
    kind: Schema.Literals(["bug", "feature", "implementation", "initiative", "qa"]),
    name: Schema.String,
    schemaVersion: Schema.Literal(1),
    titleTemplate: Schema.String,
    updatedAt: Schema.String,
  }),
  [UnknownRecord],
);

export const IssueTemplatePageOutput = Schema.Struct({
  entries: Schema.Array(IssueTemplateDocumentOutput),
  nextCursor: Schema.optional(Schema.String),
});

export const InitiativeProgressOutput = Schema.Struct({
  completedEstimate: Schema.Number,
  completedIssues: Schema.Number,
  estimateTotal: Schema.Number,
  issueTotal: Schema.Number,
  statusCounts: Schema.Record(Schema.String, Schema.Number),
});

export const IssueRelationOutput = Schema.Struct({
  issueId: Schema.String,
  type: Schema.Literals(["blocked-by", "blocking", "duplicate", "related"]),
});

export const IssueFrontmatterOutput = Schema.StructWithRest(
  Schema.Struct({
    agentProvenance: Schema.optional(UnknownRecord),
    archivedAt: Schema.optional(Schema.NullOr(Schema.String)),
    archivedBy: Schema.optional(Schema.NullOr(ActorOutput)),
    assignee: Schema.optional(Schema.NullOr(Schema.String)),
    children: Schema.optional(StringList),
    createdAt: Schema.String,
    createdBy: ActorOutput,
    deletedAt: Schema.optional(Schema.NullOr(Schema.String)),
    deletedBy: Schema.optional(Schema.NullOr(ActorOutput)),
    duplicateOf: Schema.optional(Schema.NullOr(Schema.String)),
    dueDate: Schema.optional(Schema.NullOr(Schema.String)),
    estimate: Schema.optional(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
    externalLinks: Schema.optional(Schema.Array(ExternalLinkOutput)),
    id: Schema.String,
    labels: Schema.optional(StringList),
    parent: Schema.optional(Schema.NullOr(Schema.String)),
    planAcceptedAt: Schema.optional(Schema.String),
    planAcceptedBy: Schema.optional(ActorOutput),
    planningNotRequired: Schema.optional(Schema.Boolean),
    priority: Schema.String,
    relations: Schema.optional(Schema.Array(IssueRelationOutput)),
    repository: Schema.optional(Schema.String),
    status: Schema.String,
    title: Schema.String,
    type: Schema.String,
    updatedAt: Schema.String,
  }),
  [UnknownRecord],
);

export const TicketDocumentOutput = Schema.Struct({
  archivedAt: Schema.optional(Schema.String),
  assignee: Schema.optional(Schema.String),
  body: Schema.String,
  bodyFormat: Schema.Literal("markdown"),
  createdBy: Schema.String,
  deletedAt: Schema.optional(Schema.String),
  dueDate: Schema.optional(Schema.String),
  estimate: Schema.optional(Schema.Union([Schema.Number, Schema.String])),
  frontmatter: IssueFrontmatterOutput,
  id: Schema.String,
  labels: Schema.optional(StringList),
  parent: Schema.String,
  priority: Schema.String,
  relations: Schema.optional(Schema.Array(IssueRelationOutput)),
  repository: Schema.optional(Schema.String),
  repositoryId: Schema.optional(Schema.String),
  schemaVersion: Schema.Literal(1),
  status: Schema.String,
  title: Schema.String,
  type: Schema.String,
  updatedDate: Schema.String,
});

export const TicketPageOutput = Schema.Struct({
  entries: Schema.Array(TicketDocumentOutput),
  nextCursor: Schema.optional(Schema.String),
});

export const TicketSearchResultOutput = Schema.Struct({
  matchedFields: Schema.Array(Schema.Literals(["body", "comment", "title"])),
  ticket: TicketDocumentOutput,
});

export const TicketSearchPageOutput = Schema.Struct({
  entries: Schema.Array(TicketSearchResultOutput),
  nextCursor: Schema.optional(Schema.String),
});

export const LinkedRecordOutput = Schema.Struct({
  createdAt: Schema.String,
  createdBy: ActorOutput,
  createdDate: Schema.String,
  id: Schema.String,
  issueId: Schema.String,
  payload: Schema.Unknown,
  recordType: Schema.String,
  schemaVersion: Schema.Literal(1),
});

export const RecordPageOutput = Schema.Struct({
  entries: Schema.Array(LinkedRecordOutput),
  nextCursor: Schema.optional(Schema.String),
});

export const RepositoryRemoteOutput = Schema.Struct({
  name: Schema.String,
  url: Schema.optional(Schema.String),
});

export const RepositoryMetadataOutput = Schema.Struct({
  currentBranch: Schema.optional(Schema.String),
  defaultRemote: Schema.optional(Schema.String),
  defaultRemoteUrl: Schema.optional(Schema.String),
  gitDir: Schema.optional(Schema.String),
  inspectedAt: Schema.optional(Schema.String),
  remotes: Schema.Array(RepositoryRemoteOutput),
  worktreePath: Schema.optional(Schema.String),
});

export const CycleRepositoryMetadataOutput = Schema.Struct({
  createdAt: Schema.String,
  schemaVersion: Schema.Literal(1),
  ticketIdFormat: Schema.Literal("prefix-base36-5+"),
  ticketPrefix: Schema.String,
  updatedAt: Schema.String,
});

export const RepositoryStatusOutput = Schema.Struct({
  activeGeneration: Schema.Number,
  activeSnapshotId: Schema.NullOr(Schema.String),
  cycleMetadata: Schema.optional(CycleRepositoryMetadataOutput),
  lastSyncCompletedAt: Schema.optional(Schema.String),
  lastSyncError: Schema.optional(Schema.String),
  lastSyncStartedAt: Schema.optional(Schema.String),
  metadata: Schema.optional(RepositoryMetadataOutput),
  repositoryId: Schema.String,
  status: Schema.Literals(["degraded", "empty", "failed", "ready", "syncing"]),
  warningCount: Schema.Number,
});

export const MaterializationWarningOutput = Schema.Struct({
  createdAt: Schema.String,
  message: Schema.String,
  objectId: Schema.optional(Schema.String),
  objectType: Schema.String,
  path: Schema.String,
  reason: Schema.String,
  repositoryId: Schema.String,
  snapshotId: Schema.String,
});

export const HistoryCommitOutput = Schema.Struct({
  authorEmail: Schema.optional(Schema.String),
  authorName: Schema.optional(Schema.String),
  changedTicketIds: StringList,
  committedAt: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  parentIds: StringList,
  sequence: Schema.Number,
  snapshotId: Schema.String,
  warningCount: Schema.Number,
});

export const HistoryPageOutput = Schema.Struct({
  entries: Schema.Array(HistoryCommitOutput),
  nextCursor: Schema.optional(Schema.String),
});

export const TicketRevisionDiffFileOutput = Schema.Struct({
  language: Schema.optional(Schema.String),
  newContent: Schema.String,
  newPath: Schema.String,
  oldContent: Schema.String,
  oldPath: Schema.String,
});

export const TicketRevisionMetadataChangeOutput = Schema.Struct({
  after: Schema.Unknown,
  before: Schema.Unknown,
  field: Schema.String,
});

export const TicketRevisionDiffOutput = Schema.Struct({
  files: Schema.Array(TicketRevisionDiffFileOutput),
  fromSnapshotId: Schema.String,
  metadataChanges: Schema.Array(TicketRevisionMetadataChangeOutput),
  ticketId: Schema.String,
  toSnapshotId: Schema.String,
});

export const TicketDraftDocumentOutput = Schema.Struct({
  createdAt: Schema.String,
  createdBy: ActorOutput,
  id: Schema.String,
  input: CreateDraftInput,
  schemaVersion: Schema.Literal(1),
  status: Schema.Literals(["committed", "open"]),
  updatedAt: Schema.String,
});

export const SyncResultOutput = Schema.Struct({
  pointers: Schema.Array(
    Schema.Struct({
      localAfter: Schema.optional(Schema.String),
      localBefore: Schema.optional(Schema.String),
      pointer: Schema.String,
      remoteAfter: Schema.optional(Schema.String),
      remoteBefore: Schema.optional(Schema.String),
      status: Schema.Literals([
        "diverged",
        "fast-forwarded",
        "merged",
        "pushed",
        "rejected",
        "remote-deleted",
        "up-to-date",
      ]),
    }),
  ),
  remote: Schema.String,
});

export const AutomationViolationOutput = Schema.Struct({
  code: Schema.String,
  field: Schema.optional(Schema.String),
  message: Schema.String,
  remediation: Schema.optional(Schema.String),
  severity: Schema.Literals(["error", "fatal", "warning"]),
  ticketId: Schema.optional(Schema.String),
});

export const AutomationEvaluationOutput = Schema.Struct({
  checkedAt: Schema.String,
  checkedTicketIds: StringList,
  checkedUseCase: Schema.Literals([
    "AutomationEvaluateIssues",
    "AutomationEvaluateQuery",
    "AutomationEvaluateRepository",
  ]),
  repositoryId: Schema.String,
  status: Schema.Literals(["fail", "pass", "warn"]),
  summary: Schema.String,
  violations: Schema.Array(AutomationViolationOutput),
  warnings: StringList,
});
