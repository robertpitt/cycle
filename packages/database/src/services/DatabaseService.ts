import { Event as GitDbEvent, type Store as GitDbStore, type SyncResult } from "@cycle/git-db";
import { Context, Effect, Layer } from "effect";
import {
  CURRENT_SCHEMA_VERSION,
  defaultIssueBody,
  deriveInboxItemId,
  extractMentionTags,
  makeFrontmatter,
  makeIssueFrontmatter,
  makeTicketDocument,
  normalizeKey,
  stripUndefined,
  validateNewTicketType,
  updatedDateKey,
  updateTicketDocument,
  type Actor,
  type AddCommentInput,
  type AddRecordInput,
  type ArchiveTicketInput,
  type CommitOptions,
  type CreateIssueTemplateInput,
  type CreateOrUpdateUserProfileInput,
  type CreateSavedViewInput,
  type CreateTicketDraftInput,
  type CreateTicketInput,
  type CycleRepositoryMetadata,
  type DeleteTicketInput,
  type HistoryPage,
  type InboxItem,
  type InboxMutationInput,
  type InboxMutationResult,
  type InboxPage,
  type InboxQuery,
  type InboxReason,
  type InboxSummary,
  type InitiativeProgress,
  type InitiativeUpdatePayload,
  type IssueTemplateDocument,
  type IssueTemplatePage,
  type IssueTemplateQuery,
  type IssueRelation,
  type IssueFrontmatter,
  type LabelDefinitionDocument,
  type LabelDefinitionPage,
  type LabelDefinitionQuery,
  type LinkedRecord,
  type MaterializationWarning,
  type RecordPage,
  type RecordQuery,
  type RepositoryHistoryQuery,
  type RepositoryInput,
  type RepositoryStatus,
  type RestoreTicketInput,
  type SavedViewDocument,
  type SavedViewPage,
  type SavedViewQuery,
  type SearchTicketsQuery,
  type TicketDraftDocument,
  type TicketDocument,
  type TicketPage,
  type TicketQuery,
  type TicketRevisionDiff,
  type TicketRevisionMetadataChange,
  type TicketSearchPage,
  type TransitionTicketInput,
  type UpdateIssueTemplatePatch,
  type UpdateSavedViewPatch,
  type UpdateTicketDraftInput,
  type UpdateTicketPatch,
  type UpsertLabelDefinitionInput,
  type UserProfileDocument,
  type UserProfilePage,
  type UserProfileQuery,
} from "../domain/index.ts";
import {
  ConsistencyError,
  type DatabaseFailure,
  EventFoldError,
  MaterializationError,
  RepositoryNotFoundError,
  SqliteError,
  StorageError,
  ValidationError,
} from "../errors/index.ts";
import { Projection } from "../store/Projection.ts";
import { DatabaseIdGenerator, type DatabaseIdGeneratorShape } from "./DatabaseIdGenerator.ts";
import {
  DatabaseIdentity,
  DatabaseIdentityTest,
  type DatabaseIdentityShape,
} from "./DatabaseIdentity.ts";
import { DatabaseIdGeneratorDeterministic } from "./DatabaseIdGenerator.ts";

type RepositoryRuntime = {
  readonly cycleMetadata?: CycleRepositoryMetadata;
  readonly displayName: string;
  readonly gitDir?: string;
  readonly repositoryId: string;
  readonly store: GitDbStore.StoreServiceShape;
  readonly worktreePath?: string;
};

type CommitChange = {
  readonly changeType: "added" | "deleted" | "modified";
  readonly objectId?: string;
  readonly objectType: string;
  readonly path: string;
  readonly ticketId?: string;
};

type DatabaseEventPayload =
  | {
      readonly op: "repository.metadata.set";
      readonly value: CycleRepositoryMetadata;
    }
  | {
      readonly op: "ticket.create" | "ticket.replace";
      readonly value: TicketDocument;
    }
  | {
      readonly field: keyof IssueFrontmatter | "body";
      readonly op: "ticket.update";
      readonly value: unknown;
    }
  | {
      readonly op: "ticket.archive" | "ticket.delete" | "ticket.restore";
      readonly reason?: string;
    }
  | {
      readonly op: "record.add";
      readonly value: LinkedRecord;
    }
  | {
      readonly op: "draft.create" | "draft.update" | "draft.commit";
      readonly value: TicketDraftDocument;
    }
  | {
      readonly op: "user.upsert";
      readonly value: UserProfileDocument;
    }
  | {
      readonly op: "label.upsert";
      readonly value: LabelDefinitionDocument;
    }
  | {
      readonly op: "view.upsert";
      readonly value: SavedViewDocument;
    }
  | {
      readonly op: "view.delete";
    }
  | {
      readonly op: "template.upsert";
      readonly value: IssueTemplateDocument;
    };

type FoldedEvents = {
  readonly changedLabels: Set<string>;
  readonly changedRecords: Set<string>;
  readonly changedTemplates: Set<string>;
  readonly changedTickets: Set<string>;
  readonly changedUsers: Set<string>;
  readonly changedViews: Set<string>;
  readonly commitChanges: Array<{
    readonly changes: ReadonlyArray<CommitChange>;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }>;
  cycleMetadata?: CycleRepositoryMetadata;
  readonly deletedLabels: Set<string>;
  readonly deletedRecords: Set<string>;
  readonly deletedTemplates: Set<string>;
  readonly deletedTickets: Set<string>;
  readonly deletedUsers: Set<string>;
  readonly deletedViews: Set<string>;
  readonly drafts: Map<string, TicketDraftDocument>;
  readonly inboxSources: Array<InboxSourceEvent>;
  readonly labels: Map<string, LabelDefinitionDocument>;
  readonly nonAdditiveEvents: Array<{
    readonly path: string;
    readonly reason: "event-deleted" | "event-modified";
    readonly snapshotId: string;
  }>;
  readonly records: Map<string, LinkedRecord>;
  readonly templates: Map<string, IssueTemplateDocument>;
  readonly tickets: Map<string, TicketDocument>;
  readonly users: Map<string, UserProfileDocument>;
  readonly views: Map<string, SavedViewDocument>;
  readonly warnings: ReadonlyArray<MaterializationWarning>;
};

type EventContext = {
  readonly actor?: Actor;
  readonly path: string;
  readonly snapshotId: string;
  readonly timestamp: string;
};

type InboxSourceEvent =
  | {
      readonly actor?: Actor;
      readonly after: TicketDocument;
      readonly before: TicketDocument | null;
      readonly eventPath: string;
      readonly field?: keyof IssueFrontmatter | "body";
      readonly op: "ticket.create" | "ticket.replace" | "ticket.update";
      readonly sequence: number;
      readonly snapshotId: string;
      readonly timestamp: string;
      readonly ticketId: string;
    }
  | {
      readonly actor?: Actor;
      readonly eventPath: string;
      readonly op: "record.add";
      readonly record: LinkedRecord;
      readonly sequence: number;
      readonly snapshotId: string;
      readonly timestamp: string;
      readonly ticket: TicketDocument | null;
    };

type InboxSourceEventInput = InboxSourceEvent extends infer Source
  ? Source extends InboxSourceEvent
    ? Omit<Source, "sequence">
    : never
  : never;

type GitDbSnapshot = {
  readonly author?: GitDbIdentity;
  readonly committer?: GitDbIdentity;
  readonly createdAt?: string;
  readonly id: string;
  readonly message?: string;
  readonly parents: ReadonlyArray<string>;
  readonly root: string;
};

type GitDbIdentity = {
  readonly date: string;
  readonly email: string;
  readonly name: string;
  readonly timestamp: number;
  readonly timezone: string;
};

export type DatabaseServiceOptions = {
  readonly projectionPath?: string;
};

type MaterializationTrace = (
  message: string,
  data?: Readonly<Record<string, unknown>>,
) => Effect.Effect<void>;

