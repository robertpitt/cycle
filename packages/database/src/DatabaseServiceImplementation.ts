import { Effect } from "effect";
import type { DatabaseIdGeneratorShape } from "./DatabaseIdGenerator.ts";
import type { DatabaseIdentityShape } from "./DatabaseIdentity.ts";
import { buildMaterialization, foldRepositoryEvents } from "./DatabaseMaterialization.ts";
import type { DatabaseServiceShape } from "./DatabaseService.ts";
import { Projection } from "./Projection.ts";
import type { RepositoryStoreShape, RepositorySyncResult } from "./RepositoryStore.ts";
import {
  CURRENT_SCHEMA_VERSION,
  defaultIssueBody,
  makeFrontmatter,
  makeTicketDocument,
  normalizeKey,
  stripUndefined,
  updateTicketDocument,
  validateNewTicketType,
  type Actor,
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
  type InboxMutationInput,
  type InboxMutationResult,
  type InboxPage,
  type InboxQuery,
  type InboxSummary,
  type InitiativeProgress,
  type InitiativeUpdatePayload,
  type IssueFrontmatter,
  type IssueRelation,
  type IssueTemplateDocument,
  type LabelDefinitionDocument,
  type LinkedRecord,
  type RepositoryStatus,
  type RestoreTicketInput,
  type SavedViewDocument,
  type TicketDocument,
  type TicketDraftDocument,
  type TicketRevisionDiff,
  type UpdateIssueTemplatePatch,
  type UpdateSavedViewPatch,
  type UpdateTicketDraftInput,
  type UpdateTicketPatch,
  type UpsertLabelDefinitionInput,
  type UserProfileDocument,
} from "./domain/index.ts";
import {
  DatabaseConsistencyError,
  DatabaseMaterializationError,
  DatabaseRepositoryNotFoundError,
  DatabaseValidationError,
  type DatabaseFailure,
} from "./DatabaseErrors.ts";
import {
  DEFAULT_POINTER,
  DEFAULT_TICKET_PREFIX,
  TICKET_ID_PATTERN,
  addRelation,
  assertNoUnsafeContent,
  commentPayloadBody,
  createdTicketMessage,
  defaultRepositoryMetadata,
  draftCreatedMessage,
  draftUpdatedMessage,
  elapsedMs,
  errorMessage,
  gitIdentity,
  initialProvenanceRecord,
  inverseRelation,
  isIssueRelationType,
  isRemotePushRejection,
  makeCycleRepositoryMetadata,
  makeRecord,
  makeRecordId,
  mergeDraftInput,
  metadataChanges,
  nextEventId,
  normalizeTicketSeedEffect,
  normalizeUserIdEffect,
  nowIso,
  parseIssueTemplate,
  parseLabelDefinition,
  parseSavedView,
  quotedTicketTitle,
  recordMessage,
  relationMessage,
  removeRelation,
  sqlite,
  statusChangeRecord,
  storage,
  updatedTicketMessage,
  validateRequiredString,
  validateTicket,
  validateTicketId,
} from "./internals/DatabaseHelpers.ts";
import { createsDependencyCycle, dependencyEdge } from "./internals/TicketDependencies.ts";
import type {
  DatabaseEventPayload,
  DatabaseTransaction,
  RepositoryRuntime,
} from "./internals/DatabaseRuntime.ts";

