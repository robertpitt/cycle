import { Context, Effect, Layer } from "effect";
import { DatabaseIdGenerator, type DatabaseIdGeneratorShape } from "../../DatabaseIdGenerator.ts";
import { DatabaseIdentity, type DatabaseIdentityShape } from "../../DatabaseIdentity.ts";
import { DatabaseValidationError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import {
  DatabaseProjectionService,
  type DatabaseProjection,
} from "../projection/DatabaseProjection.ts";
import type { DatabaseEventPayload, PreparedWrite, RepositoryRuntime } from "../DatabaseRuntime.ts";
import type { RepositoryTransactionOptions } from "../../RepositoryStore.ts";
import type {
  Actor,
  CreateIssueTemplateInput,
  CreateOrUpdateUserProfileInput,
  CreateSavedViewInput,
  IssueTemplateDocument,
  LabelDefinitionDocument,
  SavedViewDocument,
  UpdateIssueTemplatePatch,
  UpdateSavedViewPatch,
  UpsertLabelDefinitionInput,
  UserProfileDocument,
  CommitOptions,
} from "../../domain/index.ts";
import { CURRENT_SCHEMA_VERSION, normalizeKey, stripUndefined } from "../../domain/index.ts";
import { assertNoUnsafeContent, validateRequiredString } from "./TicketCommandRules.ts";
import { gitIdentity, nowIso } from "../DatabaseBoundary.ts";
import {
  normalizeUserIdEffect,
  parseIssueTemplate,
  parseLabelDefinition,
  parseSavedView,
} from "./CatalogDocuments.ts";
import { CommandWriter, type CommandWriterShape } from "./CommandWriter.ts";
import { WriteCoordinator, type WriteCoordinatorShape } from "../repository/WriteCoordinator.ts";

export type MetadataOperationsDependencies = {
  readonly commandWriter: CommandWriterShape;
  readonly identity: DatabaseIdentityShape;
  readonly ids: DatabaseIdGeneratorShape;
  readonly projection: DatabaseProjection;
  readonly writeCoordinator: WriteCoordinatorShape;
};

export const makeMetadataOperations = (dependencies: MetadataOperationsDependencies) => {
  const { commandWriter, identity, ids, projection, writeCoordinator } = dependencies;
  const { appendEvent, beginWritePlan, ensureActorUserProfile } = commandWriter;
  const writeAndSync = writeCoordinator.writeAndSync;

  const prepareWrite = Effect.fn("MetadataOperations.prepareWrite")(function* <A>(
    repository: RepositoryRuntime,
    label: string,
    actor: Actor,
    now: string,
    aggregateType: string,
    aggregateId: string,
    payload: DatabaseEventPayload,
    result: A,
    commit: RepositoryTransactionOptions,
  ) {
    let plan = yield* beginWritePlan(repository, label, actor, now);
    plan = yield* ensureActorUserProfile(repository, plan, actor, now);
    plan = yield* appendEvent(plan, aggregateType, aggregateId, payload);
    return { commit, plan, resolve: () => result } satisfies PreparedWrite<A>;
  });

  const upsertUser = Effect.fn("MetadataOperations.upsertUser")(function* (
    repositoryId: string,
    input: CreateOrUpdateUserProfileInput,
    options: CommitOptions = {},
  ): Effect.fn.Return<UserProfileDocument, DatabaseFailure> {
    yield* assertNoUnsafeContent("user profile input", input);
    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
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
        prepareWrite(
          repository,
          "upsert user",
          actor,
          now,
          "user",
          userId,
          {
            op: "user.upsert",
            value: user,
          },
          user,
          {
            author: gitIdentity(actor),
            committer: gitIdentity(actor),
            message: options.message ?? `${actor.name} updated user profile ${userId}`,
          },
        ),
      () => projection.getUser(repositoryId, userId).pipe(Effect.map((value) => value !== null)),
    );
  });

  const upsertLabel = Effect.fn("MetadataOperations.upsertLabel")(function* (
    repositoryId: string,
    input: UpsertLabelDefinitionInput,
    options: CommitOptions = {},
  ): Effect.fn.Return<LabelDefinitionDocument, DatabaseFailure> {
    yield* assertNoUnsafeContent("label input", input);
    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
    const labelId = normalizeKey(input.id ?? input.name);
    const existing = (yield* projection.listLabels(repositoryId)).entries.find(
      (label) => label.id === labelId,
    );
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
        prepareWrite(
          repository,
          "upsert label",
          actor,
          now,
          "label",
          labelId,
          {
            op: "label.upsert",
            value: label,
          },
          label,
          {
            author: gitIdentity(actor),
            committer: gitIdentity(actor),
            message: options.message ?? `${actor.name} updated label ${label.name}`,
          },
        ),
      () =>
        projection
          .listLabels(repositoryId)
          .pipe(Effect.map((page) => page.entries.some((entry) => entry.id === labelId))),
    );
  });

  const archiveLabel = Effect.fn("MetadataOperations.archiveLabel")(function* (
    repositoryId: string,
    labelId: string,
    options: CommitOptions = {},
  ): Effect.fn.Return<LabelDefinitionDocument, DatabaseFailure> {
    const current = (yield* projection.listLabels(repositoryId)).entries.find(
      (label) => label.id === labelId,
    );

    if (current === undefined) {
      return yield* new DatabaseValidationError({ field: "labelId", message: "label not found" });
    }

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
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
        prepareWrite(
          repository,
          "archive label",
          actor,
          now,
          "label",
          labelId,
          {
            op: "label.upsert",
            value: next,
          },
          next,
          {
            author: gitIdentity(actor),
            committer: gitIdentity(actor),
            message: options.message ?? `${actor.name} archived label ${current.name}`,
          },
        ),
      () =>
        projection
          .listLabels(repositoryId)
          .pipe(
            Effect.map((page) =>
              page.entries.some((entry) => entry.id === labelId && entry.archivedAt !== undefined),
            ),
          ),
    );
  });

  const createView = Effect.fn("MetadataOperations.createView")(function* (
    repositoryId: string,
    input: CreateSavedViewInput,
    options: CommitOptions = {},
  ): Effect.fn.Return<SavedViewDocument, DatabaseFailure> {
    yield* assertNoUnsafeContent("saved view input", input);
    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
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
        prepareWrite(
          repository,
          "create view",
          actor,
          now,
          "view",
          viewId,
          {
            op: "view.upsert",
            value: view,
          },
          view,
          {
            author: gitIdentity(actor),
            committer: gitIdentity(actor),
            message: options.message ?? `${actor.name} created view ${view.name}`,
          },
        ),
      () => projection.getView(repositoryId, viewId).pipe(Effect.map((value) => value !== null)),
    );
  });

  const updateView = Effect.fn("MetadataOperations.updateView")(function* (
    repositoryId: string,
    viewId: string,
    patch: UpdateSavedViewPatch,
    options: CommitOptions = {},
  ): Effect.fn.Return<SavedViewDocument, DatabaseFailure> {
    yield* assertNoUnsafeContent("saved view patch", patch);
    const current = yield* projection.getView(repositoryId, viewId);

    if (current === null)
      return yield* new DatabaseValidationError({ field: "viewId", message: "view not found" });

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
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
        prepareWrite(
          repository,
          "update view",
          actor,
          now,
          "view",
          viewId,
          {
            op: "view.upsert",
            value: next,
          },
          next,
          {
            author: gitIdentity(actor),
            committer: gitIdentity(actor),
            message: options.message ?? `${actor.name} updated view ${next.name}`,
          },
        ),
      () => projection.getView(repositoryId, viewId).pipe(Effect.map((value) => value !== null)),
    );
  });

  const deleteView = Effect.fn("MetadataOperations.deleteView")(function* (
    repositoryId: string,
    viewId: string,
    options: CommitOptions = {},
  ): Effect.fn.Return<SavedViewDocument, DatabaseFailure> {
    const current = yield* projection.getView(repositoryId, viewId);

    if (current === null)
      return yield* new DatabaseValidationError({ field: "viewId", message: "view not found" });

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();

    return yield* writeAndSync(
      repositoryId,
      "deleteView",
      viewId,
      (repository) =>
        prepareWrite(
          repository,
          "delete view",
          actor,
          now,
          "view",
          viewId,
          {
            op: "view.delete",
          },
          current,
          {
            author: gitIdentity(actor),
            committer: gitIdentity(actor),
            message: options.message ?? `${actor.name} deleted view ${current.name}`,
          },
        ),
      () => projection.getView(repositoryId, viewId).pipe(Effect.map((value) => value === null)),
    );
  });

  const createTemplate = Effect.fn("MetadataOperations.createTemplate")(function* (
    repositoryId: string,
    input: CreateIssueTemplateInput,
    options: CommitOptions = {},
  ): Effect.fn.Return<IssueTemplateDocument, DatabaseFailure> {
    yield* assertNoUnsafeContent("issue template input", input);
    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
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
        prepareWrite(
          repository,
          "create template",
          actor,
          now,
          "template",
          templateId,
          {
            op: "template.upsert",
            value: template,
          },
          template,
          {
            author: gitIdentity(actor),
            committer: gitIdentity(actor),
            message: options.message ?? `${actor.name} created template ${template.name}`,
          },
        ),
      () =>
        projection
          .getTemplate(repositoryId, templateId)
          .pipe(Effect.map((value) => value !== null)),
    );
  });

  const updateTemplate = Effect.fn("MetadataOperations.updateTemplate")(function* (
    repositoryId: string,
    templateId: string,
    patch: UpdateIssueTemplatePatch,
    options: CommitOptions = {},
  ): Effect.fn.Return<IssueTemplateDocument, DatabaseFailure> {
    yield* assertNoUnsafeContent("issue template patch", patch);
    const current = yield* projection.getTemplate(repositoryId, templateId);

    if (current === null)
      return yield* new DatabaseValidationError({
        field: "templateId",
        message: "template not found",
      });

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
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
        prepareWrite(
          repository,
          "update template",
          actor,
          now,
          "template",
          templateId,
          {
            op: "template.upsert",
            value: next,
          },
          next,
          {
            author: gitIdentity(actor),
            committer: gitIdentity(actor),
            message: options.message ?? `${actor.name} updated template ${next.name}`,
          },
        ),
      () =>
        projection
          .getTemplate(repositoryId, templateId)
          .pipe(Effect.map((value) => value !== null)),
    );
  });

  const archiveTemplate = Effect.fn("MetadataOperations.archiveTemplate")(function* (
    repositoryId: string,
    templateId: string,
    options: CommitOptions = {},
  ): Effect.fn.Return<IssueTemplateDocument, DatabaseFailure> {
    return yield* updateTemplate(repositoryId, templateId, { active: false }, options);
  });

  return {
    archiveLabel,
    archiveTemplate,
    createTemplate,
    createView,
    deleteView,
    updateTemplate,
    updateView,
    upsertLabel,
    upsertUser,
  };
};

export type MetadataOperationsShape = ReturnType<typeof makeMetadataOperations>;

export class MetadataOperations extends Context.Service<
  MetadataOperations,
  MetadataOperationsShape
>()("@cycle/database/internals/commands/MetadataOperations") {}

export const MetadataOperationsLive = Layer.effect(
  MetadataOperations,
  Effect.gen(function* () {
    const commandWriter = yield* CommandWriter;
    const identity = yield* DatabaseIdentity;
    const ids = yield* DatabaseIdGenerator;
    const projection = yield* DatabaseProjectionService;
    const writeCoordinator = yield* WriteCoordinator;
    return MetadataOperations.of(
      makeMetadataOperations({ commandWriter, identity, ids, projection, writeCoordinator }),
    );
  }),
);
