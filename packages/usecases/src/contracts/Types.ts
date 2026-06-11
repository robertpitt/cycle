import type {
  HistoryPage,
  InitiativeProgress,
  IssueTemplateDocument,
  IssueTemplatePage,
  LabelDefinitionDocument,
  LabelDefinitionPage,
  LinkedRecord,
  MaterializationWarning,
  RecordPage,
  RepositoryStatus,
  SavedViewDocument,
  SavedViewPage,
  TicketDocument,
  TicketDraftDocument,
  TicketPage,
  TicketRevisionDiff,
  TicketSearchPage,
  UserProfileDocument,
  UserProfilePage,
} from "@cycle/database";
import type { SyncResult } from "@cycle/git-db";
import type { Schema } from "effect";
import type {
  AddInitiativeUpdateRequestInput,
  AddLinkedRecordInput,
  ArchiveIssueInput,
  AutomationEvaluateIssuesInput,
  AutomationEvaluateQueryInput,
  AutomationEvaluateRepositoryInput,
  CreateDraftInput,
  CreateIssueInput,
  CreateIssueTemplateInput,
  CreateSavedViewInput,
  DeleteIssueInput,
  EmptyInput,
  IssueDiffInput,
  IssueHistoryInput,
  IssueIdInput,
  IssueRevisionInput,
  LabelDefinitionQuery,
  LabelIdInput,
  RecordsForIssueInput,
  RelationIssueInput,
  RepositoryHistoryInput,
  RepositoryOpenInput,
  RepositoryScoped,
  RestoreIssueInput,
  SavedViewQuery,
  SearchTicketsInput,
  TemplateIdInput,
  TransitionIssueInput,
  UpdateDraftInput,
  UpdateIssueRequestInput,
  UpdateTemplateRequestInput,
  UpdateViewRequestInput,
  UpsertLabelInput,
  UpsertUserInput,
  UserProfileQuery,
  ViewIdInput,
  IssueQuery,
  IssueTemplateQuery,
} from "../schemas/index.ts";

export type UseCaseSource = "api" | "ci" | "cli" | "desktop" | "rpc" | "test" | string;

export type UseCaseActor = {
  readonly email?: string;
  readonly name: string;
  readonly provider?: string;
  readonly type: "agent" | "human" | "import";
};

export type UseCaseMeta = {
  readonly actor?: UseCaseActor;
  readonly deadline?: number;
  readonly dryRun?: boolean;
  readonly idempotencyKey?: string;
  readonly requestId?: string;
  readonly source?: UseCaseSource;
  readonly traceContext?: unknown;
};

export type AutomationViolation = {
  readonly code: string;
  readonly field?: string;
  readonly message: string;
  readonly remediation?: string;
  readonly severity: "error" | "fatal" | "warning";
  readonly ticketId?: string;
};

export type AutomationEvaluation = {
  readonly checkedAt: string;
  readonly checkedTicketIds: ReadonlyArray<string>;
  readonly checkedUseCase:
    | "AutomationEvaluateIssues"
    | "AutomationEvaluateQuery"
    | "AutomationEvaluateRepository";
  readonly repositoryId: string;
  readonly status: "fail" | "pass" | "warn";
  readonly summary: string;
  readonly violations: ReadonlyArray<AutomationViolation>;
  readonly warnings: ReadonlyArray<string>;
};