export type DatabaseServiceShape = {
  readonly addComment: (
    repositoryId: string,
    ticketId: string,
    input: AddCommentInput,
    options?: CommitOptions,
  ) => Effect.Effect<LinkedRecord, DatabaseFailure>;
  readonly addIssueRelation: (
    repositoryId: string,
    ticketId: string,
    relation: IssueRelation,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly addRecord: <TPayload = unknown>(
    repositoryId: string,
    ticketId: string,
    input: AddRecordInput<TPayload>,
    options?: CommitOptions,
  ) => Effect.Effect<LinkedRecord, DatabaseFailure>;
  readonly archiveTicket: (
    repositoryId: string,
    ticketId: string,
    input?: ArchiveTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly close: () => Effect.Effect<void>;
  readonly commitDraft: (
    repositoryId: string,
    draftId: string,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly createDraft: (
    repositoryId: string,
    input: CreateTicketDraftInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDraftDocument, DatabaseFailure>;
  readonly createTicket: (
    repositoryId: string,
    input: CreateTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly deleteTicket: (
    repositoryId: string,
    ticketId: string,
    input?: DeleteTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly getTicket: (
    repositoryId: string,
    ticketId: string,
  ) => Effect.Effect<TicketDocument | null, DatabaseFailure>;
  readonly listRepositories: () => Effect.Effect<ReadonlyArray<RepositoryStatus>, DatabaseFailure>;
  readonly createInitiative: (
    repositoryId: string,
    input: CreateTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly createTemplate: (
    repositoryId: string,
    input: CreateIssueTemplateInput,
    options?: CommitOptions,
  ) => Effect.Effect<IssueTemplateDocument, DatabaseFailure>;
  readonly createView: (
    repositoryId: string,
    input: CreateSavedViewInput,
    options?: CommitOptions,
  ) => Effect.Effect<SavedViewDocument, DatabaseFailure>;
  readonly getTemplate: (
    repositoryId: string,
    templateId: string,
  ) => Effect.Effect<IssueTemplateDocument | null, DatabaseFailure>;
  readonly getUser: (
    repositoryId: string,
    userId: string,
  ) => Effect.Effect<UserProfileDocument | null, DatabaseFailure>;
  readonly getView: (
    repositoryId: string,
    viewId: string,
  ) => Effect.Effect<SavedViewDocument | null, DatabaseFailure>;
  readonly archiveInboxItems: (
    input: InboxMutationInput,
  ) => Effect.Effect<InboxMutationResult, DatabaseFailure>;
  readonly inboxSummary: (query: InboxQuery) => Effect.Effect<InboxSummary, DatabaseFailure>;
  readonly initiativeProgress: (
    repositoryId: string,
    initiativeId: string,
  ) => Effect.Effect<InitiativeProgress, DatabaseFailure>;
  readonly listLabels: (
    repositoryId: string,
    query?: LabelDefinitionQuery,
  ) => Effect.Effect<LabelDefinitionPage, DatabaseFailure>;
  readonly listTemplates: (
    repositoryId: string,
    query?: IssueTemplateQuery,
  ) => Effect.Effect<IssueTemplatePage, DatabaseFailure>;
  readonly listInbox: (query: InboxQuery) => Effect.Effect<InboxPage, DatabaseFailure>;
  readonly listTickets: (query?: TicketQuery) => Effect.Effect<TicketPage, DatabaseFailure>;
  readonly listUsers: (
    repositoryId: string,
    query?: UserProfileQuery,
  ) => Effect.Effect<UserProfilePage, DatabaseFailure>;
  readonly listViews: (
    repositoryId: string,
    query?: SavedViewQuery,
  ) => Effect.Effect<SavedViewPage, DatabaseFailure>;
  readonly materializationWarnings: (
    repositoryId: string,
  ) => Effect.Effect<ReadonlyArray<MaterializationWarning>, DatabaseFailure>;
  readonly markInboxRead: (
    input: InboxMutationInput,
  ) => Effect.Effect<InboxMutationResult, DatabaseFailure>;
  readonly markInboxUnread: (
    input: InboxMutationInput,
  ) => Effect.Effect<InboxMutationResult, DatabaseFailure>;
  readonly openRepository: (
    input: RepositoryInput,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly repositoryHistory: (
    repositoryId: string,
    query?: RepositoryHistoryQuery,
  ) => Effect.Effect<HistoryPage, DatabaseFailure>;
  readonly pushRepository: (repositoryId: string) => Effect.Effect<SyncResult, DatabaseFailure>;
  readonly repositoryStatus: (
    repositoryId: string,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly removeIssueRelation: (
    repositoryId: string,
    ticketId: string,
    relation: IssueRelation,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly restoreTicket: (
    repositoryId: string,
    ticketId: string,
    input?: RestoreTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly searchTickets: (
    query: SearchTicketsQuery,
  ) => Effect.Effect<TicketSearchPage, DatabaseFailure>;
  readonly syncRepository: (
    repositoryId: string,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly ticketComments: (
    repositoryId: string,
    ticketId: string,
    query?: RecordQuery,
  ) => Effect.Effect<RecordPage, DatabaseFailure>;
  readonly ticketHistory: (
    repositoryId: string,
    ticketId: string,
    query?: RepositoryHistoryQuery,
  ) => Effect.Effect<HistoryPage, DatabaseFailure>;
  readonly ticketDiff: (
    repositoryId: string,
    ticketId: string,
    fromSnapshotId: string,
    toSnapshotId: string,
  ) => Effect.Effect<TicketRevisionDiff, DatabaseFailure>;
  readonly ticketRevision: (
    repositoryId: string,
    ticketId: string,
    snapshotId: string,
  ) => Effect.Effect<TicketDocument | null, DatabaseFailure>;
  readonly ticketRecords: (
    repositoryId: string,
    ticketId: string,
    query?: RecordQuery,
  ) => Effect.Effect<RecordPage, DatabaseFailure>;
  readonly transitionTicket: (
    repositoryId: string,
    ticketId: string,
    input: TransitionTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly updateDraft: (
    repositoryId: string,
    draftId: string,
    input: UpdateTicketDraftInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDraftDocument, DatabaseFailure>;
  readonly updateTicket: (
    repositoryId: string,
    ticketId: string,
    patch: UpdateTicketPatch,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly addInitiativeUpdate: (
    repositoryId: string,
    initiativeId: string,
    input: InitiativeUpdatePayload,
    options?: CommitOptions,
  ) => Effect.Effect<LinkedRecord, DatabaseFailure>;
  readonly archiveLabel: (
    repositoryId: string,
    labelId: string,
    options?: CommitOptions,
  ) => Effect.Effect<LabelDefinitionDocument, DatabaseFailure>;
  readonly archiveTemplate: (
    repositoryId: string,
    templateId: string,
    options?: CommitOptions,
  ) => Effect.Effect<IssueTemplateDocument, DatabaseFailure>;
  readonly deleteView: (
    repositoryId: string,
    viewId: string,
    options?: CommitOptions,
  ) => Effect.Effect<SavedViewDocument, DatabaseFailure>;
  readonly updateTemplate: (
    repositoryId: string,
    templateId: string,
    patch: UpdateIssueTemplatePatch,
    options?: CommitOptions,
  ) => Effect.Effect<IssueTemplateDocument, DatabaseFailure>;
  readonly updateView: (
    repositoryId: string,
    viewId: string,
    patch: UpdateSavedViewPatch,
    options?: CommitOptions,
  ) => Effect.Effect<SavedViewDocument, DatabaseFailure>;
  readonly upsertLabel: (
    repositoryId: string,
    input: UpsertLabelDefinitionInput,
    options?: CommitOptions,
  ) => Effect.Effect<LabelDefinitionDocument, DatabaseFailure>;
  readonly upsertUser: (
    repositoryId: string,
    input: CreateOrUpdateUserProfileInput,
    options?: CommitOptions,
  ) => Effect.Effect<UserProfileDocument, DatabaseFailure>;
};

export class DatabaseService extends Context.Service<DatabaseService, DatabaseServiceShape>()(
  "@cycle/database/DatabaseService",
) {}

const DEFAULT_POINTER = "main";
const DEFAULT_TICKET_PREFIX = "UKN";
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const TICKET_ID_PATTERN = /^[A-Z0-9]{2,5}-[0-9A-Z]{5,}$/u;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isRemotePushRejection = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;

  const record = error as {
    readonly _tag?: unknown;
    readonly message?: unknown;
    readonly stderr?: unknown;
  };

  if (record._tag !== "RemotePushError") return false;

  const text = `${String(record.message ?? "")}\n${String(record.stderr ?? "")}`;

  return /fetch first|non-fast-forward|remote contains work|stale info|updates were rejected/iu.test(
    text,
  );
};

export const makeDatabaseService = (
  identity: DatabaseIdentityShape,
  ids: DatabaseIdGeneratorShape,
  options: DatabaseServiceOptions = {},
): DatabaseServiceShape => {
  const projection = new Projection(options.projectionPath);
  const repositories = new Map<string, RepositoryRuntime>();
  let closed = false;
  const log = (
    repositoryId: string | undefined,
    message: string,
    data?: Readonly<Record<string, unknown>>,
  ): Effect.Effect<void> =>
    Effect.logInfo(message).pipe(
      Effect.annotateLogs({
        ...(data === undefined ? {} : data),
        ...(repositoryId === undefined ? {} : { repositoryId }),
        service: "@cycle/database",
      }),
    );
  const repositoryState = (status: RepositoryStatus): string =>
    status.activeSnapshotId === null ? "no_snapshot" : status.status;

  const getRepository = (repositoryId: string): Effect.Effect<RepositoryRuntime, DatabaseFailure> =>
    Effect.sync(() => repositories.get(repositoryId)).pipe(
      Effect.flatMap((repository) =>
        repository === undefined
          ? Effect.fail(
              new RepositoryNotFoundError({
                repositoryId: repositoryId,
                message: `Repository is not open: ${repositoryId}`,
              }),
            )
          : Effect.succeed(repository),
      ),
    );

  const pushStore = (repository: RepositoryRuntime): Effect.Effect<SyncResult, unknown> =>
    repository.store
      .sync({
        mode: "push",
        onDiverged: "error",
        pointers: [DEFAULT_POINTER],
      })
      .pipe(
        Effect.catch((error) =>
          isRemotePushRejection(error)
            ? log(repository.repositoryId, "repository push rejected: rebasing before retry", {
                error: errorMessage(error),
              }).pipe(
                Effect.andThen(
                  repository.store.sync({
                    mode: "full",
                    onDiverged: "rebase",
                    pointers: [DEFAULT_POINTER],
                  }),
                ),
              )
            : Effect.fail(error),
        ),
      );

  const setRepositoryCycleMetadata = (
    repository: RepositoryRuntime,
    cycleMetadata: CycleRepositoryMetadata | undefined,
  ): void => {
    repositories.set(repository.repositoryId, {
      ...repository,
      cycleMetadata,
    });
  };

  const materializeSnapshotDelta = (
    repository: RepositoryRuntime,
    previousSnapshotId: string | null,
    currentSnapshotId: string,
  ): Effect.Effect<RepositoryStatus, DatabaseFailure> =>
    Effect.gen(function* () {
      const repositoryId = repository.repositoryId;
      const materializationStartedAt = performance.now();
      const materialization = yield* buildMaterialization(
        projection,
        repository,
        previousSnapshotId,
        currentSnapshotId,
        (message, data) => log(repositoryId, message, data),
      ).pipe(
        Effect.mapError(
          (error) =>
            new MaterializationError({
              repositoryId: repositoryId,
              message: "failed to build materialization plan",
              cause: error,
            }),
        ),
      );

      yield* log(repositoryId, "sync materialization plan built", {
        buildMs: elapsedMs(materializationStartedAt),
        commitChanges: materialization.commitChanges.length,
        commits: materialization.commits.length,
        deletedRecords: materialization.deletedRecords.length,
        deletedTickets: materialization.deletedTickets.length,
        fullRebuild: materialization.fullRebuild,
        inboxItems: materialization.inboxItems.length,
        previousSnapshotId,
        records: materialization.records.length,
        snapshotId: currentSnapshotId,
        tickets: materialization.tickets.length,
        warnings: materialization.warnings.length,
      });

      const applyStartedAt = performance.now();
      const status = yield* sqlite("apply materialization", () =>
        projection.transaction(() => {
          if (materialization.fullRebuild) {
            projection.clearRepositoryProjection(repositoryId);
          }

          for (const ticketId of materialization.deletedTickets) {
            projection.deleteTicket(repositoryId, ticketId);
          }
          for (const recordId of materialization.deletedRecords) {
            projection.deleteRecord(repositoryId, recordId);
          }
          for (const userId of materialization.deletedUsers) {
            projection.deleteUser(repositoryId, userId);
          }
          for (const labelId of materialization.deletedLabels) {
            projection.deleteLabel(repositoryId, labelId);
          }
          for (const viewId of materialization.deletedViews) {
            projection.deleteView(repositoryId, viewId);
          }
          for (const templateId of materialization.deletedTemplates) {
            projection.deleteTemplate(repositoryId, templateId);
          }
          for (const ticket of materialization.tickets) {
            projection.upsertTicket({
              path: ticket.path,
              repositoryId,
              snapshotId: currentSnapshotId,
              ticket: ticket.value,
            });
          }
          for (const user of materialization.users) {
            projection.upsertUser({
              repositoryId,
              snapshotId: currentSnapshotId,
              user: user.value,
            });
          }
          for (const label of materialization.labels) {
            projection.upsertLabel({
              label: label.value,
              repositoryId,
              snapshotId: currentSnapshotId,
            });
          }
          for (const view of materialization.views) {
            projection.upsertView({
              repositoryId,
              snapshotId: currentSnapshotId,
              view: view.value,
            });
          }
          for (const template of materialization.templates) {
            projection.upsertTemplate({
              repositoryId,
              snapshotId: currentSnapshotId,
              template: template.value,
            });
          }
          for (const record of materialization.records) {
            if (projection.ticketVisible(repositoryId, record.value.issueId)) {
              projection.upsertRecord({
                record: record.value,
                repositoryId,
                snapshotId: currentSnapshotId,
              });
            }
          }
          for (const commit of materialization.commits) {
            projection.upsertCommit(commit);
          }
          for (const commitChange of materialization.commitChanges) {
            projection.replaceCommitChanges(commitChange);
          }
          for (const warning of materialization.warnings) {
            projection.addWarning(warning);
          }
          for (const inboxItem of materialization.inboxItems) {
            projection.upsertInboxItem(inboxItem);
          }

          projection.setCycleRepositoryMetadata(repositoryId, materialization.cycleMetadata);
          const status = projection.activateSnapshot({
            completedAt: nowIso(),
            repositoryId,
            snapshotId: currentSnapshotId,
          });
          setRepositoryCycleMetadata(repository, materialization.cycleMetadata);
          return status;
        }),
      );
      yield* log(repositoryId, "sync completed", {
        activeGeneration: status.activeGeneration,
        applyMs: elapsedMs(applyStartedAt),
        repositoryState: repositoryState(status),
        snapshotId: status.activeSnapshotId,
        warningCount: status.warningCount,
      });
      return status;
    });

  const syncRepository = (repositoryId: string): Effect.Effect<RepositoryStatus, DatabaseFailure> =>
    Effect.gen(function* () {
      const repository = yield* getRepository(repositoryId);
      const now = nowIso();

      yield* sqlite("mark sync started", () => projection.markSyncStarted(repositoryId, now));
      yield* log(repositoryId, "sync started", {
        displayName: repository.displayName,
        gitDir: repository.gitDir,
        worktreePath: repository.worktreePath,
      });

      return yield* Effect.gen(function* () {
        const current = yield* storage(
          "read current snapshot",
          repository.store.currentSnapshotForPointer(DEFAULT_POINTER),
        );
        const previous = projection.repositoryStatus(repositoryId).activeSnapshotId;

        if (current === null) {
          yield* log(repositoryId, "sync found no current GitDB snapshot", {
            previousSnapshotId: previous,
          });
          const status = yield* sqlite("clear projection for missing GitDB snapshot", () =>
            projection.transaction(() => {
              projection.clearRepositoryProjection(repositoryId);
              projection.clearCycleRepositoryMetadata(repositoryId);
              return projection.activateSnapshot({
                completedAt: nowIso(),
                repositoryId,
                snapshotId: null,
              });
            }),
          );
          setRepositoryCycleMetadata(repository, undefined);
          yield* log(repositoryId, "sync cleared projection for missing GitDB snapshot", {
            activeGeneration: status.activeGeneration,
            activeSnapshotId: status.activeSnapshotId,
            repositoryState: repositoryState(status),
          });
          return status;
        }

        if (previous === current.id) {
          yield* log(repositoryId, "sync snapshot unchanged", {
            snapshotId: current.id,
          });
          return yield* sqlite("refresh active snapshot", () => {
            const status = projection.activateSnapshot({
              completedAt: nowIso(),
              repositoryId,
              snapshotId: current.id,
            });
            setRepositoryCycleMetadata(repository, status.cycleMetadata);
            return status;
          });
        }

        return yield* materializeSnapshotDelta(repository, previous, current.id);
      }).pipe(
        Effect.catch((error) =>
          sqlite("mark sync failed", () =>
            projection.markSyncFailed(repositoryId, error.message),
          ).pipe(
            Effect.andThen(log(repositoryId, "sync failed", { error: error.message })),
            Effect.andThen(Effect.fail(error)),
          ),
        ),
      );
    });

  const pushRepository = (repositoryId: string): Effect.Effect<SyncResult, DatabaseFailure> =>
    Effect.gen(function* () {
      const repository = yield* getRepository(repositoryId);
      const result = yield* storage("push repository", pushStore(repository));
      yield* syncRepository(repositoryId);
      return result;
    });

  const writeAndSync = <A>(
    repositoryId: string,
    command: string,
    objectId: string | undefined,
    write: (repository: RepositoryRuntime) => Effect.Effect<
      {
        readonly result: A;
        readonly snapshotId: string;
      },
      DatabaseFailure
    >,
    visible: () => boolean,
  ): Effect.Effect<A, DatabaseFailure> =>
    Effect.gen(function* () {
      const repository = yield* getRepository(repositoryId);
      const previous = projection.repositoryStatus(repositoryId).activeSnapshotId;
      const writeStartedAt = performance.now();
      const written = yield* write(repository);
      yield* log(repositoryId, "write committed", {
        command,
        commitMs: elapsedMs(writeStartedAt),
        objectId,
        snapshotId: written.snapshotId,
      });

      yield* materializeSnapshotDelta(repository, previous, written.snapshotId).pipe(
        Effect.catch((error) =>
          sqlite("mark sync failed", () =>
            projection.markSyncFailed(repositoryId, error.message),
          ).pipe(Effect.andThen(Effect.fail(error))),
        ),
        Effect.mapError(
          (error) =>
            new ConsistencyError({
              cause: error,
              command,
              committedSnapshotId: written.snapshotId,
              message: `write committed but SQLite delta materialization failed for ${command}`,
              objectId,
              previousSnapshotId: previous,
              repositoryId,
            }),
        ),
      );

      if (!visible()) {
        return yield* new ConsistencyError({
          command,
          committedSnapshotId: written.snapshotId,
          message: `write committed but ${objectId ?? "object"} is not visible in SQLite`,
          objectId,
          previousSnapshotId: previous,
          repositoryId,
        });
      }

      return written.result;
    });

  const appendEvent = (
    tx: GitDbStore.Transaction,
    aggregateType: string,
    aggregateId: string,
    payload: DatabaseEventPayload,
  ): Effect.Effect<string, DatabaseFailure> =>
    Effect.gen(function* () {
      const eventId = yield* nextEventId(ids);

      return yield* storage(
        `append ${aggregateType} event`,
        GitDbEvent.append(tx, {
          aggregateId,
          aggregateType,
          eventId,
          payload: stripUndefined(payload) as Readonly<Record<string, unknown>>,
        }),
      );
    });

  const appendTicketUpdateEvents = (
    tx: GitDbStore.Transaction,
    current: TicketDocument,
    next: TicketDocument,
  ): Effect.Effect<void, DatabaseFailure> =>
    Effect.gen(function* () {
      if (current.body !== next.body) {
        yield* appendEvent(tx, "ticket", next.id, {
          field: "body",
          op: "ticket.update",
          value: next.body,
        });
      }

      const fields = new Set([
        ...Object.keys(current.frontmatter),
        ...Object.keys(next.frontmatter),
      ] as Array<keyof IssueFrontmatter>);

      for (const field of [...fields].sort()) {
        const before = current.frontmatter[field];
        const after = next.frontmatter[field];

        if (JSON.stringify(before) === JSON.stringify(after)) continue;

        yield* appendEvent(tx, "ticket", next.id, {
          field,
          op: "ticket.update",
          value: after ?? null,
        });
      }
    });

  const ensureActorUserProfile = (
    repository: RepositoryRuntime,
    tx: GitDbStore.Transaction,
    actor: Actor,
    now: string,
  ): Effect.Effect<void, DatabaseFailure> =>
    Effect.gen(function* () {
      if (actor.type !== "human") return;
      if (actor.email === undefined || actor.email.trim().length === 0) {
        return yield* new ValidationError({
          field: "user.email",
          message: "human repository writes require an email address",
        });
      }

      const userId = yield* normalizeUserIdEffect(actor.email);
      const existing = projection.getUser(repository.repositoryId, userId);

      if (existing !== null && existing.displayName === actor.name) return;
      if (existing !== null && existing.updatedAt > now) return;

      const next: UserProfileDocument = {
        aliases: existing?.aliases,
        avatarUrl: existing?.avatarUrl,
        createdAt: existing?.createdAt ?? now,
        disabledAt: existing?.disabledAt,
        displayName: actor.name,
        email: userId,
        id: userId,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        source: existing?.source ?? "local-profile",
        timezone: existing?.timezone,
        updatedAt: now,
      };

      yield* appendEvent(tx, "user", userId, {
        op: "user.upsert",
        value: stripUndefined(next) as UserProfileDocument,
      });
    });

  const ensureDefaultWorkflowMetadataInTransaction = (
    repository: RepositoryRuntime,
    tx: GitDbStore.Transaction,
    actor: Actor,
    now: string,
  ): Effect.Effect<
    {
      readonly changed: boolean;
      readonly metadata: CycleRepositoryMetadata;
    },
    DatabaseFailure
  > =>
    Effect.gen(function* () {
      const metadata =
        repository.cycleMetadata ?? makeCycleRepositoryMetadata(DEFAULT_TICKET_PREFIX, now);
      const actorUserId =
        actor.type === "human" && actor.email !== undefined && actor.email.trim().length > 0
          ? yield* normalizeUserIdEffect(actor.email)
          : undefined;
      const defaults = defaultRepositoryMetadata(actor, now, actorUserId);
      let changed = repository.cycleMetadata === undefined;

      if (repository.cycleMetadata === undefined) {
        yield* appendEvent(tx, "repository", "_", {
          op: "repository.metadata.set",
          value: metadata,
        });
      }

      for (const label of defaults.labels) {
        if (
          !projection
            .listLabels(repository.repositoryId)
            .entries.some((entry) => entry.id === label.id)
        ) {
          yield* appendEvent(tx, "label", label.id, {
            op: "label.upsert",
            value: label,
          });
          changed = true;
        }
      }
      for (const view of defaults.views) {
        if (projection.getView(repository.repositoryId, view.id) === null) {
          yield* appendEvent(tx, "view", view.id, {
            op: "view.upsert",
            value: view,
          });
          changed = true;
        }
      }
      for (const template of defaults.templates) {
        if (projection.getTemplate(repository.repositoryId, template.id) === null) {
          yield* appendEvent(tx, "template", template.id, {
            op: "template.upsert",
            value: template,
          });
          changed = true;
        }
      }

      return {
        changed,
        metadata,
      };
    });

  const beginWriteTransaction = (
    repository: RepositoryRuntime,
    label: string,
    actor: Actor,
    now: string,
  ): Effect.Effect<GitDbStore.Transaction, DatabaseFailure> =>
    Effect.gen(function* () {
      const tx = yield* storage(`begin ${label}`, repository.store.begin());
      yield* ensureDefaultWorkflowMetadataInTransaction(repository, tx, actor, now);
      return tx;
    });

  const generateTicketId = (
    repository: RepositoryRuntime,
  ): Effect.Effect<string, DatabaseFailure> =>
    Effect.gen(function* () {
      const prefix = repository.cycleMetadata?.ticketPrefix ?? DEFAULT_TICKET_PREFIX;

      for (let attempt = 0; attempt < 100; attempt += 1) {
        const seed = yield* normalizeTicketSeedEffect(yield* ids.ticketId);

        for (let length = 5; length <= seed.length; length += 1) {
          const candidate = `${prefix}-${seed.slice(0, length)}`;

          if (!TICKET_ID_PATTERN.test(candidate)) continue;
          if (projection.getTicket(repository.repositoryId, candidate) !== null) continue;
          return candidate;
        }
      }

      return yield* new ValidationError({
        field: "ticket.id",
        message: "unable to generate a unique ticket id",
      });
    });

  const ensureDefaultMetadata = (repositoryId: string): Effect.Effect<void, DatabaseFailure> =>
    Effect.gen(function* () {
      const repository = yield* getRepository(repositoryId);
      const actor = yield* identity.currentActor;
      const now = nowIso();
      const snapshot = yield* storage(
        "seed default repository metadata",
        Effect.gen(function* () {
          const tx = yield* storage(
            "begin seed default repository metadata",
            repository.store.begin(),
          );
          const defaults = yield* ensureDefaultWorkflowMetadataInTransaction(
            repository,
            tx,
            actor,
            now,
          );

          yield* ensureActorUserProfile(repository, tx, actor, now);

          if (!defaults.changed) {
            yield* tx.abort();
            return null;
          }

          return yield* tx.commit({
            author: gitIdentity(actor),
            committer: gitIdentity(actor),
            message: `${actor.name} seeded Cycle workflow metadata`,
          });
        }),
      );

      if (snapshot !== null) {
        yield* syncRepository(repositoryId);
      }
    });

  const createTicket = (
    repositoryId: string,
    input: CreateTicketInput,
    options: CommitOptions = {},
  ): Effect.Effect<TicketDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("create ticket input", input);

      const actor = yield* identity.currentActor;
      const repository = yield* getRepository(repositoryId);
      const type = validateNewTicketType(input.type);

      if (!type.ok) {
        return yield* new ValidationError({ field: "type", message: type.reason });
      }

      const id = yield* generateTicketId(repository);
      const now = nowIso();
      const body = input.body ?? defaultIssueBody();
      const ticket = makeTicketDocument(
        makeFrontmatter({ ...input, type: type.type }, id, actor, now),
        body,
      );

      yield* validateTicket(ticket);

      return yield* writeAndSync(
        repositoryId,
        "createTicket",
        id,
        (repository) =>
          Effect.gen(function* () {
            const recordId = yield* ids.recordId;
            const statusRecordId = yield* ids.recordId;
            const tx = yield* beginWriteTransaction(repository, "create ticket", actor, now);
            yield* ensureActorUserProfile(repository, tx, actor, now);
            const provenance = initialProvenanceRecord(
              id,
              makeRecordId(id, "provenance", recordId),
              actor,
              now,
            );
            const status = statusChangeRecord(
              id,
              makeRecordId(id, "status-change", statusRecordId),
              actor,
              now,
              null,
              ticket.status,
            );

            yield* appendEvent(tx, "ticket", id, {
              op: "ticket.create",
              value: ticket,
            });
            yield* appendEvent(tx, "record", provenance.id, {
              op: "record.add",
              value: provenance,
            });
            yield* appendEvent(tx, "record", status.id, {
              op: "record.add",
              value: status,
            });

            const snapshot = yield* storage(
              "commit create ticket",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? createdTicketMessage(actor, ticket),
              }),
            );

            return { result: ticket, snapshotId: snapshot.id };
          }),
        () => projection.ticketVisible(repositoryId, id),
      );
    });

  const updateTicket = (
    repositoryId: string,
    ticketId: string,
    patch: UpdateTicketPatch,
  ): Effect.Effect<TicketDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      const current = projection.getTicket(repositoryId, ticketId);

      if (current === null)
        return yield* new ValidationError({ field: "ticketId", message: "ticket not found" });

      yield* assertNoUnsafeContent("update ticket patch", patch);

      const actor = yield* identity.currentActor;
      const now = nowIso();
      const next = updateTicketDocument(
        current,
        {
          ...current.frontmatter,
          ...patch.frontmatter,
          createdAt: current.frontmatter.createdAt,
          createdBy: current.frontmatter.createdBy,
          id: ticketId,
          updatedAt: now,
        },
        patch.body ?? current.body,
      );

      yield* validateTicket(next);

      return yield* writeAndSync(
        repositoryId,
        "updateTicket",
        ticketId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "update ticket", actor, now);
            yield* ensureActorUserProfile(repository, tx, actor, now);

            yield* appendTicketUpdateEvents(tx, current, next);

            if (next.status !== current.status) {
              const recordId = makeRecordId(ticketId, "status-change", yield* ids.recordId);
              yield* appendEvent(tx, "record", recordId, {
                op: "record.add",
                value: statusChangeRecord(
                  ticketId,
                  recordId,
                  actor,
                  now,
                  current.status,
                  next.status,
                ),
              });
            }

            const snapshot = yield* storage(
              "commit update ticket",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: patch.message ?? updatedTicketMessage(actor, current, next),
              }),
            );

            return { result: next, snapshotId: snapshot.id };
          }),
        () => projection.ticketVisible(repositoryId, ticketId),
      );
    });

  const writeTicketUpdates = <A>(
    repositoryId: string,
    command: string,
    objectId: string | undefined,
    actor: Actor,
    now: string,
    result: A,
    tickets: ReadonlyArray<TicketDocument>,
    linkedRecords: ReadonlyArray<LinkedRecord>,
    message: string,
    visible: () => boolean,
  ): Effect.Effect<A, DatabaseFailure> =>
    writeAndSync(
      repositoryId,
      command,
      objectId,
      (repository) =>
        Effect.gen(function* () {
          const tx = yield* beginWriteTransaction(repository, command, actor, now);
          yield* ensureActorUserProfile(repository, tx, actor, now);

          for (const ticket of tickets) {
            if (command === "archiveTicket") {
              yield* appendEvent(tx, "ticket", ticket.id, { op: "ticket.archive" });
            } else if (command === "deleteTicket") {
              yield* appendEvent(tx, "ticket", ticket.id, { op: "ticket.delete" });
            } else if (command === "restoreTicket") {
              yield* appendEvent(tx, "ticket", ticket.id, { op: "ticket.restore" });
            } else {
              yield* appendEvent(tx, "ticket", ticket.id, {
                op: "ticket.replace",
                value: ticket,
              });
            }
          }
          for (const record of linkedRecords) {
            yield* appendEvent(tx, "record", record.id, {
              op: "record.add",
              value: record,
            });
          }

          const snapshot = yield* storage(
            `commit ${command}`,
            tx.commit({
              message,
            }),
          );

          return { result, snapshotId: snapshot.id };
        }),
      visible,
    );

  const archiveTicket = (
    repositoryId: string,
    ticketId: string,
    input: ArchiveTicketInput = {},
    options: CommitOptions = {},
  ): Effect.Effect<TicketDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      const current = projection.getTicket(repositoryId, ticketId);

      if (current === null)
        return yield* new ValidationError({ field: "ticketId", message: "ticket not found" });

      const actor = yield* identity.currentActor;
      const now = nowIso();
      const next = updateTicketDocument(current, {
        ...current.frontmatter,
        archivedAt: now,
        archivedBy: actor,
        updatedAt: now,
      });
      const recordId = makeRecordId(ticketId, "archive", yield* ids.recordId);
      const record = makeRecord(
        {
          payload: stripUndefined({
            archivedAt: now,
            reason: input.reason,
          }),
          recordType: "archive",
          ticketId,
        },
        recordId,
        actor,
        now,
      );

      yield* validateTicket(next);

      return yield* writeTicketUpdates(
        repositoryId,
        "archiveTicket",
        ticketId,
        actor,
        now,
        next,
        [next],
        [record],
        options.message ?? `${actor.name} archived ${quotedTicketTitle(next)} ticket`,
        () => projection.ticketVisible(repositoryId, ticketId),
      );
    });

  const deleteTicket = (
    repositoryId: string,
    ticketId: string,
    input: DeleteTicketInput = {},
    options: CommitOptions = {},
  ): Effect.Effect<TicketDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      const current = projection.getTicket(repositoryId, ticketId);

      if (current === null)
        return yield* new ValidationError({ field: "ticketId", message: "ticket not found" });

      const actor = yield* identity.currentActor;
      const now = nowIso();
      const next = updateTicketDocument(current, {
        ...current.frontmatter,
        deletedAt: now,
        deletedBy: actor,
        updatedAt: now,
      });
      const recordId = makeRecordId(ticketId, "delete", yield* ids.recordId);
      const record = makeRecord(
        {
          payload: stripUndefined({
            deletedAt: now,
            reason: input.reason,
          }),
          recordType: "delete",
          ticketId,
        },
        recordId,
        actor,
        now,
      );

      yield* validateTicket(next);

      return yield* writeTicketUpdates(
        repositoryId,
        "deleteTicket",
        ticketId,
        actor,
        now,
        next,
        [next],
        [record],
        options.message ?? `${actor.name} deleted ${quotedTicketTitle(next)} ticket`,
        () => projection.ticketVisible(repositoryId, ticketId),
      );
    });

  const restoreTicket = (
    repositoryId: string,
    ticketId: string,
    input: RestoreTicketInput = {},
    options: CommitOptions = {},
  ): Effect.Effect<TicketDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      const current = projection.getTicket(repositoryId, ticketId);

      if (current === null)
        return yield* new ValidationError({ field: "ticketId", message: "ticket not found" });

      const actor = yield* identity.currentActor;
      const now = nowIso();
      const next = updateTicketDocument(current, {
        ...current.frontmatter,
        archivedAt: undefined,
        archivedBy: undefined,
        deletedAt: undefined,
        deletedBy: undefined,
        updatedAt: now,
      });
      const recordId = makeRecordId(ticketId, "restore", yield* ids.recordId);
      const record = makeRecord(
        {
          payload: stripUndefined({
            reason: input.reason,
            restoredAt: now,
          }),
          recordType: "restore",
          ticketId,
        },
        recordId,
        actor,
        now,
      );

      yield* validateTicket(next);

      return yield* writeTicketUpdates(
        repositoryId,
        "restoreTicket",
        ticketId,
        actor,
        now,
        next,
        [next],
        [record],
        options.message ?? `${actor.name} restored ${quotedTicketTitle(next)} ticket`,
        () => projection.ticketVisible(repositoryId, ticketId),
      );
    });

  const mutateIssueRelation = (
    repositoryId: string,
    ticketId: string,
    relation: IssueRelation,
    action: "add" | "remove",
    options: CommitOptions = {},
  ): Effect.Effect<TicketDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      validateTicketId("ticket id", ticketId);
      validateTicketId("relation issue id", relation.issueId);

      if (!isIssueRelationType(relation.type)) {
        return yield* new ValidationError({
          field: "relation.type",
          message: "invalid issue relation type",
        });
      }
      if (relation.issueId === ticketId) {
        return yield* new ValidationError({
          field: "relation.issueId",
          message: "ticket cannot relate to itself",
        });
      }

      const current = projection.getTicket(repositoryId, ticketId);
      const related = projection.getTicket(repositoryId, relation.issueId);

      if (current === null)
        return yield* new ValidationError({ field: "ticketId", message: "ticket not found" });
      if (related === null)
        return yield* new ValidationError({
          field: "relation.issueId",
          message: "related ticket not found",
        });

      const actor = yield* identity.currentActor;
      const now = nowIso();
      const normalizedRelation = {
        issueId: relation.issueId,
        type: relation.type,
      } satisfies IssueRelation;
      const inverse = inverseRelation(normalizedRelation, ticketId);
      const next = updateTicketDocument(current, {
        ...current.frontmatter,
        duplicateOf:
          action === "add" && normalizedRelation.type === "duplicate"
            ? normalizedRelation.issueId
            : action === "remove" && normalizedRelation.type === "duplicate"
              ? undefined
              : current.frontmatter.duplicateOf,
        relations:
          action === "add"
            ? addRelation(current.frontmatter.relations, normalizedRelation)
            : removeRelation(current.frontmatter.relations, normalizedRelation),
        updatedAt: now,
      });
      const nextRelated = updateTicketDocument(related, {
        ...related.frontmatter,
        relations:
          action === "add"
            ? addRelation(related.frontmatter.relations, inverse)
            : removeRelation(related.frontmatter.relations, inverse),
        updatedAt: now,
      });
      const sourceRecordId = makeRecordId(ticketId, "relation-change", yield* ids.recordId);
      const relatedRecordId = makeRecordId(
        relation.issueId,
        "relation-change",
        yield* ids.recordId,
      );
      const payload = {
        action,
        relation: normalizedRelation,
      };
      const sourceRecord = makeRecord(
        {
          payload,
          recordType: "relation-change",
          ticketId,
        },
        sourceRecordId,
        actor,
        now,
      );
      const relatedRecord = makeRecord(
        {
          payload: {
            action,
            relation: inverse,
          },
          recordType: "relation-change",
          ticketId: relation.issueId,
        },
        relatedRecordId,
        actor,
        now,
      );

      yield* validateTicket(next);
      yield* validateTicket(nextRelated);

      return yield* writeTicketUpdates(
        repositoryId,
        action === "add" ? "addIssueRelation" : "removeIssueRelation",
        ticketId,
        actor,
        now,
        next,
        [next, nextRelated],
        [sourceRecord, relatedRecord],
        options.message ??
          relationMessage(actor, action, normalizedRelation.type, current, related),
        () => projection.ticketVisible(repositoryId, ticketId),
      );
    });

  const addRecord = <TPayload = unknown>(
    repositoryId: string,
    ticketId: string,
    input: AddRecordInput<TPayload>,
    options: CommitOptions = {},
  ): Effect.Effect<LinkedRecord, DatabaseFailure> =>
    Effect.gen(function* () {
      const ticket = projection.getTicket(repositoryId, ticketId);

      if (ticket === null)
        return yield* new ValidationError({ field: "ticketId", message: "ticket not found" });

      yield* assertNoUnsafeContent("record payload", input.payload);

      if (
        normalizeKey(input.recordType) === "comment" &&
        commentPayloadBody(input.payload).trim().length === 0
      ) {
        return yield* new ValidationError({
          field: "comment.body",
          message: "comment body must not be empty",
        });
      }

      const actor = yield* identity.currentActor;
      const now = nowIso();
      const recordId = makeRecordId(ticketId, input.recordType, yield* ids.recordId);
      const record = makeRecord(
        {
          payload: input.payload,
          recordType: input.recordType,
          ticketId,
        },
        recordId,
        actor,
        now,
      );
      return yield* writeAndSync(
        repositoryId,
        "addRecord",
        recordId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "add record", actor, now);
            yield* ensureActorUserProfile(repository, tx, actor, now);

            if (input.userVisible !== false) {
              yield* appendEvent(tx, "ticket", ticketId, {
                field: "updatedAt",
                op: "ticket.update",
                value: now,
              });
            }

            yield* appendEvent(tx, "record", record.id, {
              op: "record.add",
              value: record,
            });

            const snapshot = yield* storage(
              "commit add record",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? recordMessage(actor, record.recordType, ticket),
              }),
            );

            return { result: record, snapshotId: snapshot.id };
          }),
        () => projection.recordVisible(repositoryId, recordId),
      );
    });

  const ticketRevision = (
    repositoryId: string,
    ticketId: string,
    snapshotId: string,
  ): Effect.Effect<TicketDocument | null, DatabaseFailure> =>
    Effect.gen(function* () {
      const repository = yield* getRepository(repositoryId);
      const folded = yield* foldRepositoryEvents(repository, snapshotId);

      return folded.tickets.get(ticketId) ?? null;
    });

  const ticketDiff = (
    repositoryId: string,
    ticketId: string,
    fromSnapshotId: string,
    toSnapshotId: string,
  ): Effect.Effect<TicketRevisionDiff, DatabaseFailure> =>
    Effect.gen(function* () {
      const fromTicket = yield* ticketRevision(repositoryId, ticketId, fromSnapshotId);
      const toTicket = yield* ticketRevision(repositoryId, ticketId, toSnapshotId);

      if (fromTicket === null && toTicket === null) {
        return yield* new ValidationError({
          field: "ticketId",
          message: "ticket not found in either revision",
        });
      }

      return {
        files: [
          {
            language: "markdown",
            newContent: toTicket?.body ?? "",
            newPath: `${ticketId}.md`,
            oldContent: fromTicket?.body ?? "",
            oldPath: `${ticketId}.md`,
          },
        ],
        fromSnapshotId,
        metadataChanges: metadataChanges(fromTicket, toTicket),
        ticketId,
        toSnapshotId,
      };
    });

  const createDraft = (
    repositoryId: string,
    input: CreateTicketDraftInput,
    options: CommitOptions = {},
  ): Effect.Effect<TicketDraftDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("draft input", input);

      const actor = yield* identity.currentActor;
      const now = nowIso();
      const draftId = yield* ids.draftId;
      const draft: TicketDraftDocument = {
        createdAt: now,
        createdBy: actor,
        id: draftId,
        input,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        status: "open",
        updatedAt: now,
      };

      return yield* writeAndSync(
        repositoryId,
        "createDraft",
        draftId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "create draft", actor, now);
            yield* ensureActorUserProfile(repository, tx, actor, now);

            yield* appendEvent(tx, "draft", draftId, {
              op: "draft.create",
              value: draft,
            });

            const snapshot = yield* storage(
              "commit create draft",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? draftCreatedMessage(actor, draft),
              }),
            );

            return { result: draft, snapshotId: snapshot.id };
          }),
        () => true,
      );
    });

  const updateDraft = (
    repositoryId: string,
    draftId: string,
    input: UpdateTicketDraftInput,
    options: CommitOptions = {},
  ): Effect.Effect<TicketDraftDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("draft patch", input);

      const actor = yield* identity.currentActor;
      const now = nowIso();

      return yield* writeAndSync(
        repositoryId,
        "updateDraft",
        draftId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "update draft", actor, now);
            const current = (yield* foldRepositoryEvents(repository)).drafts.get(draftId) ?? null;

            if (current === null) {
              return yield* new ValidationError({ field: "draftId", message: "draft not found" });
            }
            yield* ensureActorUserProfile(repository, tx, actor, now);

            const next: TicketDraftDocument = {
              ...current,
              input: mergeDraftInput(current.input, input),
              updatedAt: now,
            };

            yield* appendEvent(tx, "draft", draftId, {
              op: "draft.update",
              value: next,
            });

            const snapshot = yield* storage(
              "commit update draft",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? draftUpdatedMessage(actor, next),
              }),
            );

            return { result: next, snapshotId: snapshot.id };
          }),
        () => true,
      );
    });

  const commitDraft = (
    repositoryId: string,
    draftId: string,
    options: CommitOptions = {},
  ): Effect.Effect<TicketDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      const actor = yield* identity.currentActor;
      const repository = yield* getRepository(repositoryId);
      const ticketId = yield* generateTicketId(repository);
      const now = nowIso();

      return yield* writeAndSync(
        repositoryId,
        "commitDraft",
        draftId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "commit draft", actor, now);
            const draft = (yield* foldRepositoryEvents(repository)).drafts.get(draftId) ?? null;

            if (draft === null) {
              return yield* new ValidationError({ field: "draftId", message: "draft not found" });
            }
            yield* ensureActorUserProfile(repository, tx, actor, now);

            const ticket = makeTicketDocument(
              makeFrontmatter(draft.input, ticketId, actor, now),
              draft.input.body ?? defaultIssueBody(),
            );
            const provenanceRecordId = yield* ids.recordId;
            const statusRecordId = yield* ids.recordId;
            const provenance = initialProvenanceRecord(
              ticketId,
              makeRecordId(ticketId, "provenance", provenanceRecordId),
              actor,
              now,
            );
            const status = statusChangeRecord(
              ticketId,
              makeRecordId(ticketId, "status-change", statusRecordId),
              actor,
              now,
              null,
              ticket.status,
            );

            yield* validateTicket(ticket);
            yield* appendEvent(tx, "ticket", ticketId, {
              op: "ticket.create",
              value: ticket,
            });
            yield* appendEvent(tx, "record", provenance.id, {
              op: "record.add",
              value: provenance,
            });
            yield* appendEvent(tx, "record", status.id, {
              op: "record.add",
              value: status,
            });
            yield* appendEvent(tx, "draft", draftId, {
              op: "draft.commit",
              value: {
                ...draft,
                status: "committed",
                updatedAt: now,
              },
            });

            const snapshot = yield* storage(
              "commit draft",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message:
                  options.message ??
                  `${actor.name} created ${quotedTicketTitle(ticket)} ticket from draft`,
              }),
            );

            return { result: ticket, snapshotId: snapshot.id };
          }),
        () => projection.ticketVisible(repositoryId, ticketId),
      );
    });

  const upsertUser = (
    repositoryId: string,
    input: CreateOrUpdateUserProfileInput,
    options: CommitOptions = {},
  ): Effect.Effect<UserProfileDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("user profile input", input);
      const actor = yield* identity.currentActor;
      const now = nowIso();
      const userId = yield* normalizeUserIdEffect(input.email);
      const user = stripUndefined({
        aliases: input.aliases,
        avatarUrl: input.avatarUrl,
        createdAt: now,
        disabledAt: input.disabledAt ?? undefined,
        displayName: input.displayName,
        email: userId,
        id: userId,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        source: input.source ?? "manual",
        timezone: input.timezone,
        updatedAt: now,
      }) as UserProfileDocument;

      validateRequiredString("displayName", user.displayName);

      return yield* writeAndSync(
        repositoryId,
        "upsertUser",
        userId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "upsert user", actor, now);

            yield* ensureActorUserProfile(repository, tx, actor, now);
            yield* appendEvent(tx, "user", userId, {
              op: "user.upsert",
              value: user,
            });

            const snapshot = yield* storage(
              "commit upsert user",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? `${actor.name} updated user profile ${userId}`,
              }),
            );

            return { result: user, snapshotId: snapshot.id };
          }),
        () => projection.getUser(repositoryId, userId) !== null,
      );
    });

  const upsertLabel = (
    repositoryId: string,
    input: UpsertLabelDefinitionInput,
    options: CommitOptions = {},
  ): Effect.Effect<LabelDefinitionDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("label input", input);
      const actor = yield* identity.currentActor;
      const now = nowIso();
      const labelId = normalizeKey(input.id ?? input.name);
      const existing = projection
        .listLabels(repositoryId)
        .entries.find((label) => label.id === labelId);
      const label: LabelDefinitionDocument = stripUndefined({
        archivedAt: existing?.archivedAt,
        color: input.color ?? existing?.color ?? "neutral",
        createdAt: existing?.createdAt ?? now,
        createdBy: existing?.createdBy ?? actor,
        description:
          input.description === null ? undefined : (input.description ?? existing?.description),
        id: labelId,
        name: input.name,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        updatedAt: now,
      }) as LabelDefinitionDocument;

      parseLabelDefinition(label);

      return yield* writeAndSync(
        repositoryId,
        "upsertLabel",
        labelId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "upsert label", actor, now);

            yield* ensureActorUserProfile(repository, tx, actor, now);
            yield* appendEvent(tx, "label", labelId, {
              op: "label.upsert",
              value: label,
            });

            const snapshot = yield* storage(
              "commit upsert label",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? `${actor.name} updated label ${label.name}`,
              }),
            );

            return { result: label, snapshotId: snapshot.id };
          }),
        () => projection.listLabels(repositoryId).entries.some((entry) => entry.id === labelId),
      );
    });

  const archiveLabel = (
    repositoryId: string,
    labelId: string,
    options: CommitOptions = {},
  ): Effect.Effect<LabelDefinitionDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      const current = projection
        .listLabels(repositoryId)
        .entries.find((label) => label.id === labelId);

      if (current === undefined) {
        return yield* new ValidationError({ field: "labelId", message: "label not found" });
      }

      const actor = yield* identity.currentActor;
      const now = nowIso();
      const next: LabelDefinitionDocument = {
        ...current,
        archivedAt: now,
        updatedAt: now,
      };

      return yield* writeAndSync(
        repositoryId,
        "archiveLabel",
        labelId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "archive label", actor, now);

            yield* ensureActorUserProfile(repository, tx, actor, now);
            yield* appendEvent(tx, "label", labelId, {
              op: "label.upsert",
              value: next,
            });

            const snapshot = yield* storage(
              "commit archive label",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? `${actor.name} archived label ${current.name}`,
              }),
            );

            return { result: next, snapshotId: snapshot.id };
          }),
        () =>
          projection
            .listLabels(repositoryId)
            .entries.some((entry) => entry.id === labelId && entry.archivedAt !== undefined),
      );
    });

  const createView = (
    repositoryId: string,
    input: CreateSavedViewInput,
    options: CommitOptions = {},
  ): Effect.Effect<SavedViewDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("saved view input", input);
      const actor = yield* identity.currentActor;
      const now = nowIso();
      const viewId = yield* ids.viewId;
      const view: SavedViewDocument = {
        createdAt: now,
        createdBy: actor,
        display: input.display,
        groupBy: input.groupBy ?? "status",
        id: viewId,
        kind: input.kind ?? "list",
        name: input.name,
        pinned: input.pinned ?? false,
        query: input.query ?? {},
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sort: input.sort,
        updatedAt: now,
      };

      parseSavedView(view);

      return yield* writeAndSync(
        repositoryId,
        "createView",
        viewId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "create view", actor, now);

            yield* ensureActorUserProfile(repository, tx, actor, now);
            yield* appendEvent(tx, "view", viewId, {
              op: "view.upsert",
              value: view,
            });

            const snapshot = yield* storage(
              "commit create view",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? `${actor.name} created view ${view.name}`,
              }),
            );

            return { result: view, snapshotId: snapshot.id };
          }),
        () => projection.getView(repositoryId, viewId) !== null,
      );
    });

  const updateView = (
    repositoryId: string,
    viewId: string,
    patch: UpdateSavedViewPatch,
    options: CommitOptions = {},
  ): Effect.Effect<SavedViewDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("saved view patch", patch);
      const current = projection.getView(repositoryId, viewId);

      if (current === null)
        return yield* new ValidationError({ field: "viewId", message: "view not found" });

      const actor = yield* identity.currentActor;
      const now = nowIso();
      const next: SavedViewDocument = {
        ...current,
        builtIn: patch.builtIn ?? current.builtIn,
        description: patch.description ?? current.description,
        display: patch.display ?? current.display,
        groupBy: patch.groupBy ?? current.groupBy,
        kind: patch.kind ?? current.kind,
        name: patch.name ?? current.name,
        pinned: patch.pinned ?? current.pinned,
        query: patch.query ?? current.query,
        sort: patch.sort ?? current.sort,
        updatedAt: now,
      };

      parseSavedView(next);

      return yield* writeAndSync(
        repositoryId,
        "updateView",
        viewId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "update view", actor, now);

            yield* ensureActorUserProfile(repository, tx, actor, now);
            yield* appendEvent(tx, "view", viewId, {
              op: "view.upsert",
              value: next,
            });

            const snapshot = yield* storage(
              "commit update view",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? `${actor.name} updated view ${next.name}`,
              }),
            );

            return { result: next, snapshotId: snapshot.id };
          }),
        () => projection.getView(repositoryId, viewId) !== null,
      );
    });

  const deleteView = (
    repositoryId: string,
    viewId: string,
    options: CommitOptions = {},
  ): Effect.Effect<SavedViewDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      const current = projection.getView(repositoryId, viewId);

      if (current === null)
        return yield* new ValidationError({ field: "viewId", message: "view not found" });

      const actor = yield* identity.currentActor;
      const now = nowIso();

      return yield* writeAndSync(
        repositoryId,
        "deleteView",
        viewId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "delete view", actor, now);

            yield* ensureActorUserProfile(repository, tx, actor, now);
            yield* appendEvent(tx, "view", viewId, {
              op: "view.delete",
            });

            const snapshot = yield* storage(
              "commit delete view",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? `${actor.name} deleted view ${current.name}`,
              }),
            );

            return { result: current, snapshotId: snapshot.id };
          }),
        () => projection.getView(repositoryId, viewId) === null,
      );
    });

  const createTemplate = (
    repositoryId: string,
    input: CreateIssueTemplateInput,
    options: CommitOptions = {},
  ): Effect.Effect<IssueTemplateDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("issue template input", input);
      const actor = yield* identity.currentActor;
      const now = nowIso();
      const templateId = yield* ids.templateId;
      const template: IssueTemplateDocument = {
        active: input.active ?? true,
        bodyTemplate: input.bodyTemplate,
        createdAt: now,
        createdBy: actor,
        defaults: input.defaults,
        description: input.description,
        id: templateId,
        kind: input.kind,
        name: input.name,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        titleTemplate: input.titleTemplate,
        updatedAt: now,
      };

      parseIssueTemplate(template);

      return yield* writeAndSync(
        repositoryId,
        "createTemplate",
        templateId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "create template", actor, now);

            yield* ensureActorUserProfile(repository, tx, actor, now);
            yield* appendEvent(tx, "template", templateId, {
              op: "template.upsert",
              value: template,
            });

            const snapshot = yield* storage(
              "commit create template",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? `${actor.name} created template ${template.name}`,
              }),
            );

            return { result: template, snapshotId: snapshot.id };
          }),
        () => projection.getTemplate(repositoryId, templateId) !== null,
      );
    });

  const updateTemplate = (
    repositoryId: string,
    templateId: string,
    patch: UpdateIssueTemplatePatch,
    options: CommitOptions = {},
  ): Effect.Effect<IssueTemplateDocument, DatabaseFailure> =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("issue template patch", patch);
      const current = projection.getTemplate(repositoryId, templateId);

      if (current === null)
        return yield* new ValidationError({ field: "templateId", message: "template not found" });

      const actor = yield* identity.currentActor;
      const now = nowIso();
      const next: IssueTemplateDocument = {
        ...current,
        active: patch.active ?? current.active,
        bodyTemplate: patch.bodyTemplate ?? current.bodyTemplate,
        defaults: patch.defaults ?? current.defaults,
        description: patch.description ?? current.description,
        kind: patch.kind ?? current.kind,
        name: patch.name ?? current.name,
        titleTemplate: patch.titleTemplate ?? current.titleTemplate,
        updatedAt: now,
      };

      parseIssueTemplate(next);

      return yield* writeAndSync(
        repositoryId,
        "updateTemplate",
        templateId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* beginWriteTransaction(repository, "update template", actor, now);

            yield* ensureActorUserProfile(repository, tx, actor, now);
            yield* appendEvent(tx, "template", templateId, {
              op: "template.upsert",
              value: next,
            });

            const snapshot = yield* storage(
              "commit update template",
              tx.commit({
                author: gitIdentity(actor),
                committer: gitIdentity(actor),
                message: options.message ?? `${actor.name} updated template ${next.name}`,
              }),
            );

            return { result: next, snapshotId: snapshot.id };
          }),
        () => projection.getTemplate(repositoryId, templateId) !== null,
      );
    });

  const archiveTemplate = (
    repositoryId: string,
    templateId: string,
    options: CommitOptions = {},
  ): Effect.Effect<IssueTemplateDocument, DatabaseFailure> =>
    updateTemplate(repositoryId, templateId, { active: false }, options);

  const createInitiative = (
    repositoryId: string,
    input: CreateTicketInput,
    options: CommitOptions = {},
  ): Effect.Effect<TicketDocument, DatabaseFailure> =>
    createTicket(
      repositoryId,
      {
        ...input,
        type: input.type ?? "epic",
      },
      options,
    );

  const initiativeProgress = (
    repositoryId: string,
    initiativeId: string,
  ): Effect.Effect<InitiativeProgress, DatabaseFailure> =>
    sqlite("initiative progress", () => {
      const children = projection.listTickets({
        archived: false,
        deleted: false,
        parent: initiativeId,
        repositoryIds: [repositoryId],
      }).entries;
      const statusCounts: Record<string, number> = {};
      let estimateTotal = 0;
      let completedEstimate = 0;
      let completedIssues = 0;

      for (const child of children) {
        statusCounts[child.status] = (statusCounts[child.status] ?? 0) + 1;
        const estimate =
          typeof child.estimate === "number"
            ? child.estimate
            : typeof child.estimate === "string"
              ? Number(child.estimate)
              : 0;
        const normalizedEstimate = Number.isFinite(estimate) ? estimate : 0;
        estimateTotal += normalizedEstimate;
        if (child.status === "done") {
          completedIssues += 1;
          completedEstimate += normalizedEstimate;
        }
      }

      return {
        completedEstimate,
        completedIssues,
        estimateTotal,
        issueTotal: children.length,
        statusCounts,
      };
    });

  const addInitiativeUpdate = (
    repositoryId: string,
    initiativeId: string,
    input: InitiativeUpdatePayload,
    options: CommitOptions = {},
  ): Effect.Effect<LinkedRecord, DatabaseFailure> =>
    Effect.gen(function* () {
      yield* Effect.try({
        catch: (cause) =>
          cause instanceof Error
            ? new ValidationError({
                field: "initiative-update",
                message: cause.message,
                cause: cause,
              })
            : new ValidationError({
                field: "initiative-update",
                message: "invalid initiative update",
                cause: cause,
              }),
        try: () => validateRequiredString("initiative update summary", input.summary),
      });

      return yield* addRecord(
        repositoryId,
        initiativeId,
        {
          payload: input,
          recordType: "initiative-update",
        },
        options,
      );
    });

  const normalizeInboxQueryInput = (
    query: InboxQuery,
  ): Effect.Effect<InboxQuery, DatabaseFailure> =>
    Effect.gen(function* () {
      const userId = yield* normalizeUserIdEffect(query.userId);

      return {
        ...query,
        userId,
      };
    });

  const normalizeInboxMutationInput = (
    input: InboxMutationInput,
  ): Effect.Effect<InboxMutationInput, DatabaseFailure> =>
    Effect.gen(function* () {
      const userId = yield* normalizeUserIdEffect(input.userId);
      const itemIds = [...new Set(input.itemIds.map((itemId) => itemId.trim()))];

      yield* Effect.try({
        catch: (cause) =>
          cause instanceof Error
            ? new ValidationError({ field: "itemIds", message: cause.message, cause: cause })
            : new ValidationError({
                field: "itemIds",
                message: "invalid inbox item ids",
                cause: cause,
              }),
        try: () => {
          for (const itemId of itemIds) {
            validateRequiredString("itemId", itemId);
          }
        },
      });

      return {
        ...input,
        itemIds,
        userId,
      };
    });

  const listInbox = (query: InboxQuery): Effect.Effect<InboxPage, DatabaseFailure> =>
    Effect.gen(function* () {
      const normalized = yield* normalizeInboxQueryInput(query);
      return yield* sqlite("list inbox", () => projection.listInbox(normalized));
    });

  const inboxSummary = (query: InboxQuery): Effect.Effect<InboxSummary, DatabaseFailure> =>
    Effect.gen(function* () {
      const normalized = yield* normalizeInboxQueryInput(query);
      return yield* sqlite("inbox summary", () => projection.inboxSummary(normalized));
    });

  const markInboxRead = (
    input: InboxMutationInput,
  ): Effect.Effect<InboxMutationResult, DatabaseFailure> =>
    Effect.gen(function* () {
      const normalized = yield* normalizeInboxMutationInput(input);
      return yield* sqlite("mark inbox read", () =>
        projection.transaction(() => projection.markInboxRead(normalized, nowIso())),
      );
    });

  const markInboxUnread = (
    input: InboxMutationInput,
  ): Effect.Effect<InboxMutationResult, DatabaseFailure> =>
    Effect.gen(function* () {
      const normalized = yield* normalizeInboxMutationInput(input);
      return yield* sqlite("mark inbox unread", () =>
        projection.transaction(() => projection.markInboxUnread(normalized, nowIso())),
      );
    });

  const archiveInboxItems = (
    input: InboxMutationInput,
  ): Effect.Effect<InboxMutationResult, DatabaseFailure> =>
    Effect.gen(function* () {
      const normalized = yield* normalizeInboxMutationInput(input);
      return yield* sqlite("archive inbox items", () =>
        projection.transaction(() => projection.archiveInboxItems(normalized, nowIso())),
      );
    });

  return {
    addComment: (repositoryId, ticketId, input, options) =>
      addRecord(
        repositoryId,
        ticketId,
        {
          payload: { body: input.body },
          recordType: "comment",
        },
        options,
      ),
    addIssueRelation: (repositoryId, ticketId, relation, options) =>
      mutateIssueRelation(repositoryId, ticketId, relation, "add", options),
    addInitiativeUpdate,
    addRecord,
    archiveInboxItems,
    archiveLabel,
    archiveTemplate,
    archiveTicket,
    close: () =>
      Effect.sync(() => {
        if (closed) return;
        closed = true;
        repositories.clear();
        projection.close();
      }),
    commitDraft,
    createInitiative,
    createDraft,
    createTemplate,
    createTicket,
    createView,
    deleteView,
    deleteTicket,
    getTicket: (repositoryId, ticketId) =>
      sqlite("get ticket", () => projection.getTicket(repositoryId, ticketId)),
    getTemplate: (repositoryId, templateId) =>
      sqlite("get template", () => projection.getTemplate(repositoryId, templateId)),
    getUser: (repositoryId, userId) =>
      sqlite("get user", () => projection.getUser(repositoryId, userId)),
    getView: (repositoryId, viewId) =>
      sqlite("get view", () => projection.getView(repositoryId, viewId)),
    inboxSummary,
    initiativeProgress,
    listInbox,
    listLabels: (repositoryId, query = {}) =>
      sqlite("list labels", () => projection.listLabels(repositoryId, query)),
    listRepositories: () => sqlite("list repositories", () => projection.listRepositories()),
    listTemplates: (repositoryId, query = {}) =>
      sqlite("list templates", () => projection.listTemplates(repositoryId, query)),
    listTickets: (query = {}) => sqlite("list tickets", () => projection.listTickets(query)),
    listUsers: (repositoryId, query = {}) =>
      sqlite("list users", () => projection.listUsers(repositoryId, query)),
    listViews: (repositoryId, query = {}) =>
      sqlite("list views", () => projection.listViews(repositoryId, query)),
    materializationWarnings: (repositoryId) =>
      sqlite("list materialization warnings", () => projection.warnings(repositoryId)),
    markInboxRead,
    markInboxUnread,
    openRepository: (input) =>
      Effect.gen(function* () {
        yield* sqlite("register repository", () => projection.registerRepository(input));

        const cycleMetadata = undefined;

        repositories.set(input.repositoryId, {
          cycleMetadata,
          displayName: input.displayName ?? input.repositoryId,
          gitDir: input.gitDir,
          repositoryId: input.repositoryId,
          store: input.store,
          worktreePath: input.worktreePath,
        });
        yield* sqlite("set Cycle repository metadata", () =>
          projection.setCycleRepositoryMetadata(input.repositoryId, cycleMetadata),
        );

        if (input.syncOnOpen === false) {
          return yield* sqlite("repository status", () =>
            projection.repositoryStatus(input.repositoryId),
          );
        }

        const status = yield* syncRepository(input.repositoryId);
        if (status.activeSnapshotId !== null) {
          yield* ensureDefaultMetadata(input.repositoryId);
        }
        return yield* sqlite("repository status after default metadata", () =>
          projection.repositoryStatus(input.repositoryId),
        ).pipe(Effect.catch(() => Effect.succeed(status)));
      }),
    repositoryHistory: (repositoryId, query = {}) =>
      sqlite("repository history", () => projection.repositoryHistory(repositoryId, query)),
    pushRepository,
    repositoryStatus: (repositoryId) =>
      sqlite("repository status", () => projection.repositoryStatus(repositoryId)),
    removeIssueRelation: (repositoryId, ticketId, relation, options) =>
      mutateIssueRelation(repositoryId, ticketId, relation, "remove", options),
    restoreTicket,
    searchTickets: (query) => sqlite("search tickets", () => projection.searchTickets(query)),
    syncRepository,
    ticketComments: (repositoryId, ticketId, query = {}) =>
      sqlite("ticket comments", () =>
        projection.getTicket(repositoryId, ticketId) === null
          ? { entries: [] }
          : projection.ticketComments(repositoryId, ticketId, query),
      ),
    ticketHistory: (repositoryId, ticketId, query = {}) =>
      sqlite("ticket history", () =>
        projection.repositoryHistory(repositoryId, {
          ...query,
          ticketId,
        }),
      ),
    ticketDiff,
    ticketRevision,
    ticketRecords: (repositoryId, ticketId, query = {}) =>
      sqlite("ticket records", () =>
        projection.getTicket(repositoryId, ticketId) === null
          ? { entries: [] }
          : projection.ticketRecords(repositoryId, ticketId, query),
      ),
    transitionTicket: (repositoryId, ticketId, input, options) =>
      updateTicket(repositoryId, ticketId, {
        frontmatter: {
          status: input.status,
        },
        message: options?.message,
      }),
    updateDraft,
    updateTemplate,
    updateTicket,
    updateView,
    upsertLabel,
    upsertUser,
  };
};

