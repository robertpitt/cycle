import {
  startCycleApiServer,
  type ApiRequestContext,
  type CycleApiServerHandle,
  type RepositoryDirectoryEntry,
} from "@cycle/api";
import {
  AgentProviderDetector,
  agentProviderDefinitionById,
  agentProviderProfileFromDetection,
  makeDefaultAgentServiceRegistry,
  mcpBearerTokenEnvVar,
  supportedAgentProviders,
  type AgentModelCatalog,
  type AgentProviderId,
  type AgentProviderProfile,
} from "@cycle/agents";
import { AgentControlInput, AgentRuntimeService } from "@cycle/agents/runtime";
import { AgentRuntimeSystemLive } from "@cycle/agents/system";
import {
  AgentTaskSubmitInput as DurableAgentTaskSubmitInput,
  type AgentTaskSnapshot as DurableAgentTaskSnapshot,
  AgentThreadCreateInput as DurableAgentThreadCreateInput,
  type AgentRunId as DurableAgentRunId,
} from "@cycle/agents/models";
import { AgentWorkflowError } from "@cycle/agents/errors";
import { AgentChat, AgentChatLive } from "@cycle/agent-chat";
import {
  AppConfig,
  appConfigStaticToken,
  defaultAgentProviderPreference,
  encodeAppConfig,
  type AppConfigState,
} from "@cycle/config";
import { DatabaseService } from "@cycle/database";
import { GitRepository } from "@cycle/git";
import { GitStores } from "@cycle/git-store";
import { Worktrees } from "@cycle/git-worktrees";
import { logError } from "@cycle/logging";
import { repositoryIdFromInput } from "@cycle/usecases";
import { Context, DateTime, Deferred, Effect, Layer, Option, Path, Scope, Stream } from "effect";
import { backendPaths, type BackendStartOptions } from "./BackendConfig.ts";
import { BackendApiError, errorMessage } from "./BackendErrors.ts";
import { BackendRepositoryOpenServiceLive } from "./BackendRepositoryOpen.ts";
import { LocalSettings } from "./LocalSettings.ts";
import { LocalWorkspace } from "./LocalWorkspace.ts";
import { RepositoryBootstrap } from "./RepositoryBootstrap.ts";
import { mergeHandoffEvidenceFromSummary } from "./internal/merge-handoff-evidence.ts";

export type BackendApiHandle = {
  readonly baseUrl?: string;
  readonly close: () => Promise<void>;
  readonly mcpPath?: string;
  readonly mcpUrl?: string;
  readonly port?: number;
  readonly runtimeFile?: string;
  readonly server?: CycleApiServerHandle;
  readonly started: boolean;
};

type BackendApiStartRequirements =
  | AgentProviderDetector
  | AppConfig
  | DatabaseService
  | GitRepository
  | GitStores
  | LocalSettings
  | LocalWorkspace
  | Path.Path
  | RepositoryBootstrap
  | Scope.Scope
  | Worktrees;

export type BackendApiService = {
  readonly start: (
    options?: BackendStartOptions,
  ) => Effect.Effect<BackendApiHandle, BackendApiError>;
};

export class BackendApi extends Context.Service<BackendApi, BackendApiService>()(
  "@cycle/backend/BackendApi",
) {}

const preferenceForProvider = (config: AppConfigState, providerId: AgentProviderId) => {
  const definition = agentProviderDefinitionById(providerId);
  return (
    config.agentProviders.preferences.find((entry) => entry.id === providerId) ??
    defaultAgentProviderPreference(providerId, definition.defaultEnabled ?? false)
  );
};

const profileWithPreference = (
  profile: AgentProviderProfile,
  config: AppConfigState,
  providerId: AgentProviderId,
): AgentProviderProfile => {
  const preference = preferenceForProvider(config, providerId);
  const enabled = preference.enabled;

  return {
    ...profile,
    activeRunCount: profile.activeRunCount ?? 0,
    configuration: {
      ...profile.configuration,
      detectedStatus: profile.status,
      preference: {
        config: preference.config ?? {},
        defaultModel: preference.defaultModel ?? null,
        enabled: preference.enabled,
        executablePath: preference.executablePath ?? null,
        maxConcurrentRuns: preference.maxConcurrentRuns ?? null,
      },
    },
    ...(preference.executablePath === null || preference.executablePath === undefined
      ? {}
      : { configuredExecutablePath: preference.executablePath }),
    defaultModel: preference.defaultModel ?? profile.defaultModel ?? null,
    maxConcurrentRuns: preference.maxConcurrentRuns ?? null,
    message: enabled ? profile.message : `${profile.displayName} is disabled in Cycle settings.`,
    status: enabled ? profile.status : "disabled",
  };
};

const modelCatalogStatus = (
  catalog: AgentModelCatalog,
): "available" | "unsupported" | "unavailable" =>
  catalog.source === "unsupported"
    ? "unsupported"
    : catalog.source === "unavailable"
      ? "unavailable"
      : "available";

const profileWithModelCatalog = (
  profile: AgentProviderProfile,
  config: AppConfigState,
  providerId: AgentProviderId,
  catalog: AgentModelCatalog,
): AgentProviderProfile => {
  const preference = preferenceForProvider(config, providerId);
  const models = catalog.models
    .filter((model) => model.status !== "hidden" && model.disabled !== true)
    .map((model) => model.id);
  const preferredModel =
    typeof preference.defaultModel === "string" && preference.defaultModel.trim().length > 0
      ? preference.defaultModel.trim()
      : undefined;

  return {
    ...profile,
    configuration: {
      ...profile.configuration,
      modelCatalog: {
        defaultReasoningEffortId: catalog.defaultReasoningEffortId ?? null,
        fetchedAt: catalog.fetchedAt,
        modelCount: models.length,
        reasoningEffortCount: catalog.reasoningEfforts?.length ?? 0,
        source: catalog.source,
        status: modelCatalogStatus(catalog),
        stale: catalog.stale === true,
      },
    },
    defaultModel:
      preferredModel ?? catalog.defaultModelId ?? models[0] ?? profile.defaultModel ?? null,
    defaultReasoningEffortId:
      catalog.defaultReasoningEffortId ?? profile.defaultReasoningEffortId ?? null,
    models,
    ...(catalog.reasoningEfforts === undefined
      ? {}
      : { reasoningEfforts: catalog.reasoningEfforts }),
  };
};