export type UseCaseDefinitions = {
  readonly RepositoryOpen: {
    readonly input: RepositoryOpenInput;
    readonly success: RepositoryStatus;
  };
  readonly RepositoryClose: {
    readonly input: RepositoryScoped<EmptyInput>;
    readonly success: void;
  };
  readonly RepositoryList: {
    readonly input: EmptyInput;
    readonly success: ReadonlyArray<RepositoryStatus>;
  };
  readonly RepositoryStatusGet: {
    readonly input: RepositoryScoped<EmptyInput>;
    readonly success: RepositoryStatus;
  };
  readonly RepositoryMaterializationWarningsList: {
    readonly input: RepositoryScoped<EmptyInput>;
    readonly success: ReadonlyArray<MaterializationWarning>;
  };
  readonly RepositorySync: {
    readonly input: RepositoryScoped<EmptyInput>;
    readonly success: RepositoryStatus;
  };
  readonly RepositoryPush: {
    readonly input: RepositoryScoped<EmptyInput>;
    readonly success: SyncResult;
  };
  readonly RepositoryHistoryList: {
    readonly input: RepositoryScoped<RepositoryHistoryInput>;
    readonly success: HistoryPage;
  };
  readonly IssueCreate: {
    readonly input: RepositoryScoped<CreateIssueInput>;
    readonly success: TicketDocument;
  };
  readonly IssueGet: {
    readonly input: RepositoryScoped<IssueIdInput>;
    readonly success: TicketDocument | null;
  };
  readonly IssueList: {
    readonly input: RepositoryScoped<IssueQuery>;
    readonly success: TicketPage;
  };
  readonly IssueSearch: {
    readonly input: RepositoryScoped<SearchTicketsInput>;
    readonly success: TicketSearchPage;
  };
  readonly IssueUpdate: {
    readonly input: RepositoryScoped<UpdateIssueRequestInput>;
    readonly success: TicketDocument;
  };
  readonly IssueTransition: {
    readonly input: RepositoryScoped<TransitionIssueInput>;
    readonly success: TicketDocument;
  };
  readonly IssueArchive: {
    readonly input: RepositoryScoped<ArchiveIssueInput>;
    readonly success: TicketDocument;
  };
  readonly IssueRestore: {
    readonly input: RepositoryScoped<RestoreIssueInput>;
    readonly success: TicketDocument;
  };
  readonly IssueDelete: {
    readonly input: RepositoryScoped<DeleteIssueInput>;
    readonly success: TicketDocument;
  };
  readonly IssueHistoryList: {
    readonly input: RepositoryScoped<IssueHistoryInput>;
    readonly success: HistoryPage;
  };
  readonly IssueRevisionGet: {
    readonly input: RepositoryScoped<IssueRevisionInput>;
    readonly success: TicketDocument | null;
  };
  readonly IssueDiff: {
    readonly input: RepositoryScoped<IssueDiffInput>;
    readonly success: TicketRevisionDiff;
  };
  readonly IssueRelationAdd: {
    readonly input: RepositoryScoped<RelationIssueInput>;
    readonly success: TicketDocument;
  };
  readonly IssueRelationRemove: {
    readonly input: RepositoryScoped<RelationIssueInput>;
    readonly success: TicketDocument;
  };
  readonly DraftCreate: {
    readonly input: RepositoryScoped<CreateDraftInput>;
    readonly success: TicketDraftDocument;
  };
  readonly DraftUpdate: {
    readonly input: RepositoryScoped<UpdateDraftInput>;
    readonly success: TicketDraftDocument;
  };
  readonly DraftCommit: {
    readonly input: RepositoryScoped<string>;
    readonly success: TicketDocument;
  };
  readonly CommentAdd: {
    readonly input: RepositoryScoped<{ readonly body: string; readonly issueId: string }>;
    readonly success: LinkedRecord;
  };
  readonly RecordAdd: {
    readonly input: RepositoryScoped<AddLinkedRecordInput>;
    readonly success: LinkedRecord;
  };
  readonly RecordListForIssue: {
    readonly input: RepositoryScoped<RecordsForIssueInput>;
    readonly success: RecordPage;
  };
  readonly InitiativeCreate: {
    readonly input: RepositoryScoped<CreateIssueInput>;
    readonly success: TicketDocument;
  };
  readonly InitiativeProgressGet: {
    readonly input: RepositoryScoped<{ readonly id: string }>;
    readonly success: InitiativeProgress;
  };
  readonly InitiativeUpdateAdd: {
    readonly input: RepositoryScoped<AddInitiativeUpdateRequestInput>;
    readonly success: LinkedRecord;
  };
  readonly LabelList: {
    readonly input: RepositoryScoped<LabelDefinitionQuery>;
    readonly success: LabelDefinitionPage;
  };
  readonly LabelUpsert: {
    readonly input: RepositoryScoped<UpsertLabelInput>;
    readonly success: LabelDefinitionDocument;
  };
  readonly LabelArchive: {
    readonly input: RepositoryScoped<LabelIdInput>;
    readonly success: LabelDefinitionDocument;
  };
  readonly UserGet: {
    readonly input: RepositoryScoped<string>;
    readonly success: UserProfileDocument | null;
  };
  readonly UserList: {
    readonly input: RepositoryScoped<UserProfileQuery>;
    readonly success: UserProfilePage;
  };
  readonly UserUpsert: {
    readonly input: RepositoryScoped<UpsertUserInput>;
    readonly success: UserProfileDocument;
  };
  readonly ViewCreate: {
    readonly input: RepositoryScoped<CreateSavedViewInput>;
    readonly success: SavedViewDocument;
  };
  readonly ViewGet: {
    readonly input: RepositoryScoped<ViewIdInput>;
    readonly success: SavedViewDocument | null;
  };
  readonly ViewList: {
    readonly input: RepositoryScoped<SavedViewQuery>;
    readonly success: SavedViewPage;
  };
  readonly ViewUpdate: {
    readonly input: RepositoryScoped<UpdateViewRequestInput>;
    readonly success: SavedViewDocument;
  };
  readonly ViewDelete: {
    readonly input: RepositoryScoped<ViewIdInput>;
    readonly success: SavedViewDocument;
  };
  readonly TemplateCreate: {
    readonly input: RepositoryScoped<CreateIssueTemplateInput>;
    readonly success: IssueTemplateDocument;
  };
  readonly TemplateGet: {
    readonly input: RepositoryScoped<TemplateIdInput>;
    readonly success: IssueTemplateDocument | null;
  };
  readonly TemplateList: {
    readonly input: RepositoryScoped<IssueTemplateQuery>;
    readonly success: IssueTemplatePage;
  };
  readonly TemplateUpdate: {
    readonly input: RepositoryScoped<UpdateTemplateRequestInput>;
    readonly success: IssueTemplateDocument;
  };
  readonly TemplateArchive: {
    readonly input: RepositoryScoped<TemplateIdInput>;
    readonly success: IssueTemplateDocument;
  };
  readonly AutomationEvaluateRepository: {
    readonly input: AutomationEvaluateRepositoryInput;
    readonly success: AutomationEvaluation;
  };
  readonly AutomationEvaluateIssues: {
    readonly input: AutomationEvaluateIssuesInput;
    readonly success: AutomationEvaluation;
  };
  readonly AutomationEvaluateQuery: {
    readonly input: AutomationEvaluateQueryInput;
    readonly success: AutomationEvaluation;
  };
};

export type UseCaseName = keyof UseCaseDefinitions;
export type UseCaseInput<Name extends UseCaseName> = UseCaseDefinitions[Name]["input"];
export type UseCaseSuccess<Name extends UseCaseName> = UseCaseDefinitions[Name]["success"];

export type CycleUseCase<Name extends UseCaseName = UseCaseName> = {
  readonly input: UseCaseInput<Name>;
  readonly meta?: UseCaseMeta;
  readonly name: Name;
};

export type UseCaseSideEffect = "evaluate" | "push" | "read" | "sync" | "write";
export type UseCaseRepositoryScope = "multi" | "none" | "single";
export type UseCaseIdempotency = "not-supported" | "read-only" | "required" | "supported";

export type UseCaseContract<Name extends UseCaseName = UseCaseName> = {
  readonly aliases: ReadonlyArray<string>;
  readonly category: string;
  readonly description: string;
  readonly failureSchema: Schema.Top;
  readonly idempotency: UseCaseIdempotency;
  readonly inputSchema: Schema.Top;
  readonly name: Name;
  readonly repositoryScope: UseCaseRepositoryScope;
  readonly sideEffect: UseCaseSideEffect;
  readonly successSchema: Schema.Top;
  readonly version: string;
};
