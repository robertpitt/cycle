import { type CollectionOptions, type Store as GitDbStore, type SyncResult } from "@cycle/git-db";
import { Cause, Context, Effect, Fiber, Layer, Queue, Result } from "effect";
import {
  CURRENT_SCHEMA_VERSION,
  defaultIssueBody,
  makeFrontmatter,
  makeTicketDocument,
  normalizeKey,
  parseIssueMarkdown,
  parseLegacyIssueJson,
  serializeIssueMarkdown,
  stripUndefined,
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
  type DeleteTicketInput,
  type HistoryPage,
  type InitiativeProgress,
  type InitiativeUpdatePayload,
  type IssueTemplateDocument,
  type IssueTemplatePage,
  type IssueTemplateQuery,
  type IssueRelation,
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
  consistencyError,
  type DatabaseFailure,
  materializationError,
  repositoryNotFound,
  sqliteError,
  storageError,
  validationError,
} from "../errors.ts";
import { Projection } from "../store/Projection.ts";
import { DatabaseIdGenerator, type DatabaseIdGeneratorShape } from "./DatabaseIdGenerator.ts";
import {
  DatabaseIdentity,
  DatabaseIdentityTest,
  type DatabaseIdentityShape,
} from "./DatabaseIdentity.ts";
import { DatabaseIdGeneratorDeterministic } from "./DatabaseIdGenerator.ts";

type RepositoryRuntime = {
  readonly displayName: string;
  readonly gitDir?: string;
  readonly poller?: DatabaseBackgroundSchedule;
  readonly repositoryId: string;
  readonly store: GitDbStore.StoreServiceShape;
  readonly worktreePath?: string;
};

type SourceDocument = {
  readonly bytes: string;
  readonly id: string;
  readonly path: string;
};

type CommitChange = {
  readonly changeType: "added" | "deleted" | "modified";
  readonly objectId?: string;
  readonly objectType: string;
  readonly path: string;
  readonly ticketId?: string;
};

export type DatabaseServiceOptions = {
  readonly backgroundRunner?: DatabaseBackgroundRunner;
  readonly logger?: (event: DatabaseLogEvent) => void;
  readonly projectionPath?: string;
};

export type DatabaseBackgroundRunner = {
  readonly run: (label: string, effect: Effect.Effect<void, unknown>) => void;
  readonly schedule: (
    label: string,
    intervalMs: number,
    effect: Effect.Effect<void, unknown>,
  ) => DatabaseBackgroundSchedule;
};

type DatabaseBackgroundTask = {
  readonly effect: Effect.Effect<void, unknown>;
  readonly label: string;
};

type DatabaseBackgroundSchedule = {
  readonly cancel: () => void;
};

type DatabaseBackgroundScheduleMessage =
  | {
      readonly _tag: "cancel";
      readonly id: string;
    }
  | {
      readonly _tag: "start";
      readonly effect: Effect.Effect<void, unknown>;
      readonly id: string;
      readonly intervalMs: number;
      readonly label: string;
    };

export type DatabaseLogEvent = {
  readonly data?: Readonly<Record<string, unknown>>;
  readonly message: string;
  readonly repositoryId?: string;
  readonly scope: "database";
};

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

const ISSUE_COLLECTION = "issues";
const RECORD_COLLECTION = "records";
const DRAFT_COLLECTION = "drafts";
const USER_COLLECTION = "users";
const LABEL_COLLECTION = "labels";
const VIEW_COLLECTION = "views";
const TEMPLATE_COLLECTION = "templates";
const DEFAULT_POINTER = "main";
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const issueCollectionOptions: CollectionOptions<TicketDocument> = {
  codec: {
    decode: (document) => parseIssueMarkdown(document.text()),
    encode: serializeIssueMarkdown,
  },
  extension: "md",
};

const legacyIssueCollectionOptions: CollectionOptions<TicketDocument> = {
  extension: "json",
};

const makeDatabaseBackgroundRunner = Effect.gen(function* () {
  const queue = yield* Queue.unbounded<DatabaseBackgroundTask>();
  const scheduleQueue = yield* Queue.unbounded<DatabaseBackgroundScheduleMessage>();
  const scheduled = new Map<string, Fiber.Fiber<void, never>>();
  let scheduleCounter = 0;

  yield* Queue.take(queue).pipe(
    Effect.flatMap((task) =>
      task.effect.pipe(
        Effect.catchCause((cause) =>
          Effect.logError("database background task failed").pipe(
            Effect.annotateLogs({
              cause: Cause.pretty(cause),
              label: task.label,
              scope: "database",
            }),
          ),
        ),
      ),
    ),
    Effect.forever,
    Effect.forkScoped,
  );
  yield* Queue.take(scheduleQueue).pipe(
    Effect.flatMap((message) =>
      Effect.gen(function* () {
        const current = scheduled.get(message.id);

        if (current !== undefined) {
          scheduled.delete(message.id);
          yield* Fiber.interrupt(current);
        }

        if (message._tag === "cancel") return;

        const fiber = yield* Effect.sleep(message.intervalMs).pipe(
          Effect.andThen(Queue.offer(queue, { effect: message.effect, label: message.label })),
          Effect.forever,
          Effect.forkScoped,
        );

        scheduled.set(message.id, fiber);
      }),
    ),
    Effect.forever,
    Effect.forkScoped,
  );

  return {
    run: (label: string, effect: Effect.Effect<void, unknown>) => {
      Queue.offerUnsafe(queue, { effect, label });
    },
    schedule: (label: string, intervalMs: number, effect: Effect.Effect<void, unknown>) => {
      const id = `${label}.${++scheduleCounter}`;

      Queue.offerUnsafe(scheduleQueue, {
        _tag: "start",
        effect,
        id,
        intervalMs,
        label,
      });

      return {
        cancel: () => {
          Queue.offerUnsafe(scheduleQueue, {
            _tag: "cancel",
            id,
          });
        },
      };
    },
  };
});