const profileWithModelCatalogFailure = (
  profile: AgentProviderProfile,
  error: unknown,
): AgentProviderProfile => ({
  ...profile,
  configuration: {
    ...profile.configuration,
    modelCatalog: {
      checkedAt: new Date().toISOString(),
      error: errorMessage(error),
      status: "failed",
    },
  },
});

const toBackendApiError = (cause: unknown): BackendApiError =>
  cause instanceof BackendApiError
    ? cause
    : new BackendApiError({
        cause,
        message: cause instanceof Error ? cause.message : "backend api operation failed",
        operation: "BackendApi.start",
      });

const ticketWorkflowError = (cause: unknown): AgentWorkflowError =>
  cause instanceof AgentWorkflowError
    ? cause
    : new AgentWorkflowError({
        code: "ticket_workflow_failed",
        message: cause instanceof Error ? cause.message : "Ticket completion workflow failed.",
        retryable: true,
        workflowId: "ticket-implementation",
      });

const agentTaskResourceProjection = (
  snapshot: DurableAgentTaskSnapshot,
  input: {
    readonly prompt: string;
    readonly repositoryId: string;
    readonly ticketId: string;
  },
) => {
  const task = snapshot.task;
  const status = (() => {
    switch (task.status) {
      case "claimed":
      case "preparing":
      case "resuming":
        return "starting" as const;
      case "suspended":
      case "suspending":
        return "waiting_for_input" as const;
      case "retry-wait":
        return "queued" as const;
      case "failed":
        return task.kind === "ticket-implementation" ? ("blocked" as const) : "failed";
      default:
        return task.status;
    }
  })();
  return {
    agentId: task.agentId,
    attempt: task.currentAttempt,
    authority: { mode: "full-access" as const },
    completedAt: task.completedAt === undefined ? undefined : DateTime.formatIso(task.completedAt),
    createdAt: DateTime.formatIso(task.createdAt),
    idempotencyKey: task.idempotencyKey,
    lastError: task.terminal?.status === "failed" ? task.terminal.error : undefined,
    maxAttempts: task.maxAttempts,
    metadata: {
      ...task.metadata,
      threadId: task.threadId,
      ...(task.authority.workspacePath === undefined
        ? {}
        : { worktreePath: task.authority.workspacePath }),
    },
    model: task.model,
    origin: { kind: "ticket", repositoryId: input.repositoryId, ticketId: input.ticketId },
    providerId: task.providerId,
    request: {
      authority: { mode: "full-access" as const },
      context: { repositoryId: input.repositoryId, ticketId: input.ticketId },
      input: input.prompt,
      instructions: "Implement the assigned ticket in its managed worktree.",
      metadata: task.metadata,
      origin: { kind: "ticket", repositoryId: input.repositoryId, ticketId: input.ticketId },
      requestedBy: "user",
    },
    rootRunId: task.currentRunId ?? null,
    schemaVersion: 1 as const,
    startedAt: task.startedAt === undefined ? undefined : DateTime.formatIso(task.startedAt),
    status,
    taskId: task.taskId,
    updatedAt: DateTime.formatIso(task.updatedAt),
    workspace:
      task.authority.workspacePath === undefined
        ? undefined
        : {
            path: task.authority.workspacePath,
            workspaceId: task.authority.worktreeId,
          },
  };
};

