export type ActorType = "agent" | "human" | "import";

export type Actor = {
  readonly email?: string;
  readonly name: string;
  readonly provider?: string;
  readonly type: ActorType;
};

export type ExternalLink = {
  readonly source?: string;
  readonly title?: string;
  readonly url: string;
};

export type UserProfileSource = "import" | "local-profile" | "manual";

export type UserProfileDocument = {
  readonly aliases?: ReadonlyArray<string>;
  readonly avatarUrl?: string;
  readonly createdAt: string;
  readonly disabledAt?: string;
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
  readonly schemaVersion: 1;
  readonly source: UserProfileSource;
  readonly timezone?: string;
  readonly updatedAt: string;
  readonly [key: string]: unknown;
};

export type CreateOrUpdateUserProfileInput = {
  readonly aliases?: ReadonlyArray<string>;
  readonly avatarUrl?: string;
  readonly disabledAt?: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly source?: UserProfileSource;
  readonly timezone?: string;
};

export type UserProfileQuery = {
  readonly cursor?: string;
  readonly disabled?: boolean;
  readonly limit?: number;
  readonly text?: string;
};

export type UserProfilePage = {
  readonly entries: ReadonlyArray<UserProfileDocument>;
  readonly nextCursor?: string;
};

export type LabelDefinitionDocument = {
  readonly archivedAt?: string;
  readonly color: string;
  readonly createdAt: string;
  readonly createdBy: Actor;
  readonly description?: string;
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly [key: string]: unknown;
};

export type UpsertLabelDefinitionInput = {
  readonly color?: string;
  readonly description?: string | null;
  readonly id?: string;
  readonly name: string;
};

export type LabelDefinitionQuery = {
  readonly archived?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
  readonly text?: string;
};

export type LabelDefinitionPage = {
  readonly entries: ReadonlyArray<LabelDefinitionDocument>;
  readonly nextCursor?: string;
};

export type SavedViewKind = "board" | "list";

export type SavedViewGroupBy =
  | "assignee"
  | "dueDate"
  | "label"
  | "none"
  | "parent"
  | "priority"
  | "status";

export type SavedViewSort = {
  readonly direction?: "asc" | "desc";
  readonly field?: "createdAt" | "dueDate" | "priority" | "title" | "updatedAt";
};

export type SavedViewDisplay = {
  readonly density?: "comfortable" | "compact";
  readonly properties?: ReadonlyArray<
    "assignee" | "dueDate" | "estimate" | "labels" | "priority" | "status"
  >;
};

export type SavedViewDocument = {
  readonly builtIn?: boolean;
  readonly createdAt: string;
  readonly createdBy: Actor;
  readonly description?: string;
  readonly display?: SavedViewDisplay;
  readonly groupBy: SavedViewGroupBy;
  readonly id: string;
  readonly kind: SavedViewKind;
  readonly name: string;
  readonly ownerUserId?: string;
  readonly pinned: boolean;
  readonly query: TicketQuery;
  readonly repositoryScope?: "current-repository";
  readonly schemaVersion: 1;
  readonly sort?: SavedViewSort;
  readonly updatedAt: string;
  readonly [key: string]: unknown;
};

export type CreateSavedViewInput = {
  readonly description?: string;
  readonly display?: SavedViewDisplay;
  readonly groupBy?: SavedViewGroupBy;
  readonly kind?: SavedViewKind;
  readonly name: string;
  readonly pinned?: boolean;
  readonly query?: TicketQuery;
  readonly sort?: SavedViewSort;
};

export type UpdateSavedViewPatch = Partial<CreateSavedViewInput> & {
  readonly builtIn?: boolean;
};

export type SavedViewQuery = {
  readonly cursor?: string;
  readonly kind?: SavedViewKind;
  readonly limit?: number;
  readonly pinned?: boolean;
  readonly text?: string;
};

export type SavedViewPage = {
  readonly entries: ReadonlyArray<SavedViewDocument>;
  readonly nextCursor?: string;
};

export type IssueTemplateKind = "bug" | "feature" | "implementation" | "initiative" | "qa";

export type IssueTemplateDefaults = Partial<CreateTicketInput>;

export type IssueTemplateDocument = {
  readonly active: boolean;
  readonly bodyTemplate: string;
  readonly childTemplates?: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly createdBy: Actor;
  readonly defaults?: IssueTemplateDefaults;
  readonly description?: string;
  readonly id: string;
  readonly kind: IssueTemplateKind;
  readonly name: string;
  readonly schemaVersion: 1;
  readonly titleTemplate: string;
  readonly updatedAt: string;
  readonly [key: string]: unknown;
};

export type CreateIssueTemplateInput = {
  readonly active?: boolean;
  readonly bodyTemplate: string;
  readonly defaults?: IssueTemplateDefaults;
  readonly description?: string;
  readonly kind: IssueTemplateKind;
  readonly name: string;
  readonly titleTemplate: string;
};

export type UpdateIssueTemplatePatch = Partial<CreateIssueTemplateInput>;