export const DatabaseLive = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    const identity = yield* DatabaseIdentity;
    const ids = yield* DatabaseIdGenerator;

    return yield* Effect.acquireRelease(
      Effect.succeed(DatabaseService.of(makeDatabaseService(identity, ids))),
      (service) => service.close(),
    );
  }),
);

export const DatabaseLiveWithOptions = (options: DatabaseServiceOptions) =>
  Layer.effect(
    DatabaseService,
    Effect.gen(function* () {
      const identity = yield* DatabaseIdentity;
      const ids = yield* DatabaseIdGenerator;

      return yield* Effect.acquireRelease(
        Effect.succeed(DatabaseService.of(makeDatabaseService(identity, ids, options))),
        (service) => service.close(),
      );
    }),
  );

export const DatabaseTest = (prefix?: string) =>
  DatabaseLiveWithOptions({ projectionPath: ":memory:" }).pipe(
    Layer.provide(Layer.mergeAll(DatabaseIdentityTest(), DatabaseIdGeneratorDeterministic(prefix))),
  );

const buildMaterialization = (
  projection: Projection,
  repository: RepositoryRuntime,
  previousSnapshotId: string | null,
  currentSnapshotId: string,
  trace?: MaterializationTrace,
) =>
  Effect.gen(function* () {
    let history = yield* readMaterializationHistory(
      projection,
      repository,
      previousSnapshotId,
      currentSnapshotId,
      trace,
    );
    const foldStartedAt = performance.now();
    let folded = yield* foldRepositoryEvents(repository, currentSnapshotId, trace, {
      history: history.snapshots,
      seed: history.fullRebuild
        ? emptyFoldedEvents()
        : seedIncrementalFoldedEvents(projection, repository.repositoryId),
      seedFromProjection: history.fullRebuild
        ? undefined
        : {
            projection,
            repositoryId: repository.repositoryId,
          },
    });

    if (!history.fullRebuild && folded.nonAdditiveEvents.length > 0) {
      if (trace !== undefined)
        yield* trace("sync materialization falling back to full rebuild", {
          nonAdditiveEvents: folded.nonAdditiveEvents.length,
          previousSnapshotId,
          snapshotId: currentSnapshotId,
        });
      history = {
        fullRebuild: true,
        sequenceStart: 0,
        snapshots: yield* storage(
          "read full event history",
          repository.store.history(currentSnapshotId),
        ),
      };
      folded = yield* foldRepositoryEvents(repository, currentSnapshotId, trace, {
        history: history.snapshots,
        seed: emptyFoldedEvents(),
      });
    }

    if (trace !== undefined)
      yield* trace("sync materialization fold completed", {
        foldMs: elapsedMs(foldStartedAt),
        fullRebuild: history.fullRebuild,
        labels: folded.labels.size,
        replayedCommits: history.snapshots.length,
        records: folded.records.size,
        templates: folded.templates.size,
        tickets: folded.tickets.size,
        users: folded.users.size,
        views: folded.views.size,
        warnings: folded.warnings.length,
      });

    const assembleStartedAt = performance.now();
    const ticketValues = history.fullRebuild
      ? [...folded.tickets.values()]
      : valuesForIds(folded.tickets, folded.changedTickets);
    const recordValues = history.fullRebuild
      ? [...folded.records.values()]
      : valuesForIds(folded.records, folded.changedRecords);
    const userValues = history.fullRebuild
      ? [...folded.users.values()]
      : valuesForIds(folded.users, folded.changedUsers);
    const labelValues = history.fullRebuild
      ? [...folded.labels.values()]
      : valuesForIds(folded.labels, folded.changedLabels);
    const viewValues = history.fullRebuild
      ? [...folded.views.values()]
      : valuesForIds(folded.views, folded.changedViews);
    const templateValues = history.fullRebuild
      ? [...folded.templates.values()]
      : valuesForIds(folded.templates, folded.changedTemplates);
    const tickets = ticketValues.map((ticket) => ({
      path: eventAggregatePath("ticket", ticket.id),
      value: ticket,
    }));
    const records = recordValues.map((record) => ({
      path: eventAggregatePath("record", record.id),
      value: record,
    }));
    const users = userValues.map((user) => ({
      path: eventAggregatePath("user", user.id),
      value: user,
    }));
    const labels = labelValues.map((label) => ({
      path: eventAggregatePath("label", label.id),
      value: label,
    }));
    const views = viewValues.map((view) => ({
      path: eventAggregatePath("view", view.id),
      value: view,
    }));
    const templates = templateValues.map((template) => ({
      path: eventAggregatePath("template", template.id),
      value: template,
    }));
    const warnings = [...folded.warnings];
    const now = nowIso();

    const ticketIds = new Set(folded.tickets.keys());
    for (const ticket of folded.tickets.values()) {
      for (const childId of ticket.frontmatter.children ?? []) {
        if (ticketIds.has(childId)) continue;

        warnings.push(
          warning(
            repository.repositoryId,
            currentSnapshotId,
            eventAggregatePath("ticket", ticket.id),
            "ticket",
            ticket.id,
            new Error(`unknown child issue id: ${childId}`),
            now,
            "unknown-child-issue",
          ),
        );
      }
    }
    if (trace !== undefined)
      yield* trace("sync materialization documents assembled", {
        assembleMs: elapsedMs(assembleStartedAt),
        labels: labels.length,
        records: records.length,
        templates: templates.length,
        tickets: tickets.length,
        users: users.length,
        views: views.length,
        warnings: warnings.length,
      });

    const commitsStartedAt = performance.now();
    const commits = buildCommitRows(repository, history.snapshots, history.sequenceStart);
    if (trace !== undefined)
      yield* trace("sync materialization commits built", {
        commits: commits.length,
        commitsMs: elapsedMs(commitsStartedAt),
      });

    const commitChangesStartedAt = performance.now();
    const commitChanges = folded.commitChanges;
    if (trace !== undefined)
      yield* trace("sync materialization commit changes built", {
        commitChanges: commitChanges.length,
        commitChangesMs: elapsedMs(commitChangesStartedAt),
      });

    const inboxStartedAt = performance.now();
    const inboxUsers = history.fullRebuild
      ? [...folded.users.values()]
      : mergeUsers(
          userValues,
          projection.usersByRecipientLookupKeys(
            repository.repositoryId,
            inboxRecipientLookupKeys(folded),
          ),
        );
    const inboxItems = deriveInboxItems(repository.repositoryId, folded, inboxUsers);
    if (trace !== undefined)
      yield* trace("sync materialization inbox derived", {
        inboxItems: inboxItems.length,
        inboxMs: elapsedMs(inboxStartedAt),
        users: inboxUsers.length,
      });

    return {
      commitChanges,
      commits,
      cycleMetadata: folded.cycleMetadata,
      deletedRecords: history.fullRebuild ? [] : [...folded.deletedRecords],
      deletedTickets: history.fullRebuild ? [] : [...folded.deletedTickets],
      deletedLabels: history.fullRebuild ? [] : [...folded.deletedLabels],
      deletedTemplates: history.fullRebuild ? [] : [...folded.deletedTemplates],
      deletedUsers: history.fullRebuild ? [] : [...folded.deletedUsers],
      deletedViews: history.fullRebuild ? [] : [...folded.deletedViews],
      fullRebuild: history.fullRebuild,
      inboxItems,
      labels,
      records,
      templates,
      tickets,
      users,
      views,
      warnings,
    };
  });