const startBackendApiUnsafe = Effect.fn("BackendApi.start")(function* (
  options: BackendStartOptions = {},
) {
  const agentProviderDetector = yield* AgentProviderDetector;
  const appConfig = yield* AppConfig;
  const bootstrap = yield* RepositoryBootstrap;
  const database = yield* DatabaseService;
  const settings = yield* LocalSettings;
  const gitRepository = yield* GitRepository;
  const gitStores = yield* GitStores;
  const worktrees = yield* Worktrees;
  const localWorkspace = yield* LocalWorkspace;
  const config = yield* appConfig.read;
  const staticToken = appConfigStaticToken(config);
  const paths = yield* backendPaths(options);
  const services = yield* Effect.context<BackendApiStartRequirements>();
  const environment = yield* Effect.sync(() => ({
    ...process.env,
    CYCLE_API_RUNTIME_FILE: paths.runtimeDiscoveryPath,
  }));
  const runPromise = <A>(effect: Effect.Effect<A, unknown, BackendApiStartRequirements>) =>
    Effect.runPromiseWith(services)(effect);
  const runAppConfigPromise = (effect: Effect.Effect<AppConfigState, unknown>) =>
    runPromise(effect.pipe(Effect.flatMap(encodeAppConfig)));

  if (!config.api.enabled) {
    return {
      close: async () => {},
      runtimeFile: paths.runtimeDiscoveryPath,
      started: false,
    };
  }

  const listRepositories = (): Promise<readonly RepositoryDirectoryEntry[]> =>
    runPromise(
      Effect.gen(function* () {
        const repositories = yield* localWorkspace.listRepositories;
        return repositories.map((repository) => ({
          displayName: repository.displayName,
          id: repository.id,
          path: repository.path,
        }));
      }),
    );

  const codexPreference = preferenceForProvider(config, "codex");
  const claudeCodePreference = preferenceForProvider(config, "claude-code");
  const cycleMcpUrl = yield* Deferred.make<string>();
  const scope = yield* Effect.scope;
  const agentChatContext = yield* Layer.buildWithScope(
    AgentChatLive.pipe(
      Layer.provideMerge(
        AgentRuntimeSystemLive({
          databasePath: paths.agentsDatabasePath,
          codex: {
            env: {
              ...environment,
              [mcpBearerTokenEnvVar]: staticToken,
            },
            ...(codexPreference.executablePath === null ||
            codexPreference.executablePath === undefined
              ? {}
              : { executablePath: codexPreference.executablePath }),
          },
          claude: {
            config: claudeCodePreference.config ?? {},
            env: environment,
            executablePath: claudeCodePreference.executablePath ?? null,
          },
          mcp: (input) =>
            Deferred.await(cycleMcpUrl).pipe(
              Effect.map((url) => ({
                headers: {
                  authorization: `Bearer ${staticToken}`,
                  "x-cycle-agent-task-id": input.task.taskId,
                  "x-cycle-agent-thread-id": input.task.threadId,
                  ...(input.task.repositoryId === undefined
                    ? {}
                    : { "x-cycle-repository-id": input.task.repositoryId }),
                  ...(input.task.authority.ticketId === undefined
                    ? {}
                    : { "x-cycle-ticket-id": input.task.authority.ticketId }),
                  ...(input.task.authority.worktreeId === undefined
                    ? {}
                    : { "x-cycle-worktree-id": input.task.authority.worktreeId }),
                },
                mode: "http" as const,
                url,
              })),
            ),
          workflows: [
            {
              id: "ticket-implementation",
              prepare: ({ task }) =>
                Effect.gen(function* () {
                  const repositoryId = task.metadata.repositoryId;
                  const ticketId = task.metadata.ticketId;
                  if (typeof repositoryId !== "string" || typeof ticketId !== "string") {
                    return yield* ticketWorkflowError(
                      new Error("Ticket workflow metadata is incomplete."),
                    );
                  }
                  const ticket = yield* database.getTicket(repositoryId, ticketId);
                  if (ticket === null) {
                    return yield* ticketWorkflowError(
                      new Error(`Ticket was not found: ${ticketId}`),
                    );
                  }
                  if (ticket.status === "done" || ticket.status === "canceled") {
                    return yield* ticketWorkflowError(
                      new Error(
                        `Ticket ${ticketId} is ${ticket.status}; implementation cannot resume.`,
                      ),
                    );
                  }
                  if (ticket.status === "needs-review" || ticket.status === "in-review") {
                    yield* database.transitionTicket(
                      repositoryId,
                      ticketId,
                      {
                        reason: "Review feedback resumed the existing agent implementation.",
                        status: "in-progress",
                      },
                      { message: `Resume ${ticketId} after review feedback` },
                    );
                  }
                }).pipe(Effect.mapError(ticketWorkflowError)),
              complete: ({ summary, task }) =>
                Effect.gen(function* () {
                  const repositoryId = task.metadata.repositoryId;
                  const ticketId = task.metadata.ticketId;
                  const worktreeId = task.metadata.worktreeId;
                  if (
                    typeof repositoryId !== "string" ||
                    typeof ticketId !== "string" ||
                    typeof worktreeId !== "string"
                  ) {
                    return yield* ticketWorkflowError(
                      new Error("Ticket workflow metadata is incomplete."),
                    );
                  }
                  const repositories = yield* localWorkspace.listRepositories;
                  const repository = repositories.find(
                    (candidate) => candidate.id === repositoryId,
                  );
                  if (repository === undefined) {
                    return yield* ticketWorkflowError(
                      new Error(`Repository is not configured: ${repositoryId}`),
                    );
                  }
                  const ticket = yield* database.getTicket(repositoryId, ticketId);
                  if (ticket === null) {
                    return yield* ticketWorkflowError(
                      new Error(`Ticket was not found: ${ticketId}`),
                    );
                  }
                  const evidence = mergeHandoffEvidenceFromSummary(summary);
                  const repositoryMetadata = yield* gitRepository.metadata(repository.path);
                  const handover = yield* worktrees.handover(
                    { repositoryId, repositoryPath: repository.path },
                    {
                      actor: "cycle-agent-runtime",
                      artifacts: evidence.artifacts,
                      handoverId: `worktree_handover_${task.taskId}`,
                      knownLimitations: evidence.knownLimitations,
                      message: `${ticketId}: ${ticket.title}`,
                      pushPolicy: "required",
                      remoteUrl: repositoryMetadata.defaultRemoteUrl,
                      summary,
                      targetStatus: "needs-review",
                      tests: evidence.tests,
                      validation: evidence.validation,
                      worktreeId,
                    },
                  );
                  const handoverId = handover.handoverId;
                  const commentBody = [
                    "## Merge-ready handoff",
                    "",
                    summary,
                    "",
                    `State: ${handover.reviewState}`,
                    `Branch: ${handover.branchName ?? "Not published"}`,
                    `Push: ${handover.pushStatus}${handover.remoteName ? ` (${handover.remoteName})` : ""}`,
                    `Commits: ${handover.commits.length === 0 ? "None" : handover.commits.join(", ")}`,
                    `Changed files: ${handover.changedFiles.length === 0 ? "None" : handover.changedFiles.map((file) => `${file.status} ${file.path}`).join(", ")}`,
                    `Tests: ${handover.tests.length === 0 ? "None reported" : handover.tests.map((test) => `${test.status}: ${test.result}`).join("; ")}`,
                    `Artifacts: ${handover.artifacts.length === 0 ? "None" : handover.artifacts.join(", ")}`,
                    `Risks, limitations, and follow-ups: ${handover.knownLimitations.length === 0 ? "None reported" : handover.knownLimitations.join("; ")}`,
                    "",
                    `Task: ${task.taskId}`,
                    `Worktree: ${worktreeId}`,
                    `Handover: ${handoverId}`,
                  ].join("\n");
                  const comments = yield* database.ticketRecords(repositoryId, ticketId, {
                    limit: 500,
                    recordType: "comment",
                  });
                  const alreadyCommented = comments.entries.some((record) => {
                    const payload = record.payload;
                    return (
                      typeof payload === "object" &&
                      payload !== null &&
                      "body" in payload &&
                      typeof payload.body === "string" &&
                      payload.body.includes(`Handover: ${handoverId}`)
                    );
                  });
                  if (!alreadyCommented) {
                    yield* database.addComment(repositoryId, ticketId, { body: commentBody });
                  }
                  if (ticket.status !== "needs-review") {
                    yield* database.transitionTicket(
                      repositoryId,
                      ticketId,
                      {
                        reason: "Agent implementation is ready for human review.",
                        status: "needs-review",
                      },
                      { message: `Mark ${ticketId} ready for review` },
                    );
                  }
                }).pipe(Effect.mapError(ticketWorkflowError)),
              failed: ({ error, task }) =>
                Effect.gen(function* () {
                  const repositoryId = task.metadata.repositoryId;
                  const ticketId = task.metadata.ticketId;
                  if (typeof repositoryId !== "string" || typeof ticketId !== "string") return;
                  const repositories = yield* localWorkspace.listRepositories;
                  const repository = repositories.find(
                    (candidate) => candidate.id === repositoryId,
                  );
                  const partialHandoff =
                    repository === undefined
                      ? null
                      : yield* worktrees
                          .findHandover(
                            { repositoryId, repositoryPath: repository.path },
                            `worktree_handover_${task.taskId}`,
                          )
                          .pipe(Effect.catch(() => Effect.succeed(null)));
                  const marker = `Agent blocker: ${task.taskId}:${error.code}`;
                  const comments = yield* database.ticketRecords(repositoryId, ticketId, {
                    limit: 500,
                    recordType: "comment",
                  });
                  const alreadyCommented = comments.entries.some((record) => {
                    const payload = record.payload;
                    return (
                      typeof payload === "object" &&
                      payload !== null &&
                      "body" in payload &&
                      typeof payload.body === "string" &&
                      payload.body.includes(marker)
                    );
                  });
                  if (!alreadyCommented) {
                    const worktreePath = task.metadata.worktreePath;
                    const branchName = task.metadata.branchName;
                    yield* database.addComment(repositoryId, ticketId, {
                      body: [
                        "Agent implementation is blocked and requires attention.",
                        "",
                        `Error: ${error.code} — ${error.message}`,
                        `Provider: ${task.providerId}`,
                        `Task: ${task.taskId}`,
                        ...(typeof worktreePath === "string" ? [`Worktree: ${worktreePath}`] : []),
                        ...(typeof branchName === "string" && branchName.length > 0
                          ? [`Branch: ${branchName}`]
                          : []),
                        ...(partialHandoff === null
                          ? []
                          : [
                              `Handoff: ${partialHandoff.handoverId}`,
                              `Handoff state: ${partialHandoff.reviewState}`,
                              `Push: ${partialHandoff.pushStatus}${partialHandoff.pushError ? ` — ${partialHandoff.pushError}` : ""}`,
                              `Commits: ${partialHandoff.commits.length === 0 ? "None" : partialHandoff.commits.join(", ")}`,
                              `Changed files: ${partialHandoff.changedFiles.length === 0 ? "None" : partialHandoff.changedFiles.map((file) => `${file.status} ${file.path}`).join(", ")}`,
                            ]),
                        "No worktree cleanup was performed. Resolve the error, then retry from the original Cycle chat.",
                        "",
                        marker,
                      ].join("\n"),
                    });
                  }
                  const current = yield* database.getTicket(repositoryId, ticketId);
                  if (
                    current !== null &&
                    current.status !== "in-progress" &&
                    current.status !== "done" &&
                    current.status !== "canceled"
                  ) {
                    yield* database.transitionTicket(
                      repositoryId,
                      ticketId,
                      {
                        reason: "Agent implementation is blocked and remains active.",
                        status: "in-progress",
                      },
                      { message: `Mark ${ticketId} agent implementation blocked` },
                    );
                  }
                }).pipe(Effect.mapError(ticketWorkflowError)),
            },
          ],
        }),
      ),
    ),
    scope,
  ).pipe(Effect.mapError(toBackendApiError));
  const agentChat = Context.get(agentChatContext, AgentChat);
  const agentRuntime = Context.get(agentChatContext, AgentRuntimeService);

  const assignTicketToAgent = (
    repositoryId: string,
    ticketId: string,
    input: Readonly<Record<string, unknown>>,
    requestContext: ApiRequestContext,
  ): Promise<unknown> =>
    runPromise(
      Effect.gen(function* () {
        const repositories = yield* localWorkspace.listRepositories;
        const repository = repositories.find((candidate) => candidate.id === repositoryId);
        if (repository === undefined) {
          return yield* new BackendApiError({
            message: `Repository is not configured in this workspace: ${repositoryId}`,
            operation: "BackendApi.assignTicket.repository",
          });
        }
        const ticket = yield* database
          .getTicket(repositoryId, ticketId)
          .pipe(Effect.mapError(toBackendApiError));
        if (ticket === null) {
          return yield* new BackendApiError({
            message: `Ticket was not found: ${ticketId}`,
            operation: "BackendApi.assignTicket.ticket",
          });
        }

        if (ticket.status === "done" || ticket.status === "canceled") {
          return yield* new BackendApiError({
            message: `Ticket ${ticketId} is ${ticket.status} and cannot start implementation work.`,
            operation: "BackendApi.assignTicket.terminalTicket",
          });
        }

        const requestedProviderId =
          typeof input.providerId === "string" ? input.providerId : "codex";
        const providerDefinition = supportedAgentProviders.find(
          (candidate) => candidate.id === requestedProviderId,
        );
        if (providerDefinition === undefined) {
          return yield* new BackendApiError({
            message: `Agent provider is not supported: ${requestedProviderId}`,
            operation: "BackendApi.assignTicket.provider",
          });
        }
        const providerId = providerDefinition.id;
        const providerPreference = preferenceForProvider(config, providerId);
        if (!providerPreference.enabled) {
          return yield* new BackendApiError({
            message: `Agent provider is disabled: ${providerId}`,
            operation: "BackendApi.assignTicket.providerDisabled",
          });
        }
        const detectedProviders = yield* agentProviderDetector.detect.pipe(
          Effect.mapError(toBackendApiError),
        );
        const detectedProvider = detectedProviders.find((candidate) => candidate.id === providerId);
        if (detectedProvider?.status !== "available") {
          return yield* new BackendApiError({
            message: detectedProvider?.message ?? `Agent provider is unavailable: ${providerId}`,
            operation: "BackendApi.assignTicket.providerUnavailable",
          });
        }

        const profile = yield* settings.getProfile.pipe(Effect.mapError(toBackendApiError));
        const assignedUserId = profile.email.trim().toLowerCase();
        if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/u.test(assignedUserId)) {
          return yield* new BackendApiError({
            message: "Complete your Cycle profile with a valid email before starting an agent.",
            operation: "BackendApi.assignTicket.currentUser",
          });
        }
        const requestEmail =
          requestContext.actor?.type === "human"
            ? requestContext.actor.email?.trim().toLowerCase()
            : undefined;
        if (requestEmail !== undefined && requestEmail !== assignedUserId) {
          return yield* new BackendApiError({
            message: "The desktop actor does not match the configured Cycle profile.",
            operation: "BackendApi.assignTicket.actorMismatch",
          });
        }

        const agentId = typeof input.agentId === "string" ? input.agentId : providerId;
        const model = typeof input.model === "string" ? input.model : undefined;
        const commandId =
          typeof input.commandId === "string"
            ? input.commandId
            : typeof input.idempotencyKey === "string"
              ? input.idempotencyKey
              : crypto.randomUUID();
        const idempotencyKey = `ticket:${repositoryId}:${ticketId}:command:${commandId}`;
        const requestedInput = input.input;
        const additionalInstructions =
          typeof input.instructions === "string" && input.instructions.trim().length > 0
            ? input.instructions.trim()
            : undefined;
        const prompt =
          typeof requestedInput === "string"
            ? requestedInput
            : [
                `Implement ticket ${ticketId}: ${ticket.title}`,
                "",
                ticket.body,
                ...(additionalInstructions === undefined
                  ? []
                  : ["", "Additional user instructions:", additionalInstructions]),
                "",
                "Cycle has already prepared and attached the implementation worktree. Work only in the provided current working directory. Do not create, attach, remove, or relocate Git worktrees. Implement and verify the ticket, then provide a detailed completion summary; Cycle owns final commit, push, handover comment, and ticket transition.",
              ].join("\n");
        const canonicalCommandInput = JSON.stringify({
          additionalInstructions: additionalInstructions ?? null,
          agentId,
          model: model ?? null,
          providerId,
          requestedInput: requestedInput ?? null,
        });

        const commandTask = yield* agentRuntime.listTasks({ limit: 10_000 }).pipe(
          Stream.filter((task) => task.idempotencyKey === idempotencyKey),
          Stream.runHead,
        );
        if (Option.isSome(commandTask)) {
          if (commandTask.value.metadata.commandInput !== canonicalCommandInput) {
            return yield* new BackendApiError({
              message: "The idempotency key was already used with different task input.",
              operation: "BackendApi.assignTicket.idempotencyConflict",
            });
          }
          const existingSnapshot = yield* agentRuntime.getTask(commandTask.value.taskId);
          if (Option.isSome(existingSnapshot)) {
            return agentTaskResourceProjection(existingSnapshot.value, {
              prompt,
              repositoryId,
              ticketId,
            });
          }
        }

        const prerequisiteIds = [
          ...new Set(
            (ticket.frontmatter.relations ?? []).flatMap((relation) =>
              relation.type === "depends_on" || relation.type === "blocked-by"
                ? [relation.issueId]
                : [],
            ),
          ),
        ];
        const prerequisites = yield* Effect.forEach(prerequisiteIds, (prerequisiteId) =>
          database.getTicket(repositoryId, prerequisiteId).pipe(Effect.mapError(toBackendApiError)),
        );
        const unfinishedPrerequisiteIds = prerequisites.flatMap((prerequisite, index) =>
          prerequisite === null ||
          (prerequisite.status !== "done" &&
            prerequisite.status !== "closed" &&
            prerequisite.status !== "completed" &&
            prerequisite.archivedAt === undefined &&
            prerequisite.deletedAt === undefined)
            ? [prerequisite?.id ?? prerequisiteIds[index]!]
            : [],
        );
        if (unfinishedPrerequisiteIds.length > 0) {
          return yield* new BackendApiError({
            message: `Ticket ${ticketId} is blocked by unfinished prerequisite tickets: ${unfinishedPrerequisiteIds.join(", ")}`,
            operation: "BackendApi.assignTicket.blocked",
            repositoryId,
          });
        }

        const existingContextTask = yield* agentRuntime.listTasks({ limit: 10_000 }).pipe(
          Stream.filter(
            (task) =>
              task.kind === "ticket-implementation" &&
              task.metadata.repositoryId === repositoryId &&
              task.metadata.ticketId === ticketId,
          ),
          Stream.runHead,
        );
        if (Option.isSome(existingContextTask)) {
          const existingTask = existingContextTask.value;
          if (existingTask.providerId !== providerId) {
            return yield* new BackendApiError({
              message: `Ticket ${ticketId} already has an implementation thread using ${existingTask.providerId}. Resume that thread instead of changing provider.`,
              operation: "BackendApi.assignTicket.activeContextConflict",
            });
          }
          const contextUserId = existingTask.metadata.assignedUserId;
          if (typeof contextUserId === "string" && contextUserId !== assignedUserId) {
            return yield* new BackendApiError({
              message: `Ticket ${ticketId} already has an implementation context assigned to another user.`,
              operation: "BackendApi.assignTicket.assigneeConflict",
            });
          }
          if (ticket.frontmatter.assignee !== assignedUserId) {
            yield* database
              .updateTicket(repositoryId, ticketId, {
                frontmatter: { assignee: assignedUserId },
                message: `Assign ${ticketId} to ${profile.displayName}`,
              })
              .pipe(Effect.mapError(toBackendApiError));
          }
          if (
            ticket.status !== "in-progress" &&
            ticket.status !== "needs-review" &&
            ticket.status !== "in-review"
          ) {
            yield* database
              .transitionTicket(
                repositoryId,
                ticketId,
                {
                  reason: "Resume the existing Cycle implementation context.",
                  status: "in-progress",
                },
                { message: `Resume ${ticketId} agent implementation` },
              )
              .pipe(Effect.mapError(toBackendApiError));
          }
          const existingSnapshot = yield* agentRuntime.getTask(existingTask.taskId);
          if (Option.isSome(existingSnapshot)) {
            const existingPrompt =
              typeof existingTask.input.message === "string" ? existingTask.input.message : prompt;
            return agentTaskResourceProjection(existingSnapshot.value, {
              prompt: existingPrompt,
              repositoryId,
              ticketId,
            });
          }
        }

        const rootRunId = yield* Effect.sync(
          () => `agent_run_${crypto.randomUUID().replaceAll("-", "")}` as DurableAgentRunId,
        );
        const jobId = `job_${crypto.randomUUID().replaceAll("-", "")}`;
        const descriptor = { repositoryId, repositoryPath: repository.path };
        const worktree = yield* worktrees
          .create(descriptor, {
            cleanupPolicy: "retain_until",
            jobId: jobId as never,
            mode: "implementation",
            repositoryId: repositoryId as never,
            repositoryPath: repository.path,
            ticketId: ticketId as never,
            ticketSlugSource: ticket.title,
            ticketType: ticket.type,
          })
          .pipe(Effect.mapError(toBackendApiError));

        const cleanupWorktree = worktrees
          .cleanup(descriptor, { actor: "cycle-ticket-implementation", record: worktree })
          .pipe(Effect.catch(() => Effect.void));
        const thread = yield* agentRuntime
          .createThread(
            new DurableAgentThreadCreateInput({
              agentId,
              authority: {
                allowedOperations: [
                  "repository.read",
                  "workspace.write",
                  "command.execute",
                  "ticket.comment",
                ],
                mode: "implementation-worktree",
                repositoryId,
                ticketId,
                workspacePath: worktree.path,
                worktreeId: worktree.worktreeId,
              },
              harnessId: providerId,
              idempotencyKey: `thread:${idempotencyKey}`,
              kind: "ticket-implementation",
              metadata: {
                assignedUserId,
                branchName: worktree.desiredBranchName ?? "",
                repositoryId,
                ticketId,
                worktreePath: worktree.path,
                worktreeId: worktree.worktreeId,
              },
              providerId,
              repositoryId,
              ticketId,
              title: `${ticketId}: ${ticket.title}`,
              workflowId: "ticket-implementation",
              ...(model === undefined ? {} : { model }),
            }),
          )
          .pipe(
            Effect.mapError(toBackendApiError),
            Effect.catch((error) => cleanupWorktree.pipe(Effect.andThen(Effect.fail(error)))),
          );

        const restorePreparedState = Effect.gen(function* () {
          yield* database
            .updateTicket(repositoryId, ticketId, {
              frontmatter: {
                assignee: ticket.frontmatter.assignee ?? null,
                status: ticket.status,
              },
              message: `Restore ${ticketId} after agent startup failure`,
            })
            .pipe(Effect.catch(() => Effect.void));
          yield* agentRuntime
            .archiveThread(thread.thread.threadId)
            .pipe(Effect.catch(() => Effect.void));
          yield* cleanupWorktree;
        });

        yield* Effect.gen(function* () {
          if (ticket.frontmatter.assignee !== assignedUserId) {
            yield* database.updateTicket(repositoryId, ticketId, {
              frontmatter: { assignee: assignedUserId },
              message: `Assign ${ticketId} to ${profile.displayName}`,
            });
          }
          if (ticket.status !== "in-progress") {
            yield* database.transitionTicket(
              repositoryId,
              ticketId,
              {
                reason: "Cycle prepared the implementation worktree and agent thread.",
                status: "in-progress",
              },
              { message: `Start ${ticketId} agent implementation` },
            );
          }
        }).pipe(
          Effect.mapError(toBackendApiError),
          Effect.catch((error) => restorePreparedState.pipe(Effect.andThen(Effect.fail(error)))),
        );

        const taskSnapshot = yield* agentRuntime
          .submit(
            new DurableAgentTaskSubmitInput({
              agentId,
              authority: thread.thread.authority,
              harnessId: providerId,
              idempotencyKey,
              input: {
                message: prompt,
                repositoryId,
                ticketId,
                ticketTitle: ticket.title,
                workflow:
                  "Implement in the assigned worktree. Validate the result and provide a detailed completion summary.",
              },
              kind: "ticket-implementation",
              maxAttempts: typeof input.maxAttempts === "number" ? input.maxAttempts : undefined,
              metadata: {
                assignedUserId,
                branchName: worktree.desiredBranchName ?? "",
                commandId,
                commandInput: canonicalCommandInput,
                repositoryId,
                ticketId,
                threadId: thread.thread.threadId,
                worktreePath: worktree.path,
                worktreeId: worktree.worktreeId,
              },
              priorityLane: "assigned",
              providerId,
              repositoryId,
              rootRunId,
              threadId: thread.thread.threadId,
              workflowId: "ticket-implementation",
              ...(model === undefined ? {} : { model }),
            }),
          )
          .pipe(
            Effect.mapError(toBackendApiError),
            Effect.catch((error) => restorePreparedState.pipe(Effect.andThen(Effect.fail(error)))),
          );

        return agentTaskResourceProjection(taskSnapshot, { prompt, repositoryId, ticketId });
      }),
    );

  const cleanupTerminalTicket = Effect.fn("BackendApi.cleanupTerminalTicket")(function* (
    repositoryId: string,
    ticketId: string,
  ) {
    const repositories = yield* localWorkspace.listRepositories;
    const repository = repositories.find((candidate) => candidate.id === repositoryId);
    if (repository === undefined) return;
    const descriptor = { repositoryId, repositoryPath: repository.path };
    const tasks = yield* agentRuntime.listTasks({ limit: 10_000 }).pipe(
      Stream.filter(
        (task) =>
          task.kind === "ticket-implementation" &&
          task.metadata.repositoryId === repositoryId &&
          task.metadata.ticketId === ticketId,
      ),
      Stream.runCollect,
    );
    const contexts = new Map<
      string,
      { readonly task: (typeof tasks)[number]; readonly worktreeId: string }
    >();
    for (const task of tasks) {
      const worktreeId = task.metadata.worktreeId;
      if (typeof worktreeId === "string" && !contexts.has(task.threadId)) {
        contexts.set(task.threadId, { task, worktreeId });
      }
    }
    yield* Effect.forEach(
      contexts.values(),
      ({ task, worktreeId }) =>
        Effect.gen(function* () {
          if (
            task.status !== "completed" &&
            task.status !== "failed" &&
            task.status !== "cancelled"
          ) {
            yield* agentRuntime
              .cancel(
                new AgentControlInput({
                  reason: `Ticket ${ticketId} became terminal.`,
                  taskId: task.taskId,
                  threadId: task.threadId,
                }),
              )
              .pipe(Effect.catch(() => Effect.void));
          }
          const record = yield* worktrees
            .get(descriptor, worktreeId)
            .pipe(Effect.catch(() => Effect.succeed(undefined)));
          if (record !== undefined && record.status !== "removed" && record.status !== "removing") {
            yield* worktrees
              .cleanup(descriptor, {
                actor: "cycle-ticket-terminal-cleanup",
                record,
              })
              .pipe(Effect.catch(() => Effect.void));
          }
          yield* agentRuntime.archiveThread(task.threadId).pipe(Effect.catch(() => Effect.void));
        }),
      { concurrency: 1, discard: true },
    );
  });

  return yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const agentServices = makeDefaultAgentServiceRegistry({
          env: {
            ...environment,
            [mcpBearerTokenEnvVar]: staticToken,
          },
          ...(codexPreference.executablePath === null ||
          codexPreference.executablePath === undefined
            ? {}
            : { executablePath: codexPreference.executablePath }),
          claudeCode: {
            config: claudeCodePreference.config ?? {},
            executablePath: claudeCodePreference.executablePath ?? null,
          },
        });
        const listAgentProviderProfiles = async (): Promise<readonly AgentProviderProfile[]> => {
          const currentConfig = await runPromise(appConfig.read);
          const detected = await runPromise(agentProviderDetector.detect);
          const detectedById = new Map(detected.map((provider) => [provider.id, provider]));

          return Promise.all(
            supportedAgentProviders.map(async (definition) => {
              const detectedProvider = detectedById.get(definition.id);
              const baseProfile =
                detectedProvider === undefined
                  ? {
                      ...agentProviderProfileFromDetection({
                        capabilities:
                          definition.capabilities ??
                          agentProviderDefinitionById(definition.id).capabilities,
                        detectedAt: new Date().toISOString(),
                        executable: definition.executable,
                        id: definition.id,
                        name: definition.name,
                        packageName: definition.packageName,
                        status: "missing",
                      }),
                      message: `${definition.name} provider status has not been checked.`,
                    }
                  : agentProviderProfileFromDetection(detectedProvider);
              const preferredProfile = profileWithPreference(
                baseProfile,
                currentConfig,
                definition.id,
              );
              if (preferredProfile.status !== "available") return preferredProfile;

              try {
                const service = await Effect.runPromise(agentServices.serviceFor(definition.id));
                const catalog = await service.listModels();
                return profileWithModelCatalog(
                  preferredProfile,
                  currentConfig,
                  definition.id,
                  catalog,
                );
              } catch (error) {
                logError("backend", "agent provider model listing failed", {
                  component: "agent",
                  error: errorMessage(error),
                  providerId: definition.id,
                  service: "backend",
                });
                return profileWithModelCatalogFailure(preferredProfile, error);
              }
            }),
          );
        };
        const agentTaskLayer = Layer.succeed(AgentRuntimeService, agentRuntime);
        const databaseLayer = Layer.succeed(DatabaseService, DatabaseService.of(database));
        const backendRepositoryOpenLayer = BackendRepositoryOpenServiceLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              databaseLayer,
              Layer.succeed(GitRepository, GitRepository.of(gitRepository)),
              Layer.succeed(GitStores, GitStores.of(gitStores)),
              Layer.succeed(LocalWorkspace, LocalWorkspace.of(localWorkspace)),
            ),
          ),
        );

        const handle = await startCycleApiServer({
          agentChat,
          assignTicketToAgent,
          agentProviderProfiles: listAgentProviderProfiles,
          host: options.host ?? config.api.host,
          localSettings: {
            completeOnboarding: (input) =>
              runAppConfigPromise(
                settings.completeOnboarding({
                  displayName: input.displayName,
                  email: input.email,
                  enabledAgentProviderIds: input.enabledAgentProviderIds,
                  themePreference: input.themePreference,
                }),
              ),
            read: () => runAppConfigPromise(settings.read),
            removeRepository: (repositoryId) =>
              runAppConfigPromise(settings.removeRepository(repositoryId)),
            setInterfaceDensity: (density) =>
              runAppConfigPromise(settings.setInterfaceDensity(density)),
            setThemePreference: (preference) =>
              runAppConfigPromise(settings.setThemePreference(preference)),
            updateProfile: (input) => runPromise(settings.updateProfile(input)),
            updateRepositoryPreferences: (input) =>
              runPromise(
                settings.updateRepositoryPreferences({
                  id: input.id,
                  preferences: input.preferences,
                }),
              ),
            updateAgentProviderPreference: (input) =>
              runAppConfigPromise(
                settings.updateAgentProviderPreference({
                  preference: input.preference,
                  providerId: input.providerId,
                }),
              ),
          },
          logging: { console: false, packageName: "backend" },
          mcp: {
            apiToken: staticToken,
            auth: { token: staticToken },
            enabled: true,
            env: {
              ...environment,
              CYCLE_API_RUNTIME_FILE: paths.runtimeDiscoveryPath,
            },
            path: "/mcp",
          },
          listRepositories,
          port: (() => {
            const configuredPort = options.port ?? config.api.port;
            return configuredPort === "auto" ? undefined : configuredPort;
          })(),
          onUseCaseSuccess: (event) => {
            const repositoryId = repositoryIdFromInput(event.input);
            if (event.sideEffect !== "write" || repositoryId === undefined) return;
            const value =
              typeof event.value === "object" && event.value !== null
                ? (event.value as Readonly<Record<string, unknown>>)
                : undefined;
            const ticketId = typeof value?.id === "string" ? value.id : undefined;
            const status = typeof value?.status === "string" ? value.status : undefined;
            const terminalCleanup =
              (event.name === "IssueUpdate" || event.name === "IssueTransition") &&
              ticketId !== undefined &&
              (status === "done" || status === "canceled")
                ? cleanupTerminalTicket(repositoryId, ticketId)
                : Effect.void;
            return runPromise(
              bootstrap.notifyRepositoryChanged(repositoryId).pipe(Effect.andThen(terminalCleanup)),
            ) as Promise<void>;
          },
          runtimeFile: paths.runtimeDiscoveryPath,
          staticToken,
          useCaseLayer: Layer.mergeAll(databaseLayer, agentTaskLayer, backendRepositoryOpenLayer),
          worktrees,
          worktreeStoragePath: paths.agentWorktreesPath,
        });

        return { handle };
      },
      catch: (cause) =>
        new BackendApiError({
          cause,
          message: cause instanceof Error ? cause.message : "start api server failed",
          operation: "BackendApi.start",
        }),
    }).pipe(Effect.tap(({ handle }) => Deferred.succeed(cycleMcpUrl, `${handle.baseUrl}/mcp`))),
    ({ handle }) =>
      Effect.tryPromise({
        try: async () => {
          await handle.close();
        },
        catch: (cause) =>
          new BackendApiError({
            cause,
            message: cause instanceof Error ? cause.message : "stop api server failed",
            operation: "BackendApi.stop",
          }),
      }).pipe(
        Effect.catch((error) =>
          logError("backend", "api server shutdown failed", {
            component: "api",
            error: errorMessage(error),
            service: "backend",
          }),
        ),
      ),
  ).pipe(
    Effect.map(({ handle }) => ({
      baseUrl: handle.baseUrl,
      close: handle.close,
      mcpPath: "/mcp",
      mcpUrl: `${handle.baseUrl}/mcp`,
      port: handle.port,
      runtimeFile: paths.runtimeDiscoveryPath,
      server: handle,
      started: true,
    })),
  );
});