export type IssueTemplateQuery = {
  readonly active?: boolean;
  readonly cursor?: string;
  readonly kind?: IssueTemplateKind;
  readonly limit?: number;
  readonly text?: string;
};

export type IssueTemplatePage = {
  readonly entries: ReadonlyArray<IssueTemplateDocument>;
  readonly nextCursor?: string;
};

export type InitiativeStatus = "at-risk" | "blocked" | "complete" | "on-track";

export type InitiativeUpdatePayload = {
  readonly blockers?: ReadonlyArray<string>;
  readonly nextSteps?: ReadonlyArray<string>;
  readonly progressNote?: string;
  readonly status: InitiativeStatus;
  readonly summary: string;
};

export type InitiativeProgress = {
  readonly completedEstimate: number;
  readonly completedIssues: number;
  readonly estimateTotal: number;
  readonly issueTotal: number;
  readonly statusCounts: Readonly<Record<string, number>>;
};

export type IssueRelationType = "blocked-by" | "blocking" | "duplicate" | "related";

export type IssueRelation = {
  readonly issueId: string;
  readonly type: IssueRelationType;
};

export type IssueFrontmatter = {
  readonly agentProvenance?: Readonly<Record<string, unknown>>;
  readonly archivedAt?: string | null;
  readonly archivedBy?: Actor | null;
  readonly assignee?: string | null;
  readonly children?: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly createdBy: Actor;
  readonly deletedAt?: string | null;
  readonly deletedBy?: Actor | null;
  readonly duplicateOf?: string | null;
  readonly dueDate?: string | null;
  readonly estimate?: number | string | null;
  readonly externalLinks?: ReadonlyArray<ExternalLink>;
  readonly id: string;
  readonly labels?: ReadonlyArray<string>;
  readonly parent?: string | null;
  readonly planAcceptedAt?: string;
  readonly planAcceptedBy?: Actor;
  readonly planningNotRequired?: boolean;
  readonly priority: string;
  readonly relations?: ReadonlyArray<IssueRelation>;
  readonly repository?: string;
  readonly status: string;
  readonly title: string;
  readonly type: string;
  readonly updatedAt: string;
  readonly [key: string]: unknown;
};

export type TicketDocument = {
  readonly archivedAt?: string;
  readonly assignee?: string;
  readonly body: string;
  readonly bodyFormat: "markdown";
  readonly createdBy: string;
  readonly deletedAt?: string;
  readonly dueDate?: string;
  readonly estimate?: number | string;
  readonly frontmatter: IssueFrontmatter;
  readonly id: string;
  readonly labels?: ReadonlyArray<string>;
  readonly parent: string;
  readonly priority: string;
  readonly relations?: ReadonlyArray<IssueRelation>;
  readonly repository?: string;
  readonly repositoryId?: string;
  readonly schemaVersion: 1;
  readonly status: string;
  readonly title: string;
  readonly type: string;
  readonly updatedDate: string;
};

export type LinkedRecord = {
  readonly createdAt: string;
  readonly createdBy: Actor;
  readonly createdDate: string;
  readonly id: string;
  readonly issueId: string;
  readonly payload: unknown;
  readonly recordType: string;
  readonly schemaVersion: 1;
};

export type RepositoryInput = {
  readonly displayName?: string;
  readonly gitDir?: string;
  readonly metadata?: RepositoryMetadata;
  readonly pollIntervalMs?: false | number;
  readonly repositoryId: string;
  readonly store: import("@cycle/git-db").Store.StoreServiceShape;
  readonly syncOnOpen?: boolean;
  readonly worktreePath?: string;
};

export type RepositoryRemote = {
  readonly name: string;
  readonly url?: string;
};

export type RepositoryMetadata = {
  readonly currentBranch?: string;
  readonly defaultRemote?: string;
  readonly defaultRemoteUrl?: string;
  readonly gitDir?: string;
  readonly inspectedAt?: string;
  readonly remotes: ReadonlyArray<RepositoryRemote>;
  readonly worktreePath?: string;
};

export type CycleRepositoryMetadata = {
  readonly createdAt: string;
  readonly schemaVersion: 1;
  readonly ticketIdFormat: "prefix-base36-5+";
  readonly ticketPrefix: string;
  readonly updatedAt: string;
};

export type RepositoryStatusValue = "degraded" | "empty" | "failed" | "ready" | "syncing";

export type RepositoryStatus = {
  readonly activeGeneration: number;
  readonly activeSnapshotId: string | null;
  readonly cycleMetadata?: CycleRepositoryMetadata;
  readonly lastSyncCompletedAt?: string;
  readonly lastSyncError?: string;
  readonly lastSyncStartedAt?: string;
  readonly metadata?: RepositoryMetadata;
  readonly repositoryId: string;
  readonly status: RepositoryStatusValue;
  readonly warningCount: number;
};

export type CreateTicketInput = {
  readonly assignee?: string | null;
  readonly body?: string;
  readonly dueDate?: string | null;
  readonly estimate?: number | string | null;
  readonly externalLinks?: ReadonlyArray<ExternalLink>;
  readonly labels?: ReadonlyArray<string>;
  readonly parent?: string | null;
  readonly planningNotRequired?: boolean;
  readonly priority?: string;
  readonly repository?: string;
  readonly status?: string;
  readonly title: string;
  readonly type?: string;
};