const readMaterializationHistory = (
  projection: Projection,
  repository: RepositoryRuntime,
  previousSnapshotId: string | null,
  currentSnapshotId: string,
  trace?: MaterializationTrace,
): Effect.Effect<
  {
    readonly fullRebuild: boolean;
    readonly sequenceStart: number;
    readonly snapshots: ReadonlyArray<GitDbSnapshot>;
  },
  DatabaseFailure
> =>
  Effect.gen(function* () {
    if (previousSnapshotId === null) {
      const history = yield* storage(
        "read full event history",
        repository.store.history(currentSnapshotId),
      );
      if (trace !== undefined)
        yield* trace("sync materialization selected full rebuild", {
          commits: history.length,
          reason: "no-previous-snapshot",
          snapshotId: currentSnapshotId,
        });

      return {
        fullRebuild: true,
        sequenceStart: 0,
        snapshots: history,
      };
    }

    const incremental = yield* readHistorySince(repository, currentSnapshotId, previousSnapshotId);

    if (!incremental.reachedPrevious) {
      if (trace !== undefined)
        yield* trace("sync materialization selected full rebuild", {
          commits: incremental.snapshots.length,
          previousSnapshotId,
          reason: "previous-snapshot-not-in-history",
          snapshotId: currentSnapshotId,
        });

      return {
        fullRebuild: true,
        sequenceStart: 0,
        snapshots: incremental.snapshots,
      };
    }

    const sequenceStart = projection.maxCommitSequence(repository.repositoryId);
    if (trace !== undefined)
      yield* trace("sync materialization selected incremental replay", {
        commits: incremental.snapshots.length,
        previousSequence: sequenceStart,
        previousSnapshotId,
        snapshotId: currentSnapshotId,
      });

    return {
      fullRebuild: false,
      sequenceStart,
      snapshots: incremental.snapshots,
    };
  });