export const makeDatabaseServiceWithProjection = (
  identity: DatabaseIdentityShape,
  ids: DatabaseIdGeneratorShape,
  projection: Projection,
): DatabaseServiceShape => {
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
              new DatabaseRepositoryNotFoundError({
                repositoryId: repositoryId,
                message: `Repository is not open: ${repositoryId}`,
              }),
            )
          : Effect.succeed(repository),
      ),
    );

  const pushStore = (repository: RepositoryRuntime): Effect.Effect<RepositorySyncResult, unknown> =>
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
            new DatabaseMaterializationError({
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

  const pushRepository = (
    repositoryId: string,
  ): Effect.Effect<RepositorySyncResult, DatabaseFailure> =>
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
            new DatabaseConsistencyError({
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
        return yield* new DatabaseConsistencyError({
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
    tx: DatabaseTransaction,
    aggregateType: string,
    aggregateId: string,
    payload: DatabaseEventPayload,
  ): Effect.Effect<string, DatabaseFailure> =>
    Effect.gen(function* () {
      const eventId = yield* nextEventId(ids);

      return yield* tx.appendEvent({
        aggregateId,
        aggregateType,
        eventId,
        payload,
      });
    });

  const appendTicketUpdateEvents = (
    tx: DatabaseTransaction,
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
    tx: DatabaseTransaction,
    actor: Actor,
    now: string,
  ): Effect.Effect<void, DatabaseFailure> =>
    Effect.gen(function* () {
      if (actor.type !== "human") return;
      if (actor.email === undefined || actor.email.trim().length === 0) {
        return yield* new DatabaseValidationError({
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
    tx: DatabaseTransaction,
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
  ): Effect.Effect<DatabaseTransaction, DatabaseFailure> =>
    Effect.gen(function* () {
      const tx = makeDatabaseTransaction(repository, label, actor);

      yield* ensureDefaultWorkflowMetadataInTransaction(repository, tx, actor, now);
      return tx;
    });

  const makeDatabaseTransaction = (
    repository: RepositoryRuntime,
    label: string,
    actor: Actor,
  ): DatabaseTransaction => {
    const events: Array<Parameters<RepositoryStoreShape["appendEvent"]>[1]> = [];
    let closed = false;

    const assertOpen = (): Effect.Effect<void, DatabaseFailure> =>
      closed ? Effect.die(new Error(`Transaction is already closed: ${label}`)) : Effect.void;

    return {
      abort: Effect.sync(() => {
        closed = true;
        events.length = 0;
      }),
      appendEvent: (input) =>
        assertOpen().pipe(
          Effect.andThen(
            Effect.sync(() => {
              const payload = stripUndefined(input.payload) as Readonly<Record<string, unknown>>;
              const event = {
                ...input,
                payload,
              };

              events.push(event);

              return `${repository.store.aggregatePath(input)}/${input.eventId}.json`;
            }),
          ),
        ),
      commit: (commitOptions) =>
        assertOpen().pipe(
          Effect.andThen(
            storage(
              `commit ${label}`,
              repository.store.transaction(
                {
                  ...commitOptions,
                  author: commitOptions.author ?? gitIdentity(actor),
                  committer: commitOptions.committer ?? gitIdentity(actor),
                },
                (tx) =>
                  Effect.forEach(events, (event) => repository.store.appendEvent(tx, event), {
                    discard: true,
                  }),
              ),
            ),
          ),
          Effect.map((result) => {
            closed = true;
            return result.snapshot;
          }),
        ),
    };
  };

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

      return yield* new DatabaseValidationError({
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
          const tx = makeDatabaseTransaction(repository, "seed default repository metadata", actor);
          const defaults = yield* ensureDefaultWorkflowMetadataInTransaction(
            repository,
            tx,
            actor,
            now,
          );

          yield* ensureActorUserProfile(repository, tx, actor, now);

          if (!defaults.changed) {
            yield* tx.abort;
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
        return yield* new DatabaseValidationError({ field: "type", message: type.reason });
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
        return yield* new DatabaseValidationError({
          field: "ticketId",
          message: "ticket not found",
        });

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
        return yield* new DatabaseValidationError({
          field: "ticketId",
          message: "ticket not found",
        });

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
        return yield* new DatabaseValidationError({
          field: "ticketId",
          message: "ticket not found",
        });

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
        return yield* new DatabaseValidationError({
          field: "ticketId",
          message: "ticket not found",
        });

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
        return yield* new DatabaseValidationError({
          field: "relation.type",
          message: "invalid issue relation type",
        });
      }
      if (relation.issueId === ticketId) {
        return yield* new DatabaseValidationError({
          field: "relation.issueId",
          message: "ticket cannot relate to itself",
        });
      }

      const current = projection.getTicket(repositoryId, ticketId);
      const related = projection.getTicket(repositoryId, relation.issueId);

      if (current === null)
        return yield* new DatabaseValidationError({
          field: "ticketId",
          message: "ticket not found",
        });
      if (related === null)
        return yield* new DatabaseValidationError({
          field: "relation.issueId",
          message: "related ticket not found",
        });

      const edge = dependencyEdge(ticketId, relation);
      if (
        action === "add" &&
        edge !== undefined &&
        createsDependencyCycle(edge, (id) => projection.getTicket(repositoryId, id))
      ) {
        return yield* new DatabaseValidationError({
          field: "relation",
          message: "dependency relation would create a circular dependency",
        });
      }

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

  const listIssueRelations = (
    repositoryId: string,
    ticketId: string,
  ): Effect.Effect<ReadonlyArray<IssueRelation>, DatabaseFailure> =>
    Effect.gen(function* () {
      validateTicketId("ticket id", ticketId);
      const ticket = projection.getTicket(repositoryId, ticketId);
      if (ticket === null) {
        return yield* new DatabaseValidationError({
          field: "ticketId",
          message: "ticket not found",
        });
      }

      return ticket.frontmatter.relations ?? [];
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
        return yield* new DatabaseValidationError({
          field: "ticketId",
          message: "ticket not found",
        });

      yield* assertNoUnsafeContent("record payload", input.payload);

      if (
        normalizeKey(input.recordType) === "comment" &&
        commentPayloadBody(input.payload).trim().length === 0
      ) {
        return yield* new DatabaseValidationError({
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
        return yield* new DatabaseValidationError({
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
              return yield* new DatabaseValidationError({
                field: "draftId",
                message: "draft not found",
              });
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
              return yield* new DatabaseValidationError({
                field: "draftId",
                message: "draft not found",
              });
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
        return yield* new DatabaseValidationError({ field: "labelId", message: "label not found" });
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
        return yield* new DatabaseValidationError({ field: "viewId", message: "view not found" });

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
        return yield* new DatabaseValidationError({ field: "viewId", message: "view not found" });

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
        return yield* new DatabaseValidationError({
          field: "templateId",
          message: "template not found",
        });

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
            ? new DatabaseValidationError({
                field: "initiative-update",
                message: cause.message,
                cause: cause,
              })
            : new DatabaseValidationError({
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
            ? new DatabaseValidationError({
                field: "itemIds",
                message: cause.message,
                cause: cause,
              })
            : new DatabaseValidationError({
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
    close: Effect.sync(() => {
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
    listIssueRelations,
    listLabels: (repositoryId, query = {}) =>
      sqlite("list labels", () => projection.listLabels(repositoryId, query)),
    listRepositories: sqlite("list repositories", () => projection.listRepositories()),
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