export const startBackendApi = (
  options: BackendStartOptions = {},
): Effect.Effect<BackendApiHandle, BackendApiError, BackendApiStartRequirements> =>
  startBackendApiUnsafe(options).pipe(Effect.mapError(toBackendApiError));

export const BackendApiLive = Layer.effect(
  BackendApi,
  Effect.gen(function* () {
    const agentProviderDetector = yield* AgentProviderDetector;
    const appConfig = yield* AppConfig;
    const database = yield* DatabaseService;
    const gitRepository = yield* GitRepository;
    const gitStores = yield* GitStores;
    const localSettings = yield* LocalSettings;
    const localWorkspace = yield* LocalWorkspace;
    const path = yield* Path.Path;
    const repositoryBootstrap = yield* RepositoryBootstrap;
    const scope = yield* Scope.Scope;
    const worktrees = yield* Worktrees;

    return BackendApi.of({
      start: (options) =>
        startBackendApi(options).pipe(
          Effect.provideService(AgentProviderDetector, agentProviderDetector),
          Effect.provideService(AppConfig, appConfig),
          Effect.provideService(DatabaseService, database),
          Effect.provideService(GitRepository, gitRepository),
          Effect.provideService(GitStores, gitStores),
          Effect.provideService(LocalSettings, localSettings),
          Effect.provideService(LocalWorkspace, localWorkspace),
          Effect.provideService(Path.Path, path),
          Effect.provideService(RepositoryBootstrap, repositoryBootstrap),
          Effect.provideService(Scope.Scope, scope),
          Effect.provideService(Worktrees, worktrees),
        ),
    });
  }),
);