const readHistorySince = (
  repository: RepositoryRuntime,
  currentSnapshotId: string,
  previousSnapshotId: string,
): Effect.Effect<
  {
    readonly reachedPrevious: boolean;
    readonly snapshots: ReadonlyArray<GitDbSnapshot>;
  },
  DatabaseFailure
> =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    const stack = [currentSnapshotId];
    const snapshots: Array<GitDbSnapshot> = [];
    let reachedPrevious = false;

    while (stack.length > 0) {
      const id = stack.shift();

      if (id === undefined) continue;
      if (id === previousSnapshotId) {
        reachedPrevious = true;
        continue;
      }
      if (seen.has(id)) continue;

      seen.add(id);

      const snapshot = yield* storage("read repository snapshot", repository.store.snapshot(id));
      snapshots.push(snapshot);

      for (const parent of snapshot.parents) {
        if (parent === previousSnapshotId) {
          reachedPrevious = true;
          continue;
        }
        if (!seen.has(parent)) {
          stack.push(parent);
        }
      }
    }

    return {
      reachedPrevious,
      snapshots,
    };
  });

const seedIncrementalFoldedEvents = (
  projection: Projection,
  repositoryId: string,
): FoldedEvents => {
  const folded = emptyFoldedEvents();
  const status = projection.repositoryStatus(repositoryId);

  folded.cycleMetadata = status.cycleMetadata;

  return folded;
};

