import {
  ArchivePageInput,
  CommentAddInput,
  CommentTargetNotFound,
  CommentTargetUnsupported,
  CreatePageInput,
  CycleResourceRef,
  PageDocument,
  PageDocumentInvalid,
  PageId,
  PageInvalidState,
  PageNotFound,
  PagePath,
  PagePathConflict,
  PagePathInvalid,
  PageRevisionConflict,
  PageRevisionNotFound,
  PageState,
  RestorePageInput,
  UpdatePageInput,
  type CommentDocument,
  type CommentPage,
  type CommentQuery,
  type CycleResourceRef as CycleResourceRefType,
  type PageHierarchy,
  type PageHierarchyQuery,
  type PageHistoryInput,
  type PageHistoryPage,
  type PagePage,
  type PageQuery,
  type PagesFailure,
} from "@cycle/contracts/schemas";
import { Clock, Effect, Schema } from "effect";
import type { DatabaseIdGeneratorShape } from "./DatabaseIdGenerator.ts";
import type { DatabaseIdentityShape } from "./DatabaseIdentity.ts";
import {
  DatabaseConsistencyError,
  type DatabaseFailure,
} from "./DatabaseErrors.ts";
import { foldRepositoryEvents } from "./DatabaseMaterialization.ts";
import type { Projection } from "./Projection.ts";
import { pageSummary } from "./PageProjection.ts";
import { sqlite, storage } from "./internals/DatabaseHelpers.ts";
import type {
  DatabaseEventPayload,
  DatabaseTransaction,
  RepositoryRuntime,
} from "./internals/DatabaseRuntime.ts";
import type { Actor, CommitOptions } from "./domain/index.ts";

type PageOperationFailure = DatabaseFailure | PagesFailure;

export type PageOperationsDependencies = {
  readonly appendEvent: (
    tx: DatabaseTransaction,
    aggregateType: string,
    aggregateId: string,
    payload: DatabaseEventPayload,
  ) => Effect.Effect<string, DatabaseFailure>;
  readonly beginWriteTransaction: (
    repository: RepositoryRuntime,
    label: string,
    actor: Actor,
    now: string,
  ) => Effect.Effect<DatabaseTransaction, DatabaseFailure>;
  readonly ensureActorUserProfile: (
    repository: RepositoryRuntime,
    tx: DatabaseTransaction,
    actor: Actor,
    now: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly getRepository: (
    repositoryId: string,
  ) => Effect.Effect<RepositoryRuntime, DatabaseFailure>;
  readonly ids: DatabaseIdGeneratorShape;
  readonly identity: DatabaseIdentityShape;
  readonly projection: Projection;
  readonly writeAndSync: <A>(
    repositoryId: string,
    command: string,
    objectId: string | undefined,
    write: (repository: RepositoryRuntime) => Effect.Effect<{
      readonly result: A;
      readonly snapshotId: string;
    }, DatabaseFailure>,
    visible: () => boolean,
  ) => Effect.Effect<A, DatabaseFailure>;
};

export type PageOperationsShape = ReturnType<typeof makePageOperations>;

const nowIso = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => new Date(millis).toISOString()),
);

const decodePagePath = (value: unknown) =>
  Schema.decodeUnknownEffect(PagePath)(value, { errors: "all" }).pipe(
    Effect.mapError(
      (cause) =>
        new PagePathInvalid({
          message: "Page path is invalid",
          path: typeof value === "string" ? value : String(value),
          reason: String(cause),
        }),
    ),
  );

const decodePageId = (value: unknown) =>
  Schema.decodeUnknownEffect(PageId)(value, { errors: "all" }).pipe(
    Effect.mapError(
      (cause) =>
        new PageDocumentInvalid({
          field: "pageId",
          message: "Page id is invalid",
          reason: String(cause),
        }),
    ),
  );

const decodePageState = (value: unknown) =>
  Schema.decodeUnknownEffect(PageState)(value, { errors: "all" }).pipe(
    Effect.mapError(
      (cause) =>
        new PageDocumentInvalid({
          message: "Page document is invalid",
          reason: String(cause),
        }),
    ),
  );

