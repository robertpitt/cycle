import {
  startCycleApiServer,
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
import { AgentRuntimeService } from "@cycle/agents/runtime";
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
      default:
        return task.status;
    }
  })();
  return {
    agentId: task.agentId,
    attempt: task.currentAttempt,
    authority: { mode: "workspace-write" as const },
    completedAt: task.completedAt === undefined ? undefined : DateTime.formatIso(task.completedAt),
    createdAt: DateTime.formatIso(task.createdAt),
    idempotencyKey: task.idempotencyKey,
    lastError: task.terminal?.status === "failed" ? task.terminal.error : undefined,
    maxAttempts: task.maxAttempts,
    metadata: task.metadata,
    model: task.model,
    origin: { kind: "ticket", repositoryId: input.repositoryId, ticketId: input.ticketId },
    providerId: task.providerId,
    request: {
      authority: { mode: "workspace-write" as const },
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
          mcp: () =>
            Deferred.await(cycleMcpUrl).pipe(
              Effect.map((url) => ({
                headers: { authorization: `Bearer ${staticToken}` },
                mode: "http" as const,
                url,
              })),
            ),
          workflows: [
            {
              id: "ticket-implementation",
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
                  const handover = yield* worktrees.handover(
                    { repositoryId, repositoryPath: repository.path },
                    {
                      actor: "cycle-agent-runtime",
                      handoverId: `worktree_handover_${task.taskId}`,
                      message: `${ticketId}: ${ticket.title}`,
                      pushPolicy: "required",
                      summary,
                      targetStatus: "needs-review",
                      worktreeId,
                    },
                  );
                  const handoverId =
                    typeof handover === "object" && handover !== null && "handoverId" in handover
                      ? String(handover.handoverId)
                      : `worktree_handover_${task.taskId}`;
                  const commentBody = [
                    "Agent implementation completed and the managed branch was pushed.",
                    "",
                    summary,
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

        const providerId = typeof input.providerId === "string" ? input.providerId : "codex";
        const agentId = typeof input.agentId === "string" ? input.agentId : providerId;
        const model = typeof input.model === "string" ? input.model : undefined;
        const idempotencyKey =
          typeof input.idempotencyKey === "string"
            ? input.idempotencyKey
            : `ticket:${repositoryId}:${ticketId}:assignment:${agentId}`;
        const requestedInput = input.input;
        const prompt =
          typeof requestedInput === "string"
            ? requestedInput
            : `Implement ticket ${ticketId}: ${ticket.title}\n\n${ticket.body}`;
        const existing = yield* agentRuntime.listTasks({ limit: 10_000 }).pipe(
          Stream.filter((task) => task.idempotencyKey === idempotencyKey),
          Stream.runHead,
        );
        if (Option.isSome(existing)) {
          const existingSnapshot = yield* agentRuntime.getTask(existing.value.taskId);
          if (Option.isSome(existingSnapshot)) {
            return agentTaskResourceProjection(existingSnapshot.value, {
              prompt,
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
            jobId: jobId as never,
            mode: "implementation",
            repositoryId: repositoryId as never,
            repositoryPath: repository.path,
            ticketId: ticketId as never,
            ticketSlugSource: ticket.title,
            ticketType: ticket.type,
          })
          .pipe(Effect.mapError(toBackendApiError));

        yield* database
          .transitionTicket(
            repositoryId,
            ticketId,
            {
              reason: "Explicitly assigned to the Cycle agent runtime.",
              status: "in-progress",
            },
            { message: `Assign ${ticketId} to agent` },
          )
          .pipe(Effect.mapError(toBackendApiError));

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
                  "ticket.transition.needs-review",
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
              providerId,
              repositoryId,
              ticketId,
              title: `${ticketId}: ${ticket.title}`,
              workflowId: "ticket-implementation",
              ...(model === undefined ? {} : { model }),
            }),
          )
          .pipe(Effect.mapError(toBackendApiError));
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
                repositoryId,
                ticketId,
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
          .pipe(Effect.mapError(toBackendApiError));

        return agentTaskResourceProjection(taskSnapshot, { prompt, repositoryId, ticketId });
      }),
    );

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
            return runPromise(bootstrap.notifyRepositoryChanged(repositoryId)) as Promise<void>;
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
