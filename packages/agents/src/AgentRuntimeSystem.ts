import { Effect, Layer } from "effect";
import type { CodexAgentServiceOptions } from "./providers/codex/types.ts";
import type { ClaudeCodeAgentServiceOptions } from "./providers/claude-code/service.ts";
import { makeCodexAgentService } from "./providers/codex/service.ts";
import { makeClaudeCodeAgentService } from "./providers/claude-code/service.ts";
import { makeHarnessFromAgentService } from "./providers/HarnessFromAgentService.ts";
import { AgentCommandStoreLive } from "./AgentCommandStore.ts";
import { AgentConfig } from "./AgentConfig.ts";
import { AgentDatabaseLive } from "./AgentDatabase.ts";
import { AgentEventJournalLive } from "./AgentEventJournal.ts";
import { AgentExecutionStoreLive } from "./AgentExecutionStore.ts";
import { AgentHarnessCatalog, AgentHarnessCatalogLive } from "./AgentHarnessCatalog.ts";
import { AgentQueueStoreLive } from "./AgentQueueStore.ts";
import { AgentReadStoreLive } from "./AgentReadStore.ts";
import { AgentRetentionBackgroundLive, AgentRetentionLive } from "./AgentRetention.ts";
import { AgentRuntimeService, AgentRuntimeServiceLive } from "./AgentRuntimeService.ts";
import { AgentSchedulerLive } from "./AgentScheduler.ts";
import { AgentSupervisorLive } from "./AgentSupervisor.ts";
import { AgentThreadStoreLive } from "./AgentThreadStore.ts";
import { AgentWorkflowRegistryLive, type AgentWorkflowDefinition } from "./AgentWorkflow.ts";
import { AgentEventHubLive } from "./internal/AgentEventHub.ts";

export type AgentRuntimeSystemOptions = {
  readonly claude?: ClaudeCodeAgentServiceOptions;
  readonly codex?: CodexAgentServiceOptions;
  readonly databasePath: string;
  readonly workflows?: ReadonlyArray<AgentWorkflowDefinition>;
};

const capabilities = {
  approvalRequests: true,
  artifactEvents: true,
  commandEvents: true,
  fileChangeEvents: true,
  historyReplay: true,
  httpMcp: true,
  interruption: true,
  liveReattachment: true,
  modelListing: true,
  nativeSessions: true,
  providerCodeTools: true,
  readOnlySandbox: true,
  reasoningSummaryEvents: true,
  stdioMcp: true,
  steering: false,
  streaming: true,
  structuredOutput: true,
  usageReporting: true,
  userInputRequests: true,
  workspaceWriteSandbox: true,
} as const;

const AgentHarnessCatalogDefault = (options: AgentRuntimeSystemOptions) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const codex = makeCodexAgentService(options.codex);
      const claude = makeClaudeCodeAgentService(options.claude);
      yield* Effect.addFinalizer(() =>
        Effect.all(
          [
            Effect.tryPromise({ try: () => codex.close(), catch: () => undefined }),
            Effect.tryPromise({ try: () => claude.close(), catch: () => undefined }),
          ],
          { discard: true },
        ).pipe(Effect.catch(() => Effect.void)),
      );
      return AgentHarnessCatalogLive([
        makeHarnessFromAgentService({
          capabilities: { ...capabilities, stdioMcp: false },
          harnessId: "codex",
          providerId: "codex",
          service: codex,
        }),
        makeHarnessFromAgentService({
          capabilities: { ...capabilities, historyReplay: false, liveReattachment: false },
          harnessId: "claude-code",
          providerId: "claude-code",
          service: claude,
        }),
      ]);
    }),
  );

export const AgentRuntimeSystemLive = (
  options: AgentRuntimeSystemOptions,
): Layer.Layer<AgentRuntimeService | AgentHarnessCatalog, unknown> => {
  const config = AgentConfig.layer(options.databasePath);
  const foundation = Layer.mergeAll(
    config,
    AgentDatabaseLive.pipe(Layer.provide(config)),
    AgentEventHubLive,
  );
  const stores = Layer.mergeAll(
    AgentCommandStoreLive,
    AgentEventJournalLive,
    AgentExecutionStoreLive,
    AgentQueueStoreLive,
    AgentReadStoreLive,
    AgentRetentionLive,
    AgentThreadStoreLive,
  ).pipe(Layer.provideMerge(foundation));
  const withHarnesses = Layer.mergeAll(
    stores,
    AgentHarnessCatalogDefault(options),
    AgentWorkflowRegistryLive(options.workflows),
  );
  const withSupervisor = AgentSupervisorLive.pipe(Layer.provideMerge(withHarnesses));
  const withScheduler = AgentSchedulerLive.pipe(Layer.provideMerge(withSupervisor));
  const withMaintenance = AgentRetentionBackgroundLive.pipe(Layer.provideMerge(withScheduler));
  return AgentRuntimeServiceLive.pipe(Layer.provideMerge(withMaintenance));
};