const valuesForIds = <A>(
  values: ReadonlyMap<string, A>,
  ids: ReadonlySet<string>,
): ReadonlyArray<A> =>
  [...ids].flatMap((id) => {
    const value = values.get(id);

    return value === undefined ? [] : [value];
  });

const emptyFoldedEvents = (): FoldedEvents => ({
  changedLabels: new Set(),
  changedRecords: new Set(),
  changedTemplates: new Set(),
  changedTickets: new Set(),
  changedUsers: new Set(),
  changedViews: new Set(),
  commitChanges: [],
  deletedLabels: new Set(),
  deletedRecords: new Set(),
  deletedTemplates: new Set(),
  deletedTickets: new Set(),
  deletedUsers: new Set(),
  deletedViews: new Set(),
  drafts: new Map(),
  inboxSources: [],
  labels: new Map(),
  nonAdditiveEvents: [],
  records: new Map(),
  templates: new Map(),
  tickets: new Map(),
  users: new Map(),
  views: new Map(),
  warnings: [],
});

const eventAggregatePath = (aggregateType: string, aggregateId: string): string =>
  GitDbEvent.aggregatePath({ aggregateId, aggregateType });

const foldRepositoryEvents = (
  repository: RepositoryRuntime,
  snapshotId?: string,
  trace?: MaterializationTrace,
  options: {
    readonly history?: ReadonlyArray<GitDbSnapshot>;
    readonly seed?: FoldedEvents;
    readonly seedFromProjection?: {
      readonly projection: Projection;
      readonly repositoryId: string;
    };
  } = {},
): Effect.Effect<FoldedEvents, DatabaseFailure> =>
  Effect.gen(function* () {
    const currentSnapshotId =
      snapshotId ??
      (yield* storage("resolve current snapshot", repository.store.resolveSnapshotId()));

    if (currentSnapshotId === null) return emptyFoldedEvents();

    const historyStartedAt = performance.now();
    const history =
      options.history ??
      (yield* storage("read event history", repository.store.history(currentSnapshotId)));
    if (trace !== undefined)
      yield* trace("sync event history read", {
        commits: history.length,
        historyMs: elapsedMs(historyStartedAt),
        snapshotId: currentSnapshotId,
      });
    const folded = options.seed ?? emptyFoldedEvents();
    const warnings: Array<MaterializationWarning> = [...folded.warnings];
    let documentsRead = 0;
    let introducedEvents = 0;
    let processedCommits = 0;
    const foldStartedAt = performance.now();

    for (const snapshot of history.slice().reverse()) {
      const introduced = yield* storage(
        "read introduced events",
        GitDbEvent.introduced(repository.store, snapshot),
      );
      introducedEvents += introduced.length;
      folded.commitChanges.push({
        changes: introduced.map((event) =>
          eventPathChange(changeTypeFromDiff(event.change), event.path),
        ),
        repositoryId: repository.repositoryId,
        snapshotId: snapshot.id,
      });
      const timestamp = snapshot.createdAt ?? nowIso();
      const actor = actorFromSnapshot(snapshot);

      for (const event of introduced) {
        if (event.change.newObjectId === undefined) {
          folded.nonAdditiveEvents.push({
            path: event.path,
            reason: "event-deleted",
            snapshotId: snapshot.id,
          });
          warnings.push(
            warning(
              repository.repositoryId,
              snapshot.id,
              event.path,
              event.aggregateType,
              event.aggregateId,
              new Error("event file was deleted"),
              nowIso(),
              "event-deleted",
            ),
          );
          continue;
        }

        if (event.change.oldObjectId !== undefined) {
          folded.nonAdditiveEvents.push({
            path: event.path,
            reason: "event-modified",
            snapshotId: snapshot.id,
          });
          warnings.push(
            warning(
              repository.repositoryId,
              snapshot.id,
              event.path,
              event.aggregateType,
              event.aggregateId,
              new Error("event file was modified"),
              nowIso(),
              "event-modified",
            ),
          );
          continue;
        }

        const document = yield* storage(
          "read event document",
          repository.store.get(event.path, { from: snapshot.id }),
        );

        if (document === null) continue;
        documentsRead += 1;

        yield* Effect.try({
          try: () => {
            const payload = document.json();

            if (options.seedFromProjection !== undefined) {
              seedFoldedEventFromProjection(
                folded,
                options.seedFromProjection.projection,
                options.seedFromProjection.repositoryId,
                event.aggregateType,
                event.aggregateId,
                payload,
              );
            }

            applyDatabaseEvent(folded, event.aggregateType, event.aggregateId, payload, {
              actor,
              path: event.path,
              snapshotId: snapshot.id,
              timestamp,
            });
          },
          catch: (cause) => new EventFoldError({ cause }),
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              warnings.push(
                warning(
                  repository.repositoryId,
                  snapshot.id,
                  event.path,
                  event.aggregateType,
                  event.aggregateId,
                  error.cause,
                  nowIso(),
                ),
              );
            }),
          ),
        );
      }
      processedCommits += 1;
      if (processedCommits % 10 === 0 || processedCommits === history.length) {
        if (trace !== undefined)
          yield* trace("sync event fold progress", {
            commitsProcessed: processedCommits,
            commitsTotal: history.length,
            documentsRead,
            foldMs: elapsedMs(foldStartedAt),
            introducedEvents,
            labels: folded.labels.size,
            records: folded.records.size,
            tickets: folded.tickets.size,
            warnings: warnings.length,
          });
      }
    }

    return {
      ...folded,
      warnings,
    };
  });

const seedFoldedEventFromProjection = (
  folded: FoldedEvents,
  projection: Projection,
  repositoryId: string,
  aggregateType: string,
  aggregateId: string,
  payload: unknown,
): void => {
  if (payload === null || typeof payload !== "object") return;

  const event = payload as Partial<DatabaseEventPayload>;
  const seedTicket = (ticketId: string): void => {
    if (folded.tickets.has(ticketId)) return;

    const ticket = projection.getTicket(repositoryId, ticketId);
    if (ticket !== null) {
      folded.tickets.set(ticketId, ticket);
    }
  };

  if (
    aggregateType === "ticket" &&
    (event.op === "ticket.replace" ||
      event.op === "ticket.update" ||
      event.op === "ticket.archive" ||
      event.op === "ticket.delete" ||
      event.op === "ticket.restore")
  ) {
    seedTicket(aggregateId);
    return;
  }

  if (event.op === "record.add") {
    const record = event.value as Partial<LinkedRecord> | undefined;

    if (record !== undefined && typeof record.issueId === "string") {
      seedTicket(record.issueId);
    }
  }
};

const applyDatabaseEvent = (
  folded: FoldedEvents,
  aggregateType: string,
  aggregateId: string,
  payload: unknown,
  context: EventContext,
): void => {
  if (payload === null || typeof payload !== "object") {
    throw new Error("event payload must be an object");
  }

  const event = payload as DatabaseEventPayload;

  switch (event.op) {
    case "repository.metadata.set": {
      folded.cycleMetadata = parseCycleRepositoryMetadata(event.value, context.timestamp);
      return;
    }
    case "ticket.create":
    case "ticket.replace": {
      const before = folded.tickets.get(aggregateId) ?? null;
      const ticket = parseTicketValue(event.value);

      folded.tickets.set(aggregateId, ticket);
      folded.deletedTickets.delete(aggregateId);
      folded.changedTickets.add(aggregateId);
      pushInboxSource(folded, {
        actor: context.actor,
        after: ticket,
        before,
        eventPath: context.path,
        op: event.op,
        snapshotId: context.snapshotId,
        timestamp: context.timestamp,
        ticketId: aggregateId,
      });
      return;
    }
    case "ticket.update": {
      const ticket = folded.tickets.get(aggregateId);

      if (ticket === undefined) throw new Error(`ticket does not exist: ${aggregateId}`);

      const next = applyTicketFieldUpdate(ticket, event.field, event.value);
      folded.tickets.set(aggregateId, next);
      folded.changedTickets.add(aggregateId);
      pushInboxSource(folded, {
        actor: context.actor,
        after: next,
        before: ticket,
        eventPath: context.path,
        field: event.field,
        op: "ticket.update",
        snapshotId: context.snapshotId,
        timestamp: context.timestamp,
        ticketId: aggregateId,
      });
      return;
    }
    case "ticket.archive": {
      const ticket = requireTicket(folded, aggregateId);
      const actor = context.actor ?? ticket.frontmatter.createdBy;

      folded.tickets.set(
        aggregateId,
        updateTicketDocument(ticket, {
          ...ticket.frontmatter,
          archivedAt: context.timestamp,
          archivedBy: actor,
          updatedAt: context.timestamp,
        }),
      );
      folded.changedTickets.add(aggregateId);
      return;
    }
    case "ticket.delete": {
      const ticket = requireTicket(folded, aggregateId);
      const actor = context.actor ?? ticket.frontmatter.createdBy;

      folded.tickets.set(
        aggregateId,
        updateTicketDocument(ticket, {
          ...ticket.frontmatter,
          deletedAt: context.timestamp,
          deletedBy: actor,
          updatedAt: context.timestamp,
        }),
      );
      folded.changedTickets.add(aggregateId);
      return;
    }
    case "ticket.restore": {
      const ticket = requireTicket(folded, aggregateId);

      folded.tickets.set(
        aggregateId,
        updateTicketDocument(ticket, {
          ...ticket.frontmatter,
          archivedAt: undefined,
          archivedBy: undefined,
          deletedAt: undefined,
          deletedBy: undefined,
          updatedAt: context.timestamp,
        }),
      );
      folded.changedTickets.add(aggregateId);
      return;
    }
    case "record.add": {
      const record = parseRecord(event.value);

      folded.records.set(record.id, record);
      folded.deletedRecords.delete(record.id);
      folded.changedRecords.add(record.id);
      pushInboxSource(folded, {
        actor: context.actor,
        eventPath: context.path,
        op: "record.add",
        record,
        snapshotId: context.snapshotId,
        timestamp: context.timestamp,
        ticket: folded.tickets.get(record.issueId) ?? null,
      });
      return;
    }
    case "draft.create":
    case "draft.update":
    case "draft.commit": {
      const draft = parseDraft(event.value);

      folded.drafts.set(draft.id, draft);
      return;
    }
    case "user.upsert": {
      const user = parseUserProfile(event.value);

      folded.users.set(user.id, user);
      folded.deletedUsers.delete(user.id);
      folded.changedUsers.add(user.id);
      return;
    }
    case "label.upsert": {
      const label = parseLabelDefinition(event.value);

      folded.labels.set(label.id, label);
      folded.deletedLabels.delete(label.id);
      folded.changedLabels.add(label.id);
      return;
    }
    case "view.upsert": {
      const view = parseSavedView(event.value);

      folded.views.set(view.id, view);
      folded.deletedViews.delete(view.id);
      folded.changedViews.add(view.id);
      return;
    }
    case "view.delete": {
      folded.views.delete(aggregateId);
      folded.changedViews.delete(aggregateId);
      folded.deletedViews.add(aggregateId);
      return;
    }
    case "template.upsert": {
      const template = parseIssueTemplate(event.value);

      folded.templates.set(template.id, template);
      folded.deletedTemplates.delete(template.id);
      folded.changedTemplates.add(template.id);
      return;
    }
  }

  throw new Error(
    `unsupported event operation: ${String((payload as { readonly op?: unknown }).op)}`,
  );
};

const pushInboxSource = (folded: FoldedEvents, source: InboxSourceEventInput): void => {
  folded.inboxSources.push({
    ...source,
    sequence: folded.inboxSources.length + 1,
  } as InboxSourceEvent);
};

type InboxRecipient = {
  readonly user: UserProfileDocument;
  readonly userId: string;
};

const mergeUsers = (
  ...groups: ReadonlyArray<ReadonlyArray<UserProfileDocument>>
): ReadonlyArray<UserProfileDocument> => {
  const users = new Map<string, UserProfileDocument>();

  for (const group of groups) {
    for (const user of group) {
      users.set(user.id, user);
    }
  }

  return [...users.values()];
};

const inboxRecipientLookupKeys = (folded: FoldedEvents): ReadonlyArray<string> => {
  const keys = new Set<string>();
  const add = (value: string | undefined): void => {
    if (value === undefined) return;
    for (const key of recipientLookupKeys(value)) {
      keys.add(key);
    }
  };
  const addActor = (actor: Actor | undefined): void => {
    add(actor?.email);
    add(actor?.name);
  };

  for (const source of folded.inboxSources) {
    if (
      source.op === "ticket.create" ||
      source.op === "ticket.update" ||
      source.op === "ticket.replace"
    ) {
      for (const mention of extractMentionTags(ticketMentionText(source.after))) {
        add(mention.normalized);
      }
      add(inboxAssigneeValue(source.after));
      continue;
    }

    if (source.op === "record.add" && normalizeKey(source.record.recordType) === "comment") {
      const ticket = source.ticket ?? folded.tickets.get(source.record.issueId);
      const body = commentPayloadBody(source.record.payload);

      for (const mention of extractMentionTags(body)) {
        add(mention.normalized);
      }
      if (ticket !== undefined && ticket !== null) {
        add(inboxAssigneeValue(ticket));
        addActor(ticket.frontmatter.createdBy);
      }
    }
  }

  return [...keys];
};