const decodeInput = <S extends Schema.Top>(schema: S, value: unknown, field: string) =>
  Schema.decodeUnknownEffect(schema)(value, { errors: "all" }).pipe(
    Effect.mapError(
      (cause) =>
        new PageDocumentInvalid({
          field,
          message: `Page ${field} is invalid`,
          reason: String(cause),
        }),
    ),
  );

const sameTarget = (left: CycleResourceRefType, right: CycleResourceRefType): boolean =>
  left.repositoryId === right.repositoryId &&
  left.resourceKind === right.resourceKind &&
  left.resourceId === right.resourceId;

const mutationMessage = (actor: Actor, operation: string, title: string, path: string): string =>
  `${actor.name} ${operation} Page "${title}" at ${path}`;

export const makePageOperations = (dependencies: PageOperationsDependencies) => {
  const { projection } = dependencies;

  const projectedPage = (repositoryId: string, pageId: string) =>
    sqlite("get projected Page", () => projection.pages.getPage(repositoryId, pageId));

  const requirePage = Effect.fn("requirePage")(function* (
    repositoryId: string,
    pageIdValue: string,
  ) {
    const pageId = yield* decodePageId(pageIdValue);
    const page = yield* projectedPage(repositoryId, pageId);

    if (page === null) {
      return yield* new PageNotFound({
        message: "Page not found",
        pageId,
        repositoryId,
      });
    }

    return page;
  });

  const assertRevision = Effect.fn("assertRevision")(function* (
    page: typeof PageDocument.Type,
    expectedRevisionId: string,
  ) {
    if (page.revisionId === expectedRevisionId) return;

    return yield* new PageRevisionConflict({
      actualRevisionId: page.revisionId,
      current: pageSummary(page),
      expectedRevisionId,
      message: "Page revision does not match the expected revision",
      pageId: page.id,
      repositoryId: page.repositoryId,
    });
  });

  const assertState = Effect.fn("assertState")(function* (
    page: typeof PageDocument.Type,
    expected: "active" | "archived",
  ) {
    const actual = page.frontmatter.archivedAt === undefined ? "active" : "archived";
    if (actual === expected) return;

    return yield* new PageInvalidState({
      actualState: actual,
      expectedState: expected,
      message: `Page must be ${expected}`,
      pageId: page.id,
      repositoryId: page.repositoryId,
    });
  });

  const assertPathAvailable = Effect.fn("assertPathAvailable")(function* (
    repositoryId: string,
    pathValue: unknown,
    exceptPageId?: string,
  ) {
    const path = yield* decodePagePath(pathValue);
    const owner = yield* sqlite("resolve reserved Page path", () =>
      projection.pages.resolvePath(repositoryId, path),
    );

    if (owner !== null && owner.id !== exceptPageId) {
      return yield* new PagePathConflict({
        conflictingPageId: owner.id,
        message: "Page path is already reserved",
        path,
        repositoryId,
      });
    }

    return path;
  });

  const readCommittedPage = Effect.fn("readCommittedPage")(function* (
    repositoryId: string,
    pageId: string,
    revisionId: string,
    command: string,
  ) {
    const page = yield* projectedPage(repositoryId, pageId);
    if (page !== null && page.revisionId === revisionId) return page;

    return yield* new DatabaseConsistencyError({
      command,
      committedSnapshotId: revisionId,
      message: "Page commit is not visible at the committed revision",
      objectId: pageId,
      previousSnapshotId: page?.revisionId ?? null,
      repositoryId,
    });
  });

  const commitPageEvent = Effect.fn("commitPageEvent")(function* (
    repositoryId: string,
    pageId: string,
    actor: Actor,
    timestamp: string,
    command: string,
    message: string,
    payload: DatabaseEventPayload,
  ) {
    const revisionId = yield* dependencies.writeAndSync(
      repositoryId,
      command,
      pageId,
      (repository) =>
        Effect.gen(function* () {
          const tx = yield* dependencies.beginWriteTransaction(
            repository,
            command,
            actor,
            timestamp,
          );
          yield* dependencies.ensureActorUserProfile(repository, tx, actor, timestamp);
          yield* dependencies.appendEvent(tx, "page", pageId, payload);
          const snapshot = yield* tx.commit({ message });

          return { result: snapshot.id, snapshotId: snapshot.id };
        }),
      () => projection.pages.getPage(repositoryId, pageId) !== null,
    );

    return yield* readCommittedPage(repositoryId, pageId, revisionId, command);
  });

  const createPage = Effect.fn("createPage")(function* (
    repositoryId: string,
    rawInput: typeof CreatePageInput.Type,
    options: CommitOptions = {},
  ) {
    const input = yield* decodeInput(CreatePageInput, rawInput, "create input");
    const actor = yield* dependencies.identity.currentActor;
    const timestamp = yield* nowIso;
    const path = yield* assertPathAvailable(repositoryId, input.path);
    let pageId: typeof PageId.Type | undefined;

    for (let attempt = 0; attempt < 8 && pageId === undefined; attempt += 1) {
      const candidate = yield* dependencies.ids.pageId.pipe(Effect.flatMap(decodePageId));
      const existing = yield* projectedPage(repositoryId, candidate);
      if (existing === null) pageId = candidate;
    }
    if (pageId === undefined) {
      return yield* new PageDocumentInvalid({
        field: "pageId",
        message: "Unable to generate a unique Page id",
        reason: "bounded Page id generation attempts were exhausted",
      });
    }

    const state = yield* decodePageState({
      body: input.body,
      bodyFormat: "markdown",
      frontmatter: {
        ...input.frontmatterExtensions,
        createdAt: timestamp,
        createdBy: actor,
        id: pageId,
        schemaVersion: 1,
        title: input.title,
        updatedAt: timestamp,
        updatedBy: actor,
      },
      id: pageId,
      path,
      repositoryId,
    });

    return yield* commitPageEvent(
      repositoryId,
      pageId,
      actor,
      timestamp,
      "createPage",
      options.message ??
        input.commitMessage ??
        mutationMessage(actor, "created", state.frontmatter.title, state.path),
      {
        actor,
        humanApproved: input.humanApproved,
        op: "page.create",
        timestamp,
        value: state,
      },
    );
  });

  const getPage = Effect.fn("getPage")(function* (
    repositoryId: string,
    pageId: string,
    options: { readonly includeArchived?: boolean } = {},
  ) {
    const page = yield* requirePage(repositoryId, pageId);

    if (page.frontmatter.archivedAt !== undefined && options.includeArchived !== true) {
      return yield* new PageNotFound({
        message: "Page not found",
        pageId: page.id,
        repositoryId,
      });
    }

    return page;
  });

  const resolvePagePath = Effect.fn("resolvePagePath")(function* (
    repositoryId: string,
    pathValue: string,
    options: { readonly includeArchived?: boolean } = {},
  ) {
    const path = yield* decodePagePath(pathValue);
    const page = yield* sqlite("resolve Page path", () =>
      projection.pages.resolvePath(repositoryId, path),
    );

    if (page === null || (page.frontmatter.archivedAt !== undefined && options.includeArchived !== true)) {
      return null;
    }

    return page;
  });

  const listPages = Effect.fn("listPages")(function* (
    repositoryId: string,
    query: PageQuery = {},
  ) {
    return yield* sqlite("list Pages", () => projection.pages.listPages(repositoryId, query));
  });

  const listPageHierarchy = Effect.fn("listPageHierarchy")(function* (
    repositoryId: string,
    query: PageHierarchyQuery = {},
  ) {
    return yield* sqlite("list Page hierarchy", () =>
      projection.pages.hierarchy(repositoryId, query),
    );
  });

  const updatePage = Effect.fn("updatePage")(function* (
    repositoryId: string,
    pageIdValue: string,
    rawInput: typeof UpdatePageInput.Type,
    options: CommitOptions = {},
  ) {
    const input = yield* decodeInput(UpdatePageInput, rawInput, "update input");
    if (input.pageId !== pageIdValue) {
      return yield* new PageDocumentInvalid({
        field: "pageId",
        message: "Page id does not match the update target",
        reason: "path and payload Page ids differ",
      });
    }

    const current = yield* requirePage(repositoryId, pageIdValue);
    yield* assertState(current, "active");
    yield* assertRevision(current, input.expectedRevisionId);

    const actor = yield* dependencies.identity.currentActor;
    const timestamp = yield* nowIso;
    const path = yield* assertPathAvailable(
      repositoryId,
      input.path ?? current.path,
      current.id,
    );
    const extensions: Record<string, unknown> = { ...current.frontmatter };
    for (const [key, value] of Object.entries(input.frontmatterExtensionPatch ?? {})) {
      if (value === null) delete extensions[key];
      else extensions[key] = value;
    }

    const state = yield* decodePageState({
      body: input.body ?? current.body,
      bodyFormat: "markdown",
      frontmatter: {
        ...extensions,
        createdAt: current.frontmatter.createdAt,
        createdBy: current.frontmatter.createdBy,
        id: current.id,
        schemaVersion: 1,
        title: input.title ?? current.frontmatter.title,
        updatedAt: timestamp,
        updatedBy: actor,
      },
      id: current.id,
      path,
      repositoryId,
    });

    return yield* commitPageEvent(
      repositoryId,
      current.id,
      actor,
      timestamp,
      "updatePage",
      options.message ??
        input.commitMessage ??
        mutationMessage(actor, "updated", state.frontmatter.title, state.path),
      {
        actor,
        humanApproved: input.humanApproved,
        op: "page.replace",
        timestamp,
        value: state,
      },
    );
  });

  const archivePage = Effect.fn("archivePage")(function* (
    repositoryId: string,
    pageIdValue: string,
    rawInput: typeof ArchivePageInput.Type,
    options: CommitOptions = {},
  ) {
    const input = yield* decodeInput(ArchivePageInput, rawInput, "archive input");
    const current = yield* requirePage(repositoryId, pageIdValue);
    if (input.pageId !== current.id) {
      return yield* new PageDocumentInvalid({
        field: "pageId",
        message: "Page id does not match the archive target",
        reason: "path and payload Page ids differ",
      });
    }
    yield* assertState(current, "active");
    yield* assertRevision(current, input.expectedRevisionId);

    const actor = yield* dependencies.identity.currentActor;
    const timestamp = yield* nowIso;
    return yield* commitPageEvent(
      repositoryId,
      current.id,
      actor,
      timestamp,
      "archivePage",
      options.message ?? mutationMessage(actor, "archived", current.frontmatter.title, current.path),
      {
        actor,
        humanApproved: input.humanApproved,
        op: "page.archive",
        reason: input.reason,
        timestamp,
      },
    );
  });

  const restorePage = Effect.fn("restorePage")(function* (
    repositoryId: string,
    pageIdValue: string,
    rawInput: typeof RestorePageInput.Type,
    options: CommitOptions = {},
  ) {
    const input = yield* decodeInput(RestorePageInput, rawInput, "restore input");
    const current = yield* requirePage(repositoryId, pageIdValue);
    if (input.pageId !== current.id) {
      return yield* new PageDocumentInvalid({
        field: "pageId",
        message: "Page id does not match the restore target",
        reason: "path and payload Page ids differ",
      });
    }
    yield* assertState(current, "archived");
    yield* assertRevision(current, input.expectedRevisionId);

    const actor = yield* dependencies.identity.currentActor;
    const timestamp = yield* nowIso;
    return yield* commitPageEvent(
      repositoryId,
      current.id,
      actor,
      timestamp,
      "restorePage",
      options.message ?? mutationMessage(actor, "restored", current.frontmatter.title, current.path),
      {
        actor,
        humanApproved: input.humanApproved,
        op: "page.restore",
        reason: input.reason,
        timestamp,
      },
    );
  });

  const pageHistory = Effect.fn("pageHistory")(function* (
    repositoryId: string,
    pageIdValue: string,
    input?: PageHistoryInput,
  ) {
    const page = yield* requirePage(repositoryId, pageIdValue);
    if (input !== undefined && input.pageId !== page.id) {
      return yield* new PageDocumentInvalid({
        field: "pageId",
        message: "Page id does not match the history target",
        reason: "path and payload Page ids differ",
      });
    }

    return yield* sqlite("list Page history", () =>
      projection.pages.history(repositoryId, page.id, input?.options),
    );
  });

  const pageRevision = Effect.fn("pageRevision")(function* (
    repositoryId: string,
    pageIdValue: string,
    snapshotId: string,
  ) {
    const current = yield* requirePage(repositoryId, pageIdValue);
    const repository = yield* dependencies.getRepository(repositoryId);
    const head = yield* storage("resolve Page revision head", repository.store.resolveSnapshotId());
    const reachable =
      head !== null &&
      (yield* storage("read Page revision history", repository.store.history(head))).some(
        (snapshot) => snapshot.id === snapshotId,
      );

    if (!reachable) {
      return yield* new PageRevisionNotFound({
        message: "Page revision is not reachable from the active repository snapshot",
        pageId: current.id,
        repositoryId,
        snapshotId,
      });
    }

    const folded = yield* foldRepositoryEvents(repository, snapshotId);
    const page = folded.pages.get(current.id);
    if (page === undefined) {
      return yield* new PageRevisionNotFound({
        message: "Page did not exist at the requested revision",
        pageId: current.id,
        repositoryId,
        snapshotId,
      });
    }

    return page;
  });

  const decodeTarget = (value: unknown) =>
    Schema.decodeUnknownEffect(CycleResourceRef)(value, { errors: "all" }).pipe(
      Effect.mapError(() => {
        const target = (value ?? {}) as {
          readonly repositoryId?: unknown;
          readonly resourceId?: unknown;
          readonly resourceKind?: unknown;
        };
        return new CommentTargetUnsupported({
          message: "Comment target is unsupported",
          repositoryId: String(target.repositoryId ?? ""),
          resourceId: String(target.resourceId ?? ""),
          resourceKind: String(target.resourceKind ?? ""),
        });
      }),
    );

  const requireCommentTarget = Effect.fn("requireCommentTarget")(function* (
    rawTarget: CycleResourceRefType,
  ) {
    const target = yield* decodeTarget(rawTarget);
    const exists =
      target.resourceKind === "page"
        ? (yield* projectedPage(target.repositoryId, target.resourceId)) !== null
        : (yield* sqlite("get comment ticket target", () =>
            projection.getTicket(target.repositoryId, target.resourceId),
          )) !== null;

    if (!exists) {
      return yield* new CommentTargetNotFound({
        message: "Comment target not found",
        target,
      });
    }

    return target;
  });

  const listComments = Effect.fn("listComments")(function* (
    rawTarget: CycleResourceRefType,
    query: CommentQuery = {},
  ) {
    const target = yield* requireCommentTarget(rawTarget);
    return yield* sqlite("list resource comments", () =>
      projection.pages.listComments(target, query),
    );
  });

  const addComment = Effect.fn("addComment")(function* (
    rawTarget: CycleResourceRefType,
    rawInput: typeof CommentAddInput.Type,
    options: CommitOptions = {},
  ) {
    const target = yield* requireCommentTarget(rawTarget);
    const input = yield* Schema.decodeUnknownEffect(CommentAddInput)(rawInput, {
      errors: "all",
    }).pipe(
      Effect.mapError(
        () =>
          new CommentTargetUnsupported({
            message: "Comment input target is invalid",
            repositoryId: target.repositoryId,
            resourceId: target.resourceId,
            resourceKind: target.resourceKind,
          }),
      ),
    );
    if (!sameTarget(target, input.target)) {
      return yield* new CommentTargetUnsupported({
        message: "Comment input target does not match the requested target",
        repositoryId: input.target.repositoryId,
        resourceId: input.target.resourceId,
        resourceKind: input.target.resourceKind,
      });
    }

    const actor = yield* dependencies.identity.currentActor;
    const timestamp = yield* nowIso;
    const commentId = yield* dependencies.ids.commentId;
    const comment: CommentDocument = {
      body: input.body,
      bodyFormat: "markdown",
      createdAt: timestamp,
      createdBy: actor,
      id: commentId,
      repositoryId: target.repositoryId,
      schemaVersion: 1,
      target,
    };
    const committedId = yield* dependencies.writeAndSync(
      target.repositoryId,
      "addComment",
      commentId,
      (repository) =>
        Effect.gen(function* () {
          const tx = yield* dependencies.beginWriteTransaction(
            repository,
            "add comment",
            actor,
            timestamp,
          );
          yield* dependencies.ensureActorUserProfile(repository, tx, actor, timestamp);
          yield* dependencies.appendEvent(tx, "comment", commentId, {
            humanApproved: input.humanApproved,
            op: "comment.add",
            value: comment,
          });
          const snapshot = yield* tx.commit({
            message:
              options.message ??
              `${actor.name} commented on ${target.resourceKind} ${target.resourceId}`,
          });
          return { result: commentId, snapshotId: snapshot.id };
        }),
      () => projection.pages.getComment(target.repositoryId, commentId) !== null,
    );
    const projected = yield* sqlite("get projected comment", () =>
      projection.pages.getComment(target.repositoryId, committedId),
    );

    if (projected !== null) return projected;

    return yield* new DatabaseConsistencyError({
      command: "addComment",
      committedSnapshotId: committedId,
      message: "Comment commit is not visible in the projection",
      objectId: commentId,
      previousSnapshotId: null,
      repositoryId: target.repositoryId,
    });
  });

  return {
    addComment,
    archivePage,
    createPage,
    getPage,
    listComments,
    listPageHierarchy,
    listPages,
    pageHistory,
    pageRevision,
    resolvePagePath,
    restorePage,
    updatePage,
  } satisfies {
    readonly addComment: (
      target: CycleResourceRefType,
      input: typeof CommentAddInput.Type,
      options?: CommitOptions,
    ) => Effect.Effect<CommentDocument, PageOperationFailure>;
    readonly archivePage: (
      repositoryId: string,
      pageId: string,
      input: typeof ArchivePageInput.Type,
      options?: CommitOptions,
    ) => Effect.Effect<typeof PageDocument.Type, PageOperationFailure>;
    readonly createPage: (
      repositoryId: string,
      input: typeof CreatePageInput.Type,
      options?: CommitOptions,
    ) => Effect.Effect<typeof PageDocument.Type, PageOperationFailure>;
    readonly getPage: (
      repositoryId: string,
      pageId: string,
      options?: { readonly includeArchived?: boolean },
    ) => Effect.Effect<typeof PageDocument.Type, PageOperationFailure>;
    readonly listComments: (
      target: CycleResourceRefType,
      query?: CommentQuery,
    ) => Effect.Effect<CommentPage, PageOperationFailure>;
    readonly listPageHierarchy: (
      repositoryId: string,
      query?: PageHierarchyQuery,
    ) => Effect.Effect<PageHierarchy, PageOperationFailure>;
    readonly listPages: (
      repositoryId: string,
      query?: PageQuery,
    ) => Effect.Effect<PagePage, PageOperationFailure>;
    readonly pageHistory: (
      repositoryId: string,
      pageId: string,
      input?: PageHistoryInput,
    ) => Effect.Effect<PageHistoryPage, PageOperationFailure>;
    readonly pageRevision: (
      repositoryId: string,
      pageId: string,
      snapshotId: string,
    ) => Effect.Effect<typeof PageDocument.Type, PageOperationFailure>;
    readonly resolvePagePath: (
      repositoryId: string,
      path: string,
      options?: { readonly includeArchived?: boolean },
    ) => Effect.Effect<typeof PageDocument.Type | null, PageOperationFailure>;
    readonly restorePage: (
      repositoryId: string,
      pageId: string,
      input: typeof RestorePageInput.Type,
      options?: CommitOptions,
    ) => Effect.Effect<typeof PageDocument.Type, PageOperationFailure>;
    readonly updatePage: (
      repositoryId: string,
      pageId: string,
      input: typeof UpdatePageInput.Type,
      options?: CommitOptions,
    ) => Effect.Effect<typeof PageDocument.Type, PageOperationFailure>;
  };
};