export type UpdateTicketPatch = {
  readonly body?: string;
  readonly frontmatter?: Partial<IssueFrontmatter> & Readonly<Record<string, unknown>>;
  readonly message?: string;
};

export type TransitionTicketInput = {
  readonly reason?: string;
  readonly status: string;
};

export type ArchiveTicketInput = {
  readonly reason?: string;
};

export type DeleteTicketInput = {
  readonly reason?: string;
};

export type RestoreTicketInput = {
  readonly reason?: string;
};

export type AddCommentInput = {
  readonly body: string;
};

export type AddRecordInput<TPayload = unknown> = {
  readonly payload: TPayload;
  readonly recordType: string;
  readonly userVisible?: boolean;
};

export type TicketQuery = {
  readonly archived?: boolean;
  readonly assignee?: string | null;
  readonly assigneeIn?: ReadonlyArray<string>;
  readonly blocked?: boolean;
  readonly cursor?: string;
  readonly deleted?: boolean;
  readonly dueAfter?: string;
  readonly dueBefore?: string;
  readonly estimate?: number | string;
  readonly hasDueDate?: boolean;
  readonly hasEstimate?: boolean;
  readonly hasAssignee?: boolean;
  readonly hasLabels?: boolean;
  readonly label?: string;
  readonly labelIn?: ReadonlyArray<string>;
  readonly limit?: number;
  readonly orderBy?: "createdAt" | "dueDate" | "priority" | "title" | "updatedAt";
  readonly orderDirection?: "asc" | "desc";
  readonly parent?: string | null;
  readonly priority?: string;
  readonly priorityIn?: ReadonlyArray<string>;
  readonly relation?: { readonly issueId?: string; readonly type?: IssueRelationType };
  readonly repositoryIds?: ReadonlyArray<string>;
  readonly staleBefore?: string;
  readonly status?: string;
  readonly statusIn?: ReadonlyArray<string>;
  readonly text?: string;
  readonly type?: string;
  readonly updatedAfter?: string;
  readonly updatedBefore?: string;
};

export type TicketPage = {
  readonly entries: ReadonlyArray<TicketDocument>;
  readonly nextCursor?: string;
};

export type SearchTicketsQuery = {
  readonly cursor?: string;
  readonly limit?: number;
  readonly repositoryIds?: ReadonlyArray<string>;
  readonly text: string;
};

export type TicketSearchResult = {
  readonly matchedFields: ReadonlyArray<"body" | "comment" | "title">;
  readonly ticket: TicketDocument;
};

export type TicketSearchPage = {
  readonly entries: ReadonlyArray<TicketSearchResult>;
  readonly nextCursor?: string;
};

export type RecordQuery = {
  readonly cursor?: string;
  readonly limit?: number;
  readonly recordType?: string;
};

export type RecordPage = {
  readonly entries: ReadonlyArray<LinkedRecord>;
  readonly nextCursor?: string;
};

export type RepositoryHistoryQuery = {
  readonly cursor?: string;
  readonly limit?: number;
  readonly ticketId?: string;
};

export type HistoryCommit = {
  readonly authorEmail?: string;
  readonly authorName?: string;
  readonly changedTicketIds: ReadonlyArray<string>;
  readonly committedAt?: string;
  readonly message?: string;
  readonly parentIds: ReadonlyArray<string>;
  readonly sequence: number;
  readonly snapshotId: string;
  readonly warningCount: number;
};

export type HistoryPage = {
  readonly entries: ReadonlyArray<HistoryCommit>;
  readonly nextCursor?: string;
};

export type MaterializationWarning = {
  readonly createdAt: string;
  readonly message: string;
  readonly objectId?: string;
  readonly objectType: string;
  readonly path: string;
  readonly reason: string;
  readonly repositoryId: string;
  readonly snapshotId: string;
};

export type CommitOptions = {
  readonly message?: string;
};

export type TicketRevisionDiffFile = {
  readonly language?: string;
  readonly newContent: string;
  readonly newPath: string;
  readonly oldContent: string;
  readonly oldPath: string;
};

export type TicketRevisionMetadataChange = {
  readonly after: unknown;
  readonly before: unknown;
  readonly field: string;
};

export type TicketRevisionDiff = {
  readonly files: ReadonlyArray<TicketRevisionDiffFile>;
  readonly fromSnapshotId: string;
  readonly metadataChanges: ReadonlyArray<TicketRevisionMetadataChange>;
  readonly ticketId: string;
  readonly toSnapshotId: string;
};

export type CreateTicketDraftInput = CreateTicketInput & {
  readonly source?: unknown;
};

export type TicketDraftDocument = {
  readonly createdAt: string;
  readonly createdBy: Actor;
  readonly id: string;
  readonly input: CreateTicketDraftInput;
  readonly schemaVersion: 1;
  readonly status: "committed" | "open";
  readonly updatedAt: string;
};

export type UpdateTicketDraftInput = {
  readonly body?: string;
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly status?: string;
};