const deriveInboxItems = (
  repositoryId: string,
  folded: FoldedEvents,
  users: ReadonlyArray<UserProfileDocument>,
): ReadonlyArray<InboxItem> => {
  const resolver = makeInboxRecipientResolver(users);
  const items = new Map<string, InboxItem>();

  const addItem = (
    source: InboxSourceEvent,
    recipient: InboxRecipient,
    reason: InboxReason,
    ticket: TicketDocument,
    options: {
      readonly bodyExcerpt?: string;
      readonly mention?: string;
      readonly recordId?: string;
    } = {},
  ): void => {
    if (!ticketActive(ticket)) return;
    if (sourceAuthoredByRecipient(source, recipient.userId)) return;

    const itemId = deriveInboxItemId({
      eventPath: source.eventPath,
      reason,
      recordId: options.recordId,
      repositoryId,
      ticketId: ticket.id,
      userId: recipient.userId,
    });
    const metadata = stripUndefined({
      actorUnknown: source.actor === undefined,
      mention: options.mention,
      sourceOperation: source.op,
    }) as Readonly<Record<string, unknown>>;

    if (items.has(itemId)) return;

    items.set(
      itemId,
      stripUndefined({
        actorEmail: source.actor?.email,
        actorName: source.actor?.name,
        bodyExcerpt: options.bodyExcerpt,
        createdAt: source.timestamp,
        eventPath: source.eventPath,
        itemId,
        metadataJson: JSON.stringify(metadata),
        reason,
        recordId: options.recordId,
        repositoryId,
        sequence: source.sequence,
        snapshotId: source.snapshotId,
        ticketId: ticket.id,
        title: ticket.title,
        userId: recipient.userId,
      }) as InboxItem,
    );
  };

  for (const source of folded.inboxSources) {
    if (
      source.op === "ticket.create" ||
      source.op === "ticket.update" ||
      source.op === "ticket.replace"
    ) {
      const beforeMentions =
        source.before === null ? new Set<string>() : mentionSet(ticketMentionText(source.before));
      const afterMentions = extractMentionTags(ticketMentionText(source.after));

      for (const mention of afterMentions) {
        if (beforeMentions.has(mention.normalized)) continue;
        for (const recipient of resolver.resolveMention(mention.normalized)) {
          addItem(source, recipient, "mention", source.after, {
            bodyExcerpt: excerptForTicket(source.after),
            mention: mention.tag,
          });
        }
      }

      const beforeAssignee = source.before === null ? undefined : inboxAssigneeValue(source.before);
      const afterAssignee = inboxAssigneeValue(source.after);

      if (afterAssignee !== undefined && afterAssignee !== beforeAssignee) {
        for (const recipient of resolver.resolveAssignee(afterAssignee)) {
          addItem(source, recipient, "assigned", source.after, {
            bodyExcerpt: excerptForTicket(source.after),
          });
        }
      }

      continue;
    }

    if (source.op === "record.add" && normalizeKey(source.record.recordType) === "comment") {
      const ticket = source.ticket ?? folded.tickets.get(source.record.issueId);
      if (ticket === undefined || ticket === null) continue;

      const body = commentPayloadBody(source.record.payload);
      const excerpt = excerptForText(body);

      for (const mention of extractMentionTags(body)) {
        for (const recipient of resolver.resolveMention(mention.normalized)) {
          addItem(source, recipient, "mention", ticket, {
            bodyExcerpt: excerpt,
            mention: mention.tag,
            recordId: source.record.id,
          });
        }
      }

      const assignee = inboxAssigneeValue(ticket);
      if (assignee !== undefined) {
        for (const recipient of resolver.resolveAssignee(assignee)) {
          addItem(source, recipient, "comment_assigned", ticket, {
            bodyExcerpt: excerpt,
            recordId: source.record.id,
          });
        }
      }

      for (const recipient of resolver.resolveActor(ticket.frontmatter.createdBy)) {
        addItem(source, recipient, "comment_created", ticket, {
          bodyExcerpt: excerpt,
          recordId: source.record.id,
        });
      }
    }
  }

  return [...items.values()].sort(
    (a, b) => a.sequence - b.sequence || a.itemId.localeCompare(b.itemId),
  );
};

const makeInboxRecipientResolver = (users: ReadonlyArray<UserProfileDocument>) => {
  const lookup = new Map<string, Map<string, UserProfileDocument>>();

  const add = (key: string, user: UserProfileDocument): void => {
    for (const normalized of recipientLookupKeys(key)) {
      const current = lookup.get(normalized) ?? new Map<string, UserProfileDocument>();
      current.set(user.id, user);
      lookup.set(normalized, current);
    }
  };

  for (const user of users) {
    if (user.disabledAt !== undefined) continue;

    add(user.id, user);
    add(user.email, user);
    add(user.displayName, user);
    for (const alias of user.aliases ?? []) {
      add(alias, user);
    }
  }

  const resolve = (value: string | undefined): ReadonlyArray<InboxRecipient> => {
    if (value === undefined) return [];

    const matches = new Map<string, UserProfileDocument>();
    for (const key of recipientLookupKeys(value)) {
      for (const [userId, user] of lookup.get(key) ?? []) {
        matches.set(userId, user);
      }
    }

    if (matches.size !== 1) return [];

    const [entry] = matches;
    if (entry === undefined) return [];

    return [{ user: entry[1], userId: entry[0] }];
  };

  return {
    resolveActor: (actor: Actor): ReadonlyArray<InboxRecipient> =>
      resolve(actor.email ?? actor.name),
    resolveAssignee: resolve,
    resolveMention: resolve,
  };
};

const recipientLookupKeys = (value: string): ReadonlyArray<string> => {
  const raw = value.trim().replace(/^@/u, "").toLowerCase();
  if (raw.length === 0) return [];

  const keys = new Set<string>([raw, normalizeKey(raw)]);

  if (/\s/u.test(raw)) {
    keys.add(raw.replace(/\s+/gu, "."));
    keys.add(raw.replace(/\s+/gu, "-"));
    keys.add(raw.replace(/\s+/gu, ""));
  }

  return [...keys].filter((key) => key.length > 0 && key !== "none");
};

const ticketMentionText = (ticket: TicketDocument): string => `${ticket.title}\n${ticket.body}`;

const mentionSet = (value: string): Set<string> =>
  new Set(extractMentionTags(value).map((mention) => mention.normalized));

const inboxAssigneeValue = (ticket: TicketDocument): string | undefined => {
  const value = ticket.frontmatter.assignee ?? ticket.assignee;
  if (value === null || value === undefined) return undefined;

  const normalized = String(value).trim();
  return normalized.length === 0 || normalizeKey(normalized) === "none" ? undefined : normalized;
};

const ticketActive = (ticket: TicketDocument): boolean =>
  ticket.archivedAt === undefined && ticket.deletedAt === undefined;

const sourceAuthoredByRecipient = (source: InboxSourceEvent, userId: string): boolean => {
  const actorEmail = source.actor?.email?.trim().toLowerCase();
  return actorEmail !== undefined && actorEmail === userId.toLowerCase();
};

const excerptForTicket = (ticket: TicketDocument): string | undefined =>
  excerptForText(ticket.body);

const excerptForText = (value: string): string | undefined => {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length === 0) return undefined;
  if (compact.length <= 180) return compact;

  return `${compact.slice(0, 177).trimEnd()}...`;
};

const parseTicketValue = (input: unknown): TicketDocument => {
  if (input === null || typeof input !== "object") throw new Error("ticket must be an object");

  const value = input as Partial<TicketDocument>;

  if (value.frontmatter === undefined || typeof value.body !== "string") {
    throw new Error("ticket is missing required fields");
  }

  const ticket = makeTicketDocument(makeIssueFrontmatter(value.frontmatter), value.body);

  validateTicketSync(ticket);

  return ticket;
};

const requireTicket = (folded: FoldedEvents, ticketId: string): TicketDocument => {
  const ticket = folded.tickets.get(ticketId);

  if (ticket === undefined) throw new Error(`ticket does not exist: ${ticketId}`);

  return ticket;
};

const applyTicketFieldUpdate = (
  ticket: TicketDocument,
  field: keyof IssueFrontmatter | "body",
  value: unknown,
): TicketDocument => {
  if (field === "body")
    return updateTicketDocument(ticket, ticket.frontmatter, String(value ?? ""));

  const frontmatter = {
    ...ticket.frontmatter,
    [field]: value === null ? undefined : value,
  } as IssueFrontmatter;

  return updateTicketDocument(ticket, frontmatter);
};

const parseDraft = (input: unknown): TicketDraftDocument => {
  if (input === null || typeof input !== "object") throw new Error("draft must be an object");

  const value = input as Partial<TicketDraftDocument>;

  if (
    typeof value.id !== "string" ||
    value.input === undefined ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    value.createdBy === undefined ||
    (value.status !== "open" && value.status !== "committed")
  ) {
    throw new Error("draft is missing required fields");
  }

  return {
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    id: value.id,
    input: value.input,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    status: value.status,
    updatedAt: value.updatedAt,
  };
};

const actorFromSnapshot = (snapshot: {
  readonly author?: { readonly email?: string; readonly name?: string };
  readonly committer?: { readonly email?: string; readonly name?: string };
}): Actor | undefined => {
  const identity = snapshot.author ?? snapshot.committer;

  if (identity?.name === undefined) return undefined;

  return {
    email: identity.email,
    name: identity.name,
    type: identity.email === undefined ? "agent" : "human",
  };
};

const buildCommitRows = (
  repository: RepositoryRuntime,
  history: ReadonlyArray<GitDbSnapshot>,
  sequenceStart: number,
) =>
  history
    .slice()
    .reverse()
    .map((snapshot, index) => ({
      authorEmail: snapshot.author?.email,
      authorName: snapshot.author?.name,
      committedAt: snapshot.createdAt,
      committerEmail: snapshot.committer?.email,
      committerName: snapshot.committer?.name,
      message: snapshot.message,
      parentIds: snapshot.parents,
      repositoryId: repository.repositoryId,
      rootTreeId: snapshot.root,
      sequence: sequenceStart + index + 1,
      snapshotId: snapshot.id,
    }));

const changeTypeFromDiff = (change: {
  readonly newObjectId?: string;
  readonly oldObjectId?: string;
}): "added" | "deleted" | "modified" =>
  change.newObjectId === undefined
    ? "deleted"
    : change.oldObjectId === undefined
      ? "added"
      : "modified";

const eventPathChange = (
  changeType: "added" | "deleted" | "modified",
  path: string,
): CommitChange => {
  const event = GitDbEvent.parseEventPath(path);

  return {
    changeType,
    objectId: event?.aggregateId,
    objectType: event?.aggregateType ?? "unknown",
    path,
    ticketId:
      event?.aggregateType === "ticket"
        ? event.aggregateId
        : event?.aggregateType === "record"
          ? ticketIdFromRecordId(event.aggregateId)
          : undefined,
  };
};

const validateTicket = (ticket: TicketDocument): Effect.Effect<void, DatabaseFailure> =>
  Effect.try({
    catch: (cause) =>
      cause instanceof Error
        ? new ValidationError({ field: "ticket", message: cause.message, cause: cause })
        : new ValidationError({ field: "ticket", message: "invalid ticket", cause: cause }),
    try: () => validateTicketSync(ticket),
  }).pipe(
    Effect.mapError((error) =>
      error instanceof Error
        ? new ValidationError({ field: "ticket", message: error.message, cause: error })
        : new ValidationError({ field: "ticket", message: "invalid ticket", cause: error }),
    ),
  );

const validateTicketSync = (ticket: TicketDocument): void => {
  validateTicketId("ticket id", ticket.id);
  validateRequiredString("title", ticket.frontmatter.title);
  validateRequiredString("status", ticket.frontmatter.status);
  validateRequiredString("priority", ticket.frontmatter.priority);
  validateRequiredString("type", ticket.frontmatter.type);
  validateRequiredString("createdAt", ticket.frontmatter.createdAt);
  validateRequiredString("updatedAt", ticket.frontmatter.updatedAt);
  validateRequiredString("createdBy.name", ticket.frontmatter.createdBy.name);
};

const validateTicketId = (field: string, value: string): void => {
  if (!TICKET_ID_PATTERN.test(value)) {
    throw new Error(`${field} must match PREFIX-BASE36 format`);
  }
};

const validateSafeSegment = (field: string, value: string): void => {
  if (!SAFE_SEGMENT.test(value) || value.endsWith(".lock") || value === "." || value === "..") {
    throw new Error(`${field} must be a safe segment`);
  }
};

const validateRequiredString = (field: string, value: string): void => {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
};

const validateSavedViewKind = (value: string): void => {
  if (value !== "board" && value !== "list") throw new Error("view kind is invalid");
};

const validateSavedViewGroup = (value: string): void => {
  if (!["assignee", "dueDate", "label", "none", "parent", "priority", "status"].includes(value)) {
    throw new Error("view groupBy is invalid");
  }
};

const validateIssueTemplateKind = (value: string): void => {
  if (
    !["bug", "feature", "implementation", "initiative", "qa", "specification", "story"].includes(
      value,
    )
  ) {
    throw new Error("template kind is invalid");
  }
};

const assertNoUnsafeContent = (
  field: string,
  value: unknown,
): Effect.Effect<void, DatabaseFailure> => {
  const unsafeKey = findUnsafeKey(value);

  return unsafeKey === null
    ? Effect.void
    : Effect.fail(
        new ValidationError({
          field: field,
          message: `unsafe secret-bearing field is not allowed: ${unsafeKey}`,
        }),
      );
};

const findUnsafeKey = (value: unknown, path = ""): string | null => {
  if (value === null || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUnsafeKey(value[index], `${path}[${index}]`);

      if (found !== null) return found;
    }

    return null;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = path.length === 0 ? key : `${path}.${key}`;

    if (/(api[_-]?key|token|secret|password|private[_-]?key)/iu.test(key)) {
      return nestedPath;
    }

    const found = findUnsafeKey(nested, nestedPath);

    if (found !== null) return found;
  }

  return null;
};

const maxCommitTitleLength = 72;

const compactText = (value: string): string => value.replace(/\s+/gu, " ").trim();

const titleForCommitMessage = (title: string): string => {
  const compact = compactText(title);

  if (compact.length <= maxCommitTitleLength) return compact;

  return `${compact.slice(0, maxCommitTitleLength - 3).trimEnd()}...`;
};

const quoteCommitTitle = (title: string): string =>
  `"${titleForCommitMessage(title).replaceAll('"', "'")}"`;

const quotedTicketTitle = (ticket: TicketDocument): string => quoteCommitTitle(ticket.title);