export const makeDatabaseService = (
  identity: DatabaseIdentityShape,
  ids: DatabaseIdGeneratorShape,
  options: DatabaseServiceOptions = {},
): DatabaseServiceShape => {
  const backgroundRunner = options.backgroundRunner;
  const projection = new Projection(options.projectionPath);
  const repositories = new Map<string, RepositoryRuntime>();
  let closed = false;
  const log = (
    repositoryId: string | undefined,
    message: string,
    data?: Readonly<Record<string, unknown>>,
  ): void => {
    try {
      options.logger?.({
        ...(data === undefined ? {} : { data }),
        message,
        ...(repositoryId === undefined ? {} : { repositoryId }),
        scope: "database",
      });
    } catch {
      // Logging must never affect database behavior.
    }
  };

  const getRepository = (repositoryId: string): Effect.Effect<RepositoryRuntime, DatabaseFailure> =>
    Effect.sync(() => repositories.get(repositoryId)).pipe(
      Effect.flatMap((repository) =>
        repository === undefined
          ? Effect.fail(repositoryNotFound(repositoryId))
          : Effect.succeed(repository),
      ),
    );

  const syncRepository = (repositoryId: string): Effect.Effect<RepositoryStatus, DatabaseFailure> =>
    Effect.gen(function* () {
      const repository = yield* getRepository(repositoryId);
      const now = nowIso();

      yield* sqlite("mark sync started", () => projection.markSyncStarted(repositoryId, now));
      log(repositoryId, "sync started", {
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
          log(repositoryId, "sync found no current GitDB snapshot", {
            previousSnapshotId: previous,
          });
          const status = yield* sqlite("clear projection for missing GitDB snapshot", () =>
            projection.transaction(() => {
              projection.clearRepositoryProjection(repositoryId);
              return projection.activateSnapshot({
                completedAt: nowIso(),
                repositoryId,
                snapshotId: null,
              });
            }),
          );
          log(repositoryId, "sync cleared projection for missing GitDB snapshot", {
            activeGeneration: status.activeGeneration,
            activeSnapshotId: status.activeSnapshotId,
            status: status.status,
          });
          return status;
        }

        if (previous === current.id) {
          log(repositoryId, "sync snapshot unchanged", {
            snapshotId: current.id,
          });
          return yield* sqlite("refresh active snapshot", () =>
            projection.activateSnapshot({
              completedAt: nowIso(),
              repositoryId,
              snapshotId: current.id,
            }),
          );
        }

        const materializationResult = yield* buildMaterialization(
          repository,
          previous,
          current.id,
        ).pipe(
          Effect.mapError((error) =>
            materializationError(repositoryId, "failed to build materialization plan", error),
          ),
          Effect.result,
        );

        if (Result.isFailure(materializationResult)) {
          yield* sqlite("mark sync failed", () =>
            projection.markSyncFailed(repositoryId, materializationResult.failure.message),
          );
          log(repositoryId, "sync materialization plan failed", {
            error: materializationResult.failure.message,
          });
          return yield* Effect.fail(materializationResult.failure);
        }

        const materialization = materializationResult.success;
        log(repositoryId, "sync materialization plan built", {
          commitChanges: materialization.commitChanges.length,
          commits: materialization.commits.length,
          deletedRecords: materialization.deletedRecords.length,
          deletedTickets: materialization.deletedTickets.length,
          fullRebuild: materialization.fullRebuild,
          previousSnapshotId: previous,
          records: materialization.records.length,
          snapshotId: current.id,
          tickets: materialization.tickets.length,
          warnings: materialization.warnings.length,
        });

        return yield* sqlite("apply materialization", () =>
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
                snapshotId: current.id,
                ticket: ticket.value,
              });
            }
            for (const user of materialization.users) {
              projection.upsertUser({
                repositoryId,
                snapshotId: current.id,
                user: user.value,
              });
            }
            for (const label of materialization.labels) {
              projection.upsertLabel({
                label: label.value,
                repositoryId,
                snapshotId: current.id,
              });
            }
            for (const view of materialization.views) {
              projection.upsertView({
                repositoryId,
                snapshotId: current.id,
                view: view.value,
              });
            }
            for (const template of materialization.templates) {
              projection.upsertTemplate({
                repositoryId,
                snapshotId: current.id,
                template: template.value,
              });
            }
            for (const record of materialization.records) {
              if (projection.ticketVisible(repositoryId, record.value.issueId)) {
                projection.upsertRecord({
                  record: record.value,
                  repositoryId,
                  snapshotId: current.id,
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

            const status = projection.activateSnapshot({
              completedAt: nowIso(),
              repositoryId,
              snapshotId: current.id,
            });
            log(repositoryId, "sync completed", {
              activeGeneration: status.activeGeneration,
              snapshotId: status.activeSnapshotId,
              status: status.status,
              warningCount: status.warningCount,
            });
            return status;
          }),
        );
      }).pipe(
        Effect.catch((error) =>
          sqlite("mark sync failed", () =>
            projection.markSyncFailed(repositoryId, error.message),
          ).pipe(
            Effect.andThen(
              Effect.sync(() => {
                log(repositoryId, "sync failed", {
                  error: error.message,
                });
              }),
            ),
            Effect.andThen(Effect.fail(error)),
          ),
        ),
      );
    });

  const pushRepository = (repositoryId: string): Effect.Effect<SyncResult, DatabaseFailure> =>
    Effect.gen(function* () {
      const repository = yield* getRepository(repositoryId);
      const result = yield* storage(
        "push repository",
        repository.store.sync({
          mode: "full",
          onDiverged: "error",
          pointers: [DEFAULT_POINTER],
        }),
      );
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
      const written = yield* write(repository);

      yield* syncRepository(repositoryId).pipe(
        Effect.mapError((error) =>
          consistencyError({
            cause: error,
            command,
            committedSnapshotId: written.snapshotId,
            message: `write committed but SQLite resync failed for ${command}`,
            objectId,
            previousSnapshotId: previous,
            repositoryId,
          }),
        ),
      );

      if (!visible()) {
        return yield* Effect.fail(
          consistencyError({
            command,
            committedSnapshotId: written.snapshotId,
            message: `write committed but ${objectId ?? "object"} is not visible in SQLite`,
            objectId,
            previousSnapshotId: previous,
            repositoryId,
          }),
        );
      }

      return written.result;
    });

  const ensureActorUserProfile = (
    tx: GitDbStore.Transaction,
    actor: Actor,
    now: string,
  ): Effect.Effect<void, DatabaseFailure> =>
    Effect.gen(function* () {
      if (actor.type !== "human") return;
      if (actor.email === undefined || actor.email.trim().length === 0) {
        return yield* Effect.fail(
          validationError("user.email", "human repository writes require an email address"),
        );
      }

      const userId = yield* normalizeUserIdEffect(actor.email);
      const users = yield* storage(
        "open user transaction collection",
        tx.collection<UserProfileDocument>(USER_COLLECTION),
      );
      const existing = yield* storage("read actor user profile", users.get(userId));

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

      yield* storage(
        "put actor user profile",
        users.put(userId, stripUndefined(next) as UserProfileDocument),
      );
    });

  const ensureDefaultMetadata = (repositoryId: string): Effect.Effect<void, DatabaseFailure> =>
    Effect.gen(function* () {
      const repository = yield* getRepository(repositoryId);
      const actor = yield* identity.currentActor;
      const now = nowIso();
      const actorUserId =
        actor.type === "human" && actor.email !== undefined && actor.email.trim().length > 0
          ? yield* normalizeUserIdEffect(actor.email)
          : undefined;
      const defaults = defaultRepositoryMetadata(actor, now, actorUserId);

      let wroteDefaults = false;
      const snapshot = yield* storage(
        "seed default repository metadata",
        Effect.gen(function* () {
          const tx = yield* repository.store.begin();
          const labels = yield* tx.collection<LabelDefinitionDocument>(LABEL_COLLECTION);
          const views = yield* tx.collection<SavedViewDocument>(VIEW_COLLECTION);
          const templates = yield* tx.collection<IssueTemplateDocument>(TEMPLATE_COLLECTION);

          yield* ensureActorUserProfile(tx, actor, now);

          for (const label of defaults.labels) {
            if ((yield* labels.get(label.id)) === null) {
              yield* labels.put(label.id, label);
              wroteDefaults = true;
            }
          }
          for (const view of defaults.views) {
            if ((yield* views.get(view.id)) === null) {
              yield* views.put(view.id, view);
              wroteDefaults = true;
            }
          }
          for (const template of defaults.templates) {
            if ((yield* templates.get(template.id)) === null) {
              yield* templates.put(template.id, template);
              wroteDefaults = true;
            }
          }

          if (!wroteDefaults) {
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
      const id = yield* ids.ticketId;
      const now = nowIso();
      const body = input.body ?? defaultIssueBody();
      const ticket = makeTicketDocument(makeFrontmatter(input, id, actor, now), body);

      yield* validateTicket(ticket);

      return yield* writeAndSync(
        repositoryId,
        "createTicket",
        id,
        (repository) =>
          Effect.gen(function* () {
            const recordId = yield* ids.recordId;
            const statusRecordId = yield* ids.recordId;
            const tx = yield* storage("begin create ticket", repository.store.begin());
            const issues = yield* storage(
              "open issue transaction collection",
              tx.collection<TicketDocument>(ISSUE_COLLECTION, issueCollectionOptions),
            );
            const records = yield* storage(
              "open record transaction collection",
              tx.collection<LinkedRecord>(RECORD_COLLECTION),
            );
            yield* ensureActorUserProfile(tx, actor, now);
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

            yield* storage("put ticket", issues.put(id, ticket));
            yield* storage("put provenance record", records.put(provenance.id, provenance));
            yield* storage("put status-change record", records.put(status.id, status));

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
        return yield* Effect.fail(validationError("ticketId", "ticket not found"));

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
            const tx = yield* storage("begin update ticket", repository.store.begin());
            const issues = yield* storage(
              "open issue transaction collection",
              tx.collection<TicketDocument>(ISSUE_COLLECTION, issueCollectionOptions),
            );
            const legacyIssues = yield* storage(
              "open legacy issue transaction collection",
              tx.collection<TicketDocument>(ISSUE_COLLECTION, legacyIssueCollectionOptions),
            );
            const records = yield* storage(
              "open record transaction collection",
              tx.collection<LinkedRecord>(RECORD_COLLECTION),
            );
            yield* ensureActorUserProfile(tx, actor, now);

            yield* storage("put updated ticket", issues.put(ticketId, next));
            yield* storage("delete legacy issue", legacyIssues.delete(ticketId));

            if (next.status !== current.status) {
              const recordId = makeRecordId(ticketId, "status-change", yield* ids.recordId);
              yield* storage(
                "put status-change record",
                records.put(
                  recordId,
                  statusChangeRecord(ticketId, recordId, actor, now, current.status, next.status),
                ),
              );
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
          const tx = yield* storage(`begin ${command}`, repository.store.begin());
          const issues = yield* storage(
            `open issue transaction collection for ${command}`,
            tx.collection<TicketDocument>(ISSUE_COLLECTION, issueCollectionOptions),
          );
          const legacyIssues = yield* storage(
            `open legacy issue transaction collection for ${command}`,
            tx.collection<TicketDocument>(ISSUE_COLLECTION, legacyIssueCollectionOptions),
          );
          const records = yield* storage(
            `open record transaction collection for ${command}`,
            tx.collection<LinkedRecord>(RECORD_COLLECTION),
          );
          yield* ensureActorUserProfile(tx, actor, now);

          for (const ticket of tickets) {
            yield* storage(`put ticket for ${command}`, issues.put(ticket.id, ticket));
            yield* storage(`delete legacy issue for ${command}`, legacyIssues.delete(ticket.id));
          }
          for (const record of linkedRecords) {
            yield* storage(`put record for ${command}`, records.put(record.id, record));
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
        return yield* Effect.fail(validationError("ticketId", "ticket not found"));

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
        return yield* Effect.fail(validationError("ticketId", "ticket not found"));

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
        return yield* Effect.fail(validationError("ticketId", "ticket not found"));

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
      validateSafeSegment("ticket id", ticketId);
      validateSafeSegment("relation issue id", relation.issueId);

      if (!isIssueRelationType(relation.type)) {
        return yield* Effect.fail(validationError("relation.type", "invalid issue relation type"));
      }
      if (relation.issueId === ticketId) {
        return yield* Effect.fail(
          validationError("relation.issueId", "ticket cannot relate to itself"),
        );
      }

      const current = projection.getTicket(repositoryId, ticketId);
      const related = projection.getTicket(repositoryId, relation.issueId);

      if (current === null)
        return yield* Effect.fail(validationError("ticketId", "ticket not found"));
      if (related === null)
        return yield* Effect.fail(validationError("relation.issueId", "related ticket not found"));

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
        return yield* Effect.fail(validationError("ticketId", "ticket not found"));

      yield* assertNoUnsafeContent("record payload", input.payload);

      if (
        normalizeKey(input.recordType) === "comment" &&
        commentPayloadBody(input.payload).trim().length === 0
      ) {
        return yield* Effect.fail(
          validationError("comment.body", "comment body must not be empty"),
        );
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
      const nextTicket =
        input.userVisible === false
          ? ticket
          : updateTicketDocument(ticket, {
              ...ticket.frontmatter,
              updatedAt: now,
            });

      return yield* writeAndSync(
        repositoryId,
        "addRecord",
        recordId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* storage("begin add record", repository.store.begin());
            const issues = yield* storage(
              "open issue transaction collection",
              tx.collection<TicketDocument>(ISSUE_COLLECTION, issueCollectionOptions),
            );
            const records = yield* storage(
              "open record transaction collection",
              tx.collection<LinkedRecord>(RECORD_COLLECTION),
            );
            yield* ensureActorUserProfile(tx, actor, now);

            if (input.userVisible !== false) {
              yield* storage("put ticket activity timestamp", issues.put(ticketId, nextTicket));
            }

            yield* storage("put linked record", records.put(record.id, record));

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
      const issues = yield* storage(
        "open issue collection for revision read",
        repository.store.collection<TicketDocument>(ISSUE_COLLECTION, issueCollectionOptions),
      );
      const ticket = yield* storage(
        "read ticket revision",
        issues.get(ticketId, { from: snapshotId }),
      );

      if (ticket !== null) return ticket;

      const legacyIssues = yield* storage(
        "open legacy issue collection for revision read",
        repository.store.collection<TicketDocument>(ISSUE_COLLECTION, legacyIssueCollectionOptions),
      );

      return yield* storage(
        "read legacy ticket revision",
        legacyIssues.get(ticketId, { from: snapshotId }),
      );
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
        return yield* Effect.fail(
          validationError("ticketId", "ticket not found in either revision"),
        );
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
            const tx = yield* storage("begin create draft", repository.store.begin());
            const drafts = yield* storage(
              "open draft transaction collection",
              tx.collection<TicketDraftDocument>(DRAFT_COLLECTION),
            );
            yield* ensureActorUserProfile(tx, actor, now);

            yield* storage("put draft", drafts.put(draftId, draft));

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
            const tx = yield* storage("begin update draft", repository.store.begin());
            const drafts = yield* storage(
              "open draft transaction collection",
              tx.collection<TicketDraftDocument>(DRAFT_COLLECTION),
            );
            const current = yield* storage("read draft", drafts.get(draftId));

            if (current === null) {
              return yield* Effect.fail(validationError("draftId", "draft not found"));
            }
            yield* ensureActorUserProfile(tx, actor, now);

            const next: TicketDraftDocument = {
              ...current,
              input: mergeDraftInput(current.input, input),
              updatedAt: now,
            };

            yield* storage("put updated draft", drafts.put(draftId, next));

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
      const ticketId = yield* ids.ticketId;
      const now = nowIso();

      return yield* writeAndSync(
        repositoryId,
        "commitDraft",
        draftId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* storage("begin commit draft", repository.store.begin());
            const drafts = yield* storage(
              "open draft transaction collection",
              tx.collection<TicketDraftDocument>(DRAFT_COLLECTION),
            );
            const issues = yield* storage(
              "open issue transaction collection",
              tx.collection<TicketDocument>(ISSUE_COLLECTION, issueCollectionOptions),
            );
            const records = yield* storage(
              "open record transaction collection",
              tx.collection<LinkedRecord>(RECORD_COLLECTION),
            );
            const draft = yield* storage("read draft", drafts.get(draftId));

            if (draft === null) {
              return yield* Effect.fail(validationError("draftId", "draft not found"));
            }
            yield* ensureActorUserProfile(tx, actor, now);

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
            yield* storage("put ticket from draft", issues.put(ticketId, ticket));
            yield* storage("put provenance record", records.put(provenance.id, provenance));
            yield* storage("put status-change record", records.put(status.id, status));
            yield* storage("delete committed draft", drafts.delete(draftId));

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
            const tx = yield* storage("begin upsert user", repository.store.begin());
            const users = yield* storage(
              "open user transaction collection",
              tx.collection<UserProfileDocument>(USER_COLLECTION),
            );

            yield* ensureActorUserProfile(tx, actor, now);
            yield* storage("put user profile", users.put(userId, user));

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
            const tx = yield* storage("begin upsert label", repository.store.begin());
            const labels = yield* storage(
              "open label transaction collection",
              tx.collection<LabelDefinitionDocument>(LABEL_COLLECTION),
            );

            yield* ensureActorUserProfile(tx, actor, now);
            yield* storage("put label", labels.put(labelId, label));

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
        return yield* Effect.fail(validationError("labelId", "label not found"));
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
            const tx = yield* storage("begin archive label", repository.store.begin());
            const labels = yield* storage(
              "open label transaction collection",
              tx.collection<LabelDefinitionDocument>(LABEL_COLLECTION),
            );

            yield* ensureActorUserProfile(tx, actor, now);
            yield* storage("put archived label", labels.put(labelId, next));

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
            const tx = yield* storage("begin create view", repository.store.begin());
            const views = yield* storage(
              "open view transaction collection",
              tx.collection<SavedViewDocument>(VIEW_COLLECTION),
            );

            yield* ensureActorUserProfile(tx, actor, now);
            yield* storage("put saved view", views.put(viewId, view));

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

      if (current === null) return yield* Effect.fail(validationError("viewId", "view not found"));

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
            const tx = yield* storage("begin update view", repository.store.begin());
            const views = yield* storage(
              "open view transaction collection",
              tx.collection<SavedViewDocument>(VIEW_COLLECTION),
            );

            yield* ensureActorUserProfile(tx, actor, now);
            yield* storage("put updated view", views.put(viewId, next));

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

      if (current === null) return yield* Effect.fail(validationError("viewId", "view not found"));

      const actor = yield* identity.currentActor;
      const now = nowIso();

      return yield* writeAndSync(
        repositoryId,
        "deleteView",
        viewId,
        (repository) =>
          Effect.gen(function* () {
            const tx = yield* storage("begin delete view", repository.store.begin());
            const views = yield* storage(
              "open view transaction collection",
              tx.collection<SavedViewDocument>(VIEW_COLLECTION),
            );

            yield* ensureActorUserProfile(tx, actor, now);
            yield* storage("delete view", views.delete(viewId));

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
            const tx = yield* storage("begin create template", repository.store.begin());
            const templates = yield* storage(
              "open template transaction collection",
              tx.collection<IssueTemplateDocument>(TEMPLATE_COLLECTION),
            );

            yield* ensureActorUserProfile(tx, actor, now);
            yield* storage("put template", templates.put(templateId, template));

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
        return yield* Effect.fail(validationError("templateId", "template not found"));

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
            const tx = yield* storage("begin update template", repository.store.begin());
            const templates = yield* storage(
              "open template transaction collection",
              tx.collection<IssueTemplateDocument>(TEMPLATE_COLLECTION),
            );

            yield* ensureActorUserProfile(tx, actor, now);
            yield* storage("put updated template", templates.put(templateId, next));

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
        type: input.type ?? "initiative",
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
            ? validationError("initiative-update", cause.message, cause)
            : validationError("initiative-update", "invalid initiative update", cause),
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
    archiveLabel,
    archiveTemplate,
    archiveTicket,
    close: () =>
      Effect.sync(() => {
        if (closed) return;
        closed = true;
        for (const repository of repositories.values()) {
          repository.poller?.cancel();
        }
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
    initiativeProgress,
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
    openRepository: (input) =>
      Effect.gen(function* () {
        const existing = repositories.get(input.repositoryId);

        existing?.poller?.cancel();

        const poller =
          input.pollIntervalMs === false || backgroundRunner === undefined
            ? undefined
            : backgroundRunner.schedule(
                `database.pollRepository.${input.repositoryId}`,
                input.pollIntervalMs ?? 1000,
                syncRepository(input.repositoryId).pipe(Effect.asVoid),
              );

        repositories.set(input.repositoryId, {
          displayName: input.displayName ?? input.repositoryId,
          gitDir: input.gitDir,
          poller,
          repositoryId: input.repositoryId,
          store: input.store,
          worktreePath: input.worktreePath,
        });
        yield* sqlite("register repository", () => projection.registerRepository(input));

        if (input.syncOnOpen === false) {
          return yield* sqlite("repository status", () =>
            projection.repositoryStatus(input.repositoryId),
          );
        }

        const status = yield* syncRepository(input.repositoryId);
        yield* ensureDefaultMetadata(input.repositoryId);
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
    const backgroundRunner = yield* makeDatabaseBackgroundRunner;

    return yield* Effect.acquireRelease(
      Effect.succeed(DatabaseService.of(makeDatabaseService(identity, ids, { backgroundRunner }))),
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
      const backgroundRunner = yield* makeDatabaseBackgroundRunner;

      return yield* Effect.acquireRelease(
        Effect.succeed(
          DatabaseService.of(
            makeDatabaseService(identity, ids, {
              ...options,
              backgroundRunner: options.backgroundRunner ?? backgroundRunner,
            }),
          ),
        ),
        (service) => service.close(),
      );
    }),
  );

export const DatabaseTest = (prefix?: string) =>
  DatabaseLive.pipe(
    Layer.provide(Layer.mergeAll(DatabaseIdentityTest(), DatabaseIdGeneratorDeterministic(prefix))),
  );

export const DatabaseInMemory = DatabaseTest;

const buildMaterialization = (
  repository: RepositoryRuntime,
  previousSnapshotId: string | null,
  currentSnapshotId: string,
) =>
  Effect.gen(function* () {
    const fullRebuild = previousSnapshotId === null;
    const issueDocs = fullRebuild
      ? yield* listSourceDocuments(repository.store, "collections/issues", currentSnapshotId, [
          ".md",
          ".json",
        ])
      : yield* changedDocuments(repository.store, previousSnapshotId, currentSnapshotId, "issues");
    const recordDocs = fullRebuild
      ? yield* listSourceDocuments(repository.store, "collections/records", currentSnapshotId, [
          ".json",
        ])
      : yield* changedDocuments(repository.store, previousSnapshotId, currentSnapshotId, "records");
    const userDocs = fullRebuild
      ? yield* listSourceDocuments(repository.store, "collections/users", currentSnapshotId, [
          ".json",
        ])
      : yield* changedDocuments(repository.store, previousSnapshotId, currentSnapshotId, "users");
    const labelDocs = fullRebuild
      ? yield* listSourceDocuments(repository.store, "collections/labels", currentSnapshotId, [
          ".json",
        ])
      : yield* changedDocuments(repository.store, previousSnapshotId, currentSnapshotId, "labels");
    const viewDocs = fullRebuild
      ? yield* listSourceDocuments(repository.store, "collections/views", currentSnapshotId, [
          ".json",
        ])
      : yield* changedDocuments(repository.store, previousSnapshotId, currentSnapshotId, "views");
    const templateDocs = fullRebuild
      ? yield* listSourceDocuments(repository.store, "collections/templates", currentSnapshotId, [
          ".json",
        ])
      : yield* changedDocuments(
          repository.store,
          previousSnapshotId,
          currentSnapshotId,
          "templates",
        );
    const warnings: Array<MaterializationWarning> = [];
    const tickets: Array<{ readonly path: string; readonly value: TicketDocument }> = [];
    const records: Array<{ readonly path: string; readonly value: LinkedRecord }> = [];
    const users: Array<{ readonly path: string; readonly value: UserProfileDocument }> = [];
    const labels: Array<{ readonly path: string; readonly value: LabelDefinitionDocument }> = [];
    const views: Array<{ readonly path: string; readonly value: SavedViewDocument }> = [];
    const templates: Array<{ readonly path: string; readonly value: IssueTemplateDocument }> = [];
    const deletedTickets: Array<string> = [];
    const deletedRecords: Array<string> = [];
    const deletedUsers: Array<string> = [];
    const deletedLabels: Array<string> = [];
    const deletedViews: Array<string> = [];
    const deletedTemplates: Array<string> = [];
    const now = nowIso();

    for (const doc of issueDocs.documents) {
      try {
        const ticket = doc.path.endsWith(".json")
          ? parseLegacyIssueJson(JSON.parse(doc.bytes))
          : parseIssueMarkdown(doc.bytes);

        validateTicketSync(ticket);
        tickets.push({ path: doc.path, value: ticket });
      } catch (error) {
        deletedTickets.push(doc.id);
        warnings.push(
          warning(
            repository.repositoryId,
            currentSnapshotId,
            doc.path,
            "ticket",
            doc.id,
            error,
            now,
          ),
        );
      }
    }

    for (const doc of recordDocs.documents) {
      try {
        const record = parseRecord(JSON.parse(doc.bytes));

        records.push({ path: doc.path, value: record });
      } catch (error) {
        deletedRecords.push(doc.id);
        warnings.push(
          warning(
            repository.repositoryId,
            currentSnapshotId,
            doc.path,
            "record",
            doc.id,
            error,
            now,
          ),
        );
      }
    }

    for (const doc of userDocs.documents) {
      try {
        const user = parseUserProfile(JSON.parse(doc.bytes));

        users.push({ path: doc.path, value: user });
      } catch (error) {
        deletedUsers.push(doc.id);
        warnings.push(
          warning(repository.repositoryId, currentSnapshotId, doc.path, "user", doc.id, error, now),
        );
      }
    }

    for (const doc of labelDocs.documents) {
      try {
        const label = parseLabelDefinition(JSON.parse(doc.bytes));

        labels.push({ path: doc.path, value: label });
      } catch (error) {
        deletedLabels.push(doc.id);
        warnings.push(
          warning(
            repository.repositoryId,
            currentSnapshotId,
            doc.path,
            "label",
            doc.id,
            error,
            now,
          ),
        );
      }
    }

    for (const doc of viewDocs.documents) {
      try {
        const view = parseSavedView(JSON.parse(doc.bytes));

        views.push({ path: doc.path, value: view });
      } catch (error) {
        deletedViews.push(doc.id);
        warnings.push(
          warning(repository.repositoryId, currentSnapshotId, doc.path, "view", doc.id, error, now),
        );
      }
    }

    for (const doc of templateDocs.documents) {
      try {
        const template = parseIssueTemplate(JSON.parse(doc.bytes));

        templates.push({ path: doc.path, value: template });
      } catch (error) {
        deletedTemplates.push(doc.id);
        warnings.push(
          warning(
            repository.repositoryId,
            currentSnapshotId,
            doc.path,
            "template",
            doc.id,
            error,
            now,
          ),
        );
      }
    }

    const ticketIds = new Set(tickets.map((ticket) => ticket.value.id));
    for (const ticket of tickets) {
      for (const childId of ticket.value.frontmatter.children ?? []) {
        if (ticketIds.has(childId)) continue;

        warnings.push(
          warning(
            repository.repositoryId,
            currentSnapshotId,
            ticket.path,
            "ticket",
            ticket.value.id,
            new Error(`unknown child issue id: ${childId}`),
            now,
            "unknown-child-issue",
          ),
        );
      }
    }

    deletedTickets.push(...issueDocs.deletedIds);
    deletedRecords.push(...recordDocs.deletedIds);
    deletedUsers.push(...userDocs.deletedIds);
    deletedLabels.push(...labelDocs.deletedIds);
    deletedViews.push(...viewDocs.deletedIds);
    deletedTemplates.push(...templateDocs.deletedIds);

    const commits = yield* buildCommitRows(repository, currentSnapshotId);
    const commitChanges = yield* buildCommitChanges(repository, currentSnapshotId);

    return {
      commitChanges,
      commits,
      deletedRecords,
      deletedTickets,
      deletedLabels,
      deletedTemplates,
      deletedUsers,
      deletedViews,
      fullRebuild,
      labels,
      records,
      templates,
      tickets,
      users,
      views,
      warnings,
    };
  });

const changedDocuments = (
  store: GitDbStore.StoreServiceShape,
  previousSnapshotId: string,
  currentSnapshotId: string,
  collection: "issues" | "labels" | "records" | "templates" | "users" | "views",
) =>
  Effect.gen(function* () {
    const diff = yield* storage(
      "diff snapshots",
      store.diff(previousSnapshotId, currentSnapshotId),
    );
    const changes = [...diff.added, ...diff.modified, ...diff.deleted].filter((change) =>
      change.path.startsWith(`collections/${collection}/`),
    );
    const documents: Array<SourceDocument> = [];
    const deletedIds: Array<string> = [];

    for (const change of changes) {
      if (!isDocumentPath(change.path)) continue;

      const id = idFromPath(change.path);

      if (change.newObjectId === undefined) {
        deletedIds.push(id);
        continue;
      }

      const document = yield* storage(
        "read changed document",
        store.get(change.path, { from: currentSnapshotId }),
      );

      if (document !== null) {
        documents.push({
          bytes: document.text(),
          id,
          path: change.path,
        });
      }
    }

    return { deletedIds, documents };
  });

const listSourceDocuments = (
  store: GitDbStore.StoreServiceShape,
  root: string,
  snapshotId: string,
  extensions: ReadonlyArray<string>,
): Effect.Effect<
  {
    readonly deletedIds: ReadonlyArray<string>;
    readonly documents: ReadonlyArray<SourceDocument>;
  },
  DatabaseFailure
> =>
  Effect.gen(function* () {
    const documents: Array<SourceDocument> = [];

    const visit = (path: string): Effect.Effect<void, DatabaseFailure> =>
      Effect.gen(function* () {
        const entries = yield* storage(
          "list source documents",
          store.list(path, { from: snapshotId }),
        );

        for (const entry of entries) {
          if (entry.type === "tree") {
            yield* visit(entry.path);
          } else if (extensions.some((extension) => entry.path.endsWith(extension))) {
            const document = yield* storage(
              "read source document",
              store.get(entry.path, { from: snapshotId }),
            );

            if (document !== null) {
              documents.push({
                bytes: document.text(),
                id: idFromPath(entry.path),
                path: entry.path,
              });
            }
          }
        }
      });

    yield* visit(root).pipe(Effect.orElseSucceed(() => undefined));

    return { deletedIds: [], documents };
  });

const buildCommitRows = (repository: RepositoryRuntime, snapshotId: string) =>
  Effect.gen(function* () {
    const history = yield* storage("read repository history", repository.store.history(snapshotId));

    return history
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
        sequence: index + 1,
        snapshotId: snapshot.id,
      }));
  });

const buildCommitChanges = (repository: RepositoryRuntime, snapshotId: string) =>
  Effect.gen(function* () {
    const history = yield* storage(
      "read history for changes",
      repository.store.history(snapshotId),
    );
    const rows: Array<{
      readonly changes: ReadonlyArray<CommitChange>;
      readonly repositoryId: string;
      readonly snapshotId: string;
    }> = [];

    for (const snapshot of history) {
      const changes =
        snapshot.parents[0] === undefined
          ? yield* initialCommitChanges(repository.store, snapshot.id)
          : yield* diffCommitChanges(repository.store, snapshot.parents[0], snapshot.id);

      rows.push({
        changes,
        repositoryId: repository.repositoryId,
        snapshotId: snapshot.id,
      });
    }

    return rows;
  });

const initialCommitChanges = (store: GitDbStore.StoreServiceShape, snapshotId: string) =>
  Effect.gen(function* () {
    const issueDocs = yield* listSourceDocuments(store, "collections/issues", snapshotId, [
      ".md",
      ".json",
    ]);
    const recordDocs = yield* listSourceDocuments(store, "collections/records", snapshotId, [
      ".json",
    ]);
    const userDocs = yield* listSourceDocuments(store, "collections/users", snapshotId, [".json"]);
    const labelDocs = yield* listSourceDocuments(store, "collections/labels", snapshotId, [
      ".json",
    ]);
    const viewDocs = yield* listSourceDocuments(store, "collections/views", snapshotId, [".json"]);
    const templateDocs = yield* listSourceDocuments(store, "collections/templates", snapshotId, [
      ".json",
    ]);

    return [
      ...issueDocs.documents.map((doc) => pathChange("added" as const, doc.path, doc.id)),
      ...recordDocs.documents.map((doc) => pathChange("added" as const, doc.path, doc.id)),
      ...userDocs.documents.map((doc) => pathChange("added" as const, doc.path, doc.id)),
      ...labelDocs.documents.map((doc) => pathChange("added" as const, doc.path, doc.id)),
      ...viewDocs.documents.map((doc) => pathChange("added" as const, doc.path, doc.id)),
      ...templateDocs.documents.map((doc) => pathChange("added" as const, doc.path, doc.id)),
    ];
  });

const diffCommitChanges = (
  store: GitDbStore.StoreServiceShape,
  previousSnapshotId: string,
  snapshotId: string,
) =>
  Effect.gen(function* () {
    const diff = yield* storage("diff commit changes", store.diff(previousSnapshotId, snapshotId));
    const changes = [
      ...diff.added.map((change) => pathChange("added" as const, change.path)),
      ...diff.modified.map((change) => pathChange("modified" as const, change.path)),
      ...diff.deleted.map((change) => pathChange("deleted" as const, change.path)),
    ].filter((change) => change.objectType !== "unknown");

    return changes;
  });

const pathChange = (
  changeType: "added" | "deleted" | "modified",
  path: string,
  id = idFromPath(path),
): CommitChange => {
  const isIssue = path.startsWith("collections/issues/");
  const isRecord = path.startsWith("collections/records/");
  const isUser = path.startsWith("collections/users/");
  const isLabel = path.startsWith("collections/labels/");
  const isView = path.startsWith("collections/views/");
  const isTemplate = path.startsWith("collections/templates/");

  return {
    changeType,
    objectId: id,
    objectType: isIssue
      ? "ticket"
      : isRecord
        ? "record"
        : isUser
          ? "user"
          : isLabel
            ? "label"
            : isView
              ? "view"
              : isTemplate
                ? "template"
                : "unknown",
    path,
    ticketId: isIssue ? id : isRecord ? ticketIdFromRecordId(id) : undefined,
  };
};

const validateTicket = (ticket: TicketDocument): Effect.Effect<void, DatabaseFailure> =>
  Effect.try({
    catch: (cause) =>
      cause instanceof Error
        ? validationError("ticket", cause.message, cause)
        : validationError("ticket", "invalid ticket", cause),
    try: () => validateTicketSync(ticket),
  }).pipe(
    Effect.mapError((error) =>
      error instanceof Error
        ? validationError("ticket", error.message, error)
        : validationError("ticket", "invalid ticket", error),
    ),
  );

const validateTicketSync = (ticket: TicketDocument): void => {
  validateSafeSegment("ticket id", ticket.id);
  validateRequiredString("title", ticket.frontmatter.title);
  validateRequiredString("status", ticket.frontmatter.status);
  validateRequiredString("priority", ticket.frontmatter.priority);
  validateRequiredString("type", ticket.frontmatter.type);
  validateRequiredString("createdAt", ticket.frontmatter.createdAt);
  validateRequiredString("updatedAt", ticket.frontmatter.updatedAt);
  validateRequiredString("createdBy.name", ticket.frontmatter.createdBy.name);
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
  if (!["bug", "feature", "implementation", "initiative", "qa"].includes(value)) {
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
        validationError(field, `unsafe secret-bearing field is not allowed: ${unsafeKey}`),
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
          type: "issue",
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
          type: "issue",
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
          type: "issue",
        },
      ),
      template("qa", "QA task", "qa", "{{title}}", "## Test focus\n\n## Scenarios\n\n## Notes\n", {
        labels: ["qa"],
        priority: "medium",
        type: "issue",
      }),
      template(
        "initiative",
        "Initiative",
        "initiative",
        "{{title}}",
        "## Outcome\n\n## Scope\n\n## Progress updates\n",
        {
          priority: "medium",
          type: "initiative",
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
        ? validationError("user.email", cause.message, cause)
        : validationError("user.email", "invalid user email", cause),
    try: () => normalizeUserId(email),
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

  const second = recordId.indexOf("_", marker + 1);

  return second === -1
    ? undefined
    : recordId.slice(0, marker + (recordId.startsWith("iss_") ? 10 : 0));
};

const idFromPath = (path: string): string => {
  const file = path.split("/").at(-1) ?? path;

  return file.replace(/\.(json|md)$/u, "");
};

const isDocumentPath = (path: string): boolean => /\.(json|md)$/u.test(path);

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

const storage = <A, E>(
  operation: string,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, DatabaseFailure> =>
  effect.pipe(Effect.mapError((cause) => storageError(operation, cause)));

const sqlite = <A>(operation: string, f: () => A): Effect.Effect<A, DatabaseFailure> =>
  Effect.try({
    catch: (cause) => sqliteError(operation, cause),
    try: f,
  });