const humanizeKey = (value: string): string =>
  compactText(value)
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`)
    .join(" ");

const createdTicketMessage = (actor: Actor, ticket: TicketDocument): string =>
  `${actor.name} created ${quotedTicketTitle(ticket)} ticket`;

const updatedTicketMessage = (
  actor: Actor,
  current: TicketDocument,
  next: TicketDocument,
): string => {
  if (next.status !== current.status) {
    return `${actor.name} updated the status of ${quotedTicketTitle(next)} to ${humanizeKey(next.status)}`;
  }

  if (next.title !== current.title) {
    return `${actor.name} renamed ${quotedTicketTitle(current)} ticket to ${quotedTicketTitle(next)}`;
  }

  return `${actor.name} updated ${quotedTicketTitle(next)} ticket`;
};

const relationMessage = (
  actor: Actor,
  action: "add" | "remove",
  relationType: IssueRelation["type"],
  source: TicketDocument,
  target: TicketDocument,
): string =>
  `${actor.name} ${action === "add" ? "added" : "removed"} ${humanizeKey(
    relationType,
  ).toLowerCase()} relation between ${quotedTicketTitle(source)} and ${quotedTicketTitle(target)}`;

const recordMessage = (actor: Actor, recordType: string, ticket: TicketDocument): string =>
  normalizeKey(recordType) === "comment"
    ? `${actor.name} commented on ${quotedTicketTitle(ticket)} ticket`
    : `${actor.name} added ${humanizeKey(recordType).toLowerCase()} to ${quotedTicketTitle(
        ticket,
      )} ticket`;

const draftTitle = (draft: TicketDraftDocument): string =>
  quoteCommitTitle(draft.input.title ?? "Untitled ticket");

const draftCreatedMessage = (actor: Actor, draft: TicketDraftDocument): string =>
  `${actor.name} drafted ${draftTitle(draft)} ticket`;

const draftUpdatedMessage = (actor: Actor, draft: TicketDraftDocument): string =>
  `${actor.name} updated draft for ${draftTitle(draft)} ticket`;

const makeRecord = (
  input: {
    readonly payload: unknown;
    readonly recordType: string;
    readonly ticketId: string;
  },
  id: string,
  actor: Actor,
  now: string,
): LinkedRecord => ({
  createdAt: now,
  createdBy: actor,
  createdDate: updatedDateKey(now),
  id,
  issueId: input.ticketId,
  payload: input.payload,
  recordType: normalizeKey(input.recordType),
  schemaVersion: CURRENT_SCHEMA_VERSION,
});

const initialProvenanceRecord = (
  ticketId: string,
  id: string,
  actor: Actor,
  now: string,
): LinkedRecord =>
  makeRecord(
    {
      payload: {
        actor,
        timestamp: now,
      },
      recordType: "provenance",
      ticketId,
    },
    id,
    actor,
    now,
  );

const statusChangeRecord = (
  ticketId: string,
  id: string,
  actor: Actor,
  now: string,
  from: string | null,
  to: string,
  reason?: string,
): LinkedRecord =>
  makeRecord(
    {
      payload: stripUndefined({
        from,
        reason,
        to,
      }),
      recordType: "status-change",
      ticketId,
    },
    id,
    actor,
    now,
  );

const issueRelationTypes = new Set(["blocked-by", "blocking", "duplicate", "related"]);

const isIssueRelationType = (value: string): value is IssueRelation["type"] =>
  issueRelationTypes.has(value);

const inverseRelation = (relation: IssueRelation, issueId: string): IssueRelation => ({
  issueId,
  type:
    relation.type === "blocking"
      ? "blocked-by"
      : relation.type === "blocked-by"
        ? "blocking"
        : relation.type,
});

const relationKey = (relation: IssueRelation): string => `${relation.type}:${relation.issueId}`;

const addRelation = (
  current: ReadonlyArray<IssueRelation> | undefined,
  relation: IssueRelation,
): ReadonlyArray<IssueRelation> => {
  const relations = new Map((current ?? []).map((entry) => [relationKey(entry), entry]));

  relations.set(relationKey(relation), relation);

  return [...relations.values()].sort((a, b) => relationKey(a).localeCompare(relationKey(b)));
};

const removeRelation = (
  current: ReadonlyArray<IssueRelation> | undefined,
  relation: IssueRelation,
): ReadonlyArray<IssueRelation> | undefined => {
  const next = (current ?? []).filter((entry) => relationKey(entry) !== relationKey(relation));

  return next.length === 0 ? undefined : next;
};

const commentPayloadBody = (payload: unknown): string => {
  if (typeof payload === "string") return payload;
  if (payload !== null && typeof payload === "object") {
    const record = payload as Readonly<Record<string, unknown>>;

    if (typeof record.body === "string") return record.body;
    if (typeof record.text === "string") return record.text;
    if (typeof record.markdown === "string") return record.markdown;
    if (typeof record.comment === "string") return record.comment;
  }

  return "";
};

const metadataFields = [
  "title",
  "status",
  "priority",
  "assignee",
  "labels",
  "parent",
  "children",
  "dueDate",
  "estimate",
  "archivedAt",
  "deletedAt",
  "duplicateOf",
  "relations",
] as const;

const metadataChanges = (
  before: TicketDocument | null,
  after: TicketDocument | null,
): ReadonlyArray<TicketRevisionMetadataChange> => {
  const changes: Array<TicketRevisionMetadataChange> = [];

  for (const field of metadataFields) {
    const beforeValue = before?.frontmatter[field] ?? null;
    const afterValue = after?.frontmatter[field] ?? null;

    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes.push({
        after: afterValue,
        before: beforeValue,
        field,
      });
    }
  }

  return changes;
};

const mergeDraftInput = (
  current: CreateTicketDraftInput,
  patch: UpdateTicketDraftInput,
): CreateTicketDraftInput => {
  const frontmatter = patch.frontmatter ?? {};

  return stripUndefined({
    ...current,
    assignee: frontmatter["assignee"] ?? current.assignee,
    body: patch.body ?? current.body,
    dueDate: frontmatter["dueDate"] ?? current.dueDate,
    estimate: frontmatter["estimate"] ?? current.estimate,
    externalLinks: frontmatter["externalLinks"] ?? current.externalLinks,
    labels: frontmatter["labels"] ?? current.labels,
    parent: frontmatter["parent"] ?? current.parent,
    planningNotRequired: frontmatter["planningNotRequired"] ?? current.planningNotRequired,
    priority: frontmatter["priority"] ?? current.priority,
    repository: frontmatter["repository"] ?? current.repository,
    status: patch.status ?? frontmatter["status"] ?? current.status,
    title: frontmatter["title"] ?? current.title,
    type: frontmatter["type"] ?? current.type,
  }) as CreateTicketDraftInput;
};

const defaultRepositoryMetadata = (
  actor: Actor,
  now: string,
  actorUserId: string | undefined,
): {
  readonly labels: ReadonlyArray<LabelDefinitionDocument>;
  readonly templates: ReadonlyArray<IssueTemplateDocument>;
  readonly views: ReadonlyArray<SavedViewDocument>;
} => {
  const label = (
    id: string,
    name: string,
    color: string,
    description: string,
  ): LabelDefinitionDocument => ({
    color,
    createdAt: now,
    createdBy: actor,
    description,
    id,
    name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: now,
  });
  const view = (
    id: string,
    name: string,
    query: TicketQuery,
    groupBy: SavedViewDocument["groupBy"] = "status",
  ): SavedViewDocument => ({
    builtIn: true,
    createdAt: now,
    createdBy: actor,
    groupBy,
    id,
    kind: "list",
    name,
    pinned: true,
    query,
    repositoryScope: "current-repository",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sort: {
      direction: "desc",
      field: "updatedAt",
    },
    updatedAt: now,
  });
  const template = (
    id: string,
    name: string,
    kind: IssueTemplateDocument["kind"],
    titleTemplate: string,
    bodyTemplate: string,
    defaults: IssueTemplateDocument["defaults"] = {},
  ): IssueTemplateDocument => ({
    active: true,
    bodyTemplate,
    createdAt: now,
    createdBy: actor,
    defaults,
    id,
    kind,
    name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    titleTemplate,
    updatedAt: now,
  });

  return {
    labels: [
      label("bug", "Bug", "red", "Defects, regressions, and broken expected behavior."),
      label("feature", "Feature", "blue", "New user-facing capability or product workflow."),
      label("improvement", "Improvement", "green", "Incremental refinement to existing behavior."),
      label("qa", "QA", "amber", "Validation, test coverage, and release confidence work."),
    ],
    templates: [
      template(
        "bug",
        "Bug report",
        "bug",
        "{{title}}",
        "## Expected\n\n## Actual\n\n## Steps to reproduce\n\n## Environment\n",
        {
          labels: ["bug"],
          priority: "high",
          type: "bug",
        },
      ),
      template(
        "feature",
        "Feature",
        "feature",
        "{{title}}",
        "## Context\n\n## Outcome\n\n## Acceptance criteria\n\n## Risks\n",
        {
          labels: ["feature"],
          priority: "medium",
          type: "feature",
        },
      ),
      template(
        "implementation",
        "Implementation task",
        "implementation",
        "{{title}}",
        "## Scope\n\n## Plan\n\n## Verification\n",
        {
          labels: ["improvement"],
          priority: "medium",
          type: "task",
        },
      ),
      template("qa", "QA task", "qa", "{{title}}", "## Test focus\n\n## Scenarios\n\n## Notes\n", {
        labels: ["qa"],
        priority: "medium",
        type: "task",
      }),
      template(
        "initiative",
        "Initiative",
        "initiative",
        "{{title}}",
        "## Outcome\n\n## Scope\n\n## Progress updates\n",
        {
          priority: "medium",
          type: "epic",
        },
      ),
    ],
    views: [
      view("triage", "Triage", {
        hasAssignee: false,
        statusIn: ["backlog", "todo"],
      }),
      view("open-bugs", "Open bugs", {
        labelIn: ["bug"],
        statusIn: ["backlog", "todo", "in-progress"],
      }),
      ...(actorUserId === undefined
        ? []
        : [
            view(
              "assigned-to-me",
              "Assigned to me",
              {
                assigneeIn: [actorUserId],
                statusIn: ["backlog", "todo", "in-progress"],
              },
              "priority",
            ),
          ]),
      view(
        "review-queue",
        "Review queue",
        {
          statusIn: ["in-progress"],
        },
        "assignee",
      ),
      view(
        "stale-backlog",
        "Stale backlog",
        {
          statusIn: ["backlog"],
        },
        "priority",
      ),
      view("blocked-work", "Blocked work", {
        blocked: true,
      }),
    ],
  };
};

const normalizeUserId = (email: string): string => {
  const normalized = email.trim().toLowerCase();

  if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/u.test(normalized)) {
    throw new Error("user email must be a valid email address");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._@+-]*$/u.test(normalized)) {
    throw new Error("user email contains unsupported document id characters");
  }
  if (
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized === "." ||
    normalized === ".." ||
    normalized.endsWith(".lock")
  ) {
    throw new Error("user email is not safe for a document id");
  }

  return normalized;
};

const normalizeUserIdEffect = (email: string): Effect.Effect<string, DatabaseFailure> =>
  Effect.try({
    catch: (cause) =>
      cause instanceof Error
        ? new ValidationError({ field: "user.email", message: cause.message, cause: cause })
        : new ValidationError({ field: "user.email", message: "invalid user email", cause: cause }),
    try: () => normalizeUserId(email),
  });

const makeCycleRepositoryMetadata = (prefix: string, now: string): CycleRepositoryMetadata => ({
  createdAt: now,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  ticketIdFormat: "prefix-base36-5+",
  ticketPrefix: normalizeTicketPrefix(prefix),
  updatedAt: now,
});

const parseCycleRepositoryMetadata = (input: unknown, now: string): CycleRepositoryMetadata => {
  if (input === null || typeof input !== "object") {
    throw new Error("repository metadata must be an object");
  }

  const value = input as Partial<CycleRepositoryMetadata>;

  if (value.schemaVersion !== undefined && value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error("repository metadata schema version is unsupported");
  }
  if (value.ticketIdFormat !== undefined && value.ticketIdFormat !== "prefix-base36-5+") {
    throw new Error("repository metadata ticket id format is unsupported");
  }

  return {
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ticketIdFormat: "prefix-base36-5+",
    ticketPrefix: normalizeTicketPrefix(value.ticketPrefix),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
  };
};

const normalizeTicketPrefix = (value: unknown): string => {
  const raw = value === null || value === undefined ? DEFAULT_TICKET_PREFIX : String(value);
  const normalized = raw.trim().toUpperCase();

  if (!/^[A-Z0-9]{2,5}$/u.test(normalized)) {
    throw new Error("ticket prefix must be 2-5 uppercase alphanumeric characters");
  }

  return normalized;
};

const normalizeTicketSeedEffect = (value: string): Effect.Effect<string, DatabaseFailure> =>
  Effect.try({
    catch: (cause) =>
      cause instanceof Error
        ? new ValidationError({ field: "ticket.id", message: cause.message, cause: cause })
        : new ValidationError({
            field: "ticket.id",
            message: "invalid ticket id seed",
            cause: cause,
          }),
    try: () => {
      const normalized = value
        .trim()
        .toUpperCase()
        .replace(/[^0-9A-Z]+/gu, "");

      if (normalized.length === 0) throw new Error("ticket id seed must not be empty");

      return normalized.padStart(5, "0");
    },
  });

const parseUserProfile = (input: unknown): UserProfileDocument => {
  if (input === null || typeof input !== "object") throw new Error("user must be an object");

  const value = input as Partial<UserProfileDocument>;

  if (
    typeof value.id !== "string" ||
    typeof value.email !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("user is missing required fields");
  }

  const id = normalizeUserId(value.id);
  const email = normalizeUserId(value.email);

  if (id !== email) throw new Error("user id must match normalized email");
  validateRequiredString("displayName", value.displayName);

  return stripUndefined({
    aliases: value.aliases,
    avatarUrl: value.avatarUrl,
    createdAt: value.createdAt,
    disabledAt: value.disabledAt,
    displayName: value.displayName,
    email,
    id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    source: value.source ?? "manual",
    timezone: value.timezone,
    updatedAt: value.updatedAt,
  }) as UserProfileDocument;
};

const parseLabelDefinition = (input: unknown): LabelDefinitionDocument => {
  if (input === null || typeof input !== "object") throw new Error("label must be an object");

  const value = input as Partial<LabelDefinitionDocument>;

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.color !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    value.createdBy === undefined
  ) {
    throw new Error("label is missing required fields");
  }

  validateSafeSegment("label id", value.id);
  validateRequiredString("label name", value.name);
  validateRequiredString("label color", value.color);

  return stripUndefined({
    archivedAt: value.archivedAt,
    color: value.color,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    description: value.description,
    id: normalizeKey(value.id),
    name: value.name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: value.updatedAt,
  }) as LabelDefinitionDocument;
};

const parseSavedView = (input: unknown): SavedViewDocument => {
  if (input === null || typeof input !== "object") throw new Error("view must be an object");

  const value = input as Partial<SavedViewDocument>;

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.groupBy !== "string" ||
    typeof value.pinned !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    value.createdBy === undefined
  ) {
    throw new Error("view is missing required fields");
  }

  validateSavedViewKind(value.kind);
  validateSavedViewGroup(value.groupBy);
  validateSafeSegment("view id", value.id);
  validateRequiredString("view name", value.name);

  return stripUndefined({
    builtIn: value.builtIn,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    description: value.description,
    display: value.display,
    groupBy: value.groupBy,
    id: value.id,
    kind: value.kind,
    name: value.name,
    ownerUserId: value.ownerUserId,
    pinned: value.pinned,
    query: value.query ?? {},
    repositoryScope: value.repositoryScope,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sort: value.sort,
    updatedAt: value.updatedAt,
  }) as SavedViewDocument;
};

const parseIssueTemplate = (input: unknown): IssueTemplateDocument => {
  if (input === null || typeof input !== "object") throw new Error("template must be an object");

  const value = input as Partial<IssueTemplateDocument>;

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.titleTemplate !== "string" ||
    typeof value.bodyTemplate !== "string" ||
    typeof value.active !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    value.createdBy === undefined
  ) {
    throw new Error("template is missing required fields");
  }

  validateSafeSegment("template id", value.id);
  validateIssueTemplateKind(value.kind);
  validateRequiredString("template name", value.name);

  return stripUndefined({
    active: value.active,
    bodyTemplate: value.bodyTemplate,
    childTemplates: value.childTemplates,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    defaults: value.defaults,
    description: value.description,
    id: value.id,
    kind: value.kind,
    name: value.name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    titleTemplate: value.titleTemplate,
    updatedAt: value.updatedAt,
  }) as IssueTemplateDocument;
};

const parseRecord = (input: unknown): LinkedRecord => {
  if (input === null || typeof input !== "object") throw new Error("record must be an object");

  const value = input as Partial<LinkedRecord>;

  if (
    typeof value.id !== "string" ||
    typeof value.issueId !== "string" ||
    typeof value.recordType !== "string" ||
    typeof value.createdAt !== "string" ||
    value.createdBy === undefined
  ) {
    throw new Error("record is missing required fields");
  }

  return {
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    createdDate: value.createdDate ?? updatedDateKey(value.createdAt),
    id: value.id,
    issueId: value.issueId,
    payload: value.payload,
    recordType: normalizeKey(value.recordType),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
};

const makeRecordId = (ticketId: string, recordType: string, recordId: string): string =>
  `${ticketId}_${normalizeKey(recordType)}_${recordId}`;

const ticketIdFromRecordId = (recordId: string): string | undefined => {
  const marker = recordId.indexOf("_");

  if (marker === -1) return undefined;

  return recordId.slice(0, marker);
};

const warning = (
  repositoryId: string,
  snapshotId: string,
  path: string,
  objectType: string,
  objectId: string | undefined,
  cause: unknown,
  createdAt: string,
  reason = "invalid-source-object",
): MaterializationWarning => ({
  createdAt,
  message: cause instanceof Error ? cause.message : String(cause),
  objectId,
  objectType,
  path,
  reason,
  repositoryId,
  snapshotId,
});

const gitIdentity = (actor: Actor) => ({
  email: actor.email,
  name: actor.name,
});

const nowIso = (): string => new Date().toISOString();

const elapsedMs = (startedAt: number): number => Number((performance.now() - startedAt).toFixed(2));

const nextEventId = (ids: DatabaseIdGeneratorShape): Effect.Effect<string, DatabaseFailure> => {
  const maybeIds = ids as Partial<DatabaseIdGeneratorShape>;

  return maybeIds.eventId ?? ids.recordId;
};

const storage = <A, E>(
  operation: string,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, DatabaseFailure> =>
  effect.pipe(
    Effect.mapError(
      (cause) =>
        new StorageError({
          operation: operation,
          cause: cause,
          message: `GitDB operation failed: ${operation}`,
        }),
    ),
  );

const sqlite = <A>(operation: string, f: () => A): Effect.Effect<A, DatabaseFailure> =>
  Effect.try({
    catch: (cause) =>
      new SqliteError({
        operation: operation,
        cause: cause,
        message: `SQLite operation failed: ${operation}`,
      }),
    try: f,
  });
