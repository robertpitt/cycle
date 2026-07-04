import { Context, Effect, Layer, Option, Schema, Stream } from "effect";
import type { AgentContentStreamKind, AgentEvent, AgentProviderId } from "../types.ts";
import {
  type AgentAttemptRecord,
  type AgentPromptBundle,
  type AgentRunCancelRequest,
  type AgentRunEventsRequest,
  type AgentRunHandle,
  type AgentRunRecord,
  type AgentRunResumeRequest,
  type AgentRunSnapshot,
  type AgentRunStartRequest,
  AgentRunStartRequestSchema,
  type AgentRunSteerRequest,
  type AgentRuntimeConfig,
  type AgentRuntimeReconcileRequest,
  type AgentSessionRecord,
  defaultAgentRuntimeConfig,
} from "./contracts.ts";
import { AgentRuntimeFailure, type AgentRuntimeError } from "../errors/index.ts";
import type { AgentDurabilityShape } from "./durability.ts";
import { AgentDurability } from "./durability.ts";
import {
  AgentRuntimeApprovalRequested,
  AgentRuntimeApprovalResolved,
  type AgentRuntimeEvent,
  AgentRuntimeMessageDelta,
  AgentRuntimeMessageFinal,
  AgentRuntimeReasoningDelta,
  AgentRuntimeReasoningEnded,
  AgentRuntimeReasoningStarted,
  AgentRuntimeRunCancelled,
  AgentRuntimeRunCompleted,
  AgentRuntimeRunFailed,
  AgentRuntimeRunInterrupted,
  AgentRuntimeRunResumed,
  AgentRuntimeRunStarted,
  AgentRuntimeScriptDelta,
  AgentRuntimeScriptEnded,
  AgentRuntimeScriptOutput,
  AgentRuntimeScriptStarted,
  AgentRuntimeSteeringAccepted,
  AgentRuntimeSteeringRejected,
  AgentRuntimeToolCompleted,
  AgentRuntimeToolFailed,
  AgentRuntimeToolStarted,
  AgentRuntimeUsageReported,
  AgentRuntimeUserInputRequested,
  AgentRuntimeUserInputResolved,
  AgentRuntimeWarningReported,
} from "./events.ts";
import type { AgentHarnessAdapter } from "./harness.ts";
import { AgentHarnessRegistry, type AgentHarnessRegistryShape } from "./harness.ts";
import {
  AgentAuthorityPolicy,
  AgentMcpConnector,
  type AgentAuthorityProfile,
  type AgentMcpConnection,
  type AgentMcpConnectorShape,
  type AgentAuthorityPolicyShape,
} from "./policy.ts";
import { PromptAssembler, type PromptAssemblerShape } from "./prompt.ts";

export type AgentRuntimeShape = {
  readonly cancel: (
    request: AgentRunCancelRequest,
  ) => Effect.Effect<AgentRunSnapshot, AgentRuntimeError>;
  readonly events: (
    request: AgentRunEventsRequest,
  ) => Stream.Stream<AgentRuntimeEvent, AgentRuntimeError>;
  readonly inspect: (
    runId: string,
  ) => Effect.Effect<Option.Option<AgentRunSnapshot>, AgentRuntimeError>;
  readonly reconcile: (
    request?: AgentRuntimeReconcileRequest,
  ) => Effect.Effect<readonly AgentRunSnapshot[], AgentRuntimeError>;
  readonly resume: (
    request: AgentRunResumeRequest,
  ) => Effect.Effect<AgentRunHandle, AgentRuntimeError>;
  readonly start: (
    request: AgentRunStartRequest,
  ) => Effect.Effect<AgentRunHandle, AgentRuntimeError>;
  readonly steer: (
    request: AgentRunSteerRequest,
  ) => Effect.Effect<AgentRunSnapshot, AgentRuntimeError>;
};

export class AgentRuntime extends Context.Service<AgentRuntime, AgentRuntimeShape>()(
  "@cycle/agents/AgentRuntime",
) {}

export type AgentRuntimeOptions = {
  readonly authorityPolicy: AgentAuthorityPolicyShape;
  readonly config?: Partial<AgentRuntimeConfig>;
  readonly durability: AgentDurabilityShape;
  readonly harnessRegistry: AgentHarnessRegistryShape;
  readonly makeId?: (prefix: string) => string;
  readonly mcpConnector: AgentMcpConnectorShape;
  readonly now?: () => Date;
  readonly promptAssembler: PromptAssemblerShape;
};

type ActiveRun = {
  readonly attemptId: string;
  readonly controller: AbortController;
  readonly harness: AgentHarnessAdapter;
  readonly runId: string;
  readonly sessionId: string;
};

type ProviderMappingState = {
  assistantText: string;
  reasoningOpen: boolean;
  sawAssistantContentDelta: boolean;
  terminal: boolean;
  readonly openScriptIds: Set<string>;
};

export const makeAgentRuntime = (options: AgentRuntimeOptions): AgentRuntimeShape => {
  const durability = options.durability;
  const now = options.now ?? (() => new Date());
  const makeId = options.makeId ?? defaultId;
  const config: AgentRuntimeConfig = {
    ...defaultAgentRuntimeConfig,
    ...options.config,
  };
  const activeRuns = new Map<string, ActiveRun>();

  const snapshot = (
    runId: string,
  ): Effect.Effect<Option.Option<AgentRunSnapshot>, AgentRuntimeError> =>
    Effect.gen(function* () {
      const run = yield* durability.getRun(runId);
      if (run === undefined) return Option.none();
      const session = yield* durability.getSession(run.sessionId);
      if (session === undefined) return Option.none();
      const attempts = yield* durability.listAttemptsByRun(runId);
      const events = yield* durability.listEvents(runId);
      const activeAttempt = attempts.find(
        (attempt) =>
          attempt.status === "running" ||
          attempt.status === "starting" ||
          attempt.status === "waiting",
      );
      return Option.some({
        ...(activeAttempt === undefined ? {} : { activeAttempt }),
        events,
        run,
        session,
      });
    });

  const replayEvents = (
    request: AgentRunEventsRequest,
  ): Stream.Stream<AgentRuntimeEvent, AgentRuntimeError> =>
    Stream.unwrap(
      durability
        .listEvents(request.runId, request.afterSequence)
        .pipe(Effect.map((events) => Stream.fromIterable(events))),
    );

  const handleFor = (input: {
    readonly attempt?: AgentAttemptRecord;
    readonly authorityProfile?: AgentAuthorityProfile;
    readonly execute?: boolean;
    readonly mcp?: AgentMcpConnection;
    readonly run: AgentRunRecord;
    readonly session: AgentSessionRecord;
    readonly signal?: AbortSignal;
  }): Effect.Effect<AgentRunHandle, AgentRuntimeError> =>
    Effect.gen(function* () {
      const currentSnapshot = yield* snapshot(input.run.runId).pipe(
        Effect.flatMap((value) =>
          Option.match(value, {
            onNone: () =>
              Effect.fail(
                new AgentRuntimeFailure({
                  code: "storage_error",
                  message: `Agent run '${input.run.runId}' was not readable after creation.`,
                  retryable: false,
                }),
              ),
            onSome: Effect.succeed,
          }),
        ),
      );
      const execute =
        input.execute === true && input.attempt !== undefined
          ? executeAttempt({
              attempt: input.attempt,
              authorityProfile: input.authorityProfile,
              mcp: input.mcp,
              run: input.run,
              session: input.session,
              signal: input.signal,
            })
          : Stream.fromIterable<AgentRuntimeEvent>([]);

      return {
        attemptId: input.attempt?.attemptId ?? input.run.attemptId ?? "",
        events: replayEvents({ runId: input.run.runId }).pipe(Stream.concat(execute)),
        runId: input.run.runId,
        sessionId: input.session.sessionId,
        snapshot: currentSnapshot,
      };
    });

  const executeAttempt = (input: {
    readonly attempt: AgentAttemptRecord;
    readonly authorityProfile?: AgentAuthorityProfile;
    readonly mcp?: AgentMcpConnection;
    readonly run: AgentRunRecord;
    readonly session: AgentSessionRecord;
    readonly signal?: AbortSignal;
  }): Stream.Stream<AgentRuntimeEvent, AgentRuntimeError> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const currentAttempt = yield* durability.getAttempt(input.attempt.attemptId);
        if (currentAttempt?.status !== "starting") {
          return Stream.fromIterable<AgentRuntimeEvent>([]);
        }

        const harness = yield* options.harnessRegistry.get(input.run.harnessId);
        const authorityProfile =
          input.authorityProfile ?? (yield* options.authorityPolicy.resolve(input.run.authority));
        const mcp =
          input.mcp ??
          (yield* options.mcpConnector.connect({
            authorityProfile,
            mcp: undefined,
            run: input.run,
          }));
        const controller = new AbortController();
        const cleanupAbort = bridgeAbort(input.signal, controller);
        activeRuns.set(input.run.runId, {
          attemptId: input.attempt.attemptId,
          controller,
          harness,
          runId: input.run.runId,
          sessionId: input.session.sessionId,
        });

        const startedAt = now().toISOString();
        yield* durability.updateRun(input.run.runId, {
          startedAt: input.run.startedAt ?? startedAt,
          status: "running",
          updatedAt: startedAt,
        });
        const runningAttempt = yield* durability.updateAttempt(input.attempt.attemptId, {
          heartbeatAt: startedAt,
          status: "running",
        });
        if (runningAttempt === undefined) {
          return Stream.fromIterable<AgentRuntimeEvent>([]);
        }

        const providerBinding = yield* harness.openSession({
          attempt: runningAttempt,
          run: input.run,
          session: input.session,
        });
        yield* durability.upsertProviderBinding(providerBinding);

        const state: ProviderMappingState = {
          assistantText: "",
          openScriptIds: new Set(),
          reasoningOpen: false,
          sawAssistantContentDelta: false,
          terminal: false,
        };

        const providerEvents = harness
          .execute({
            attempt: runningAttempt,
            authorityProfile,
            mcp,
            prompt: input.run.prompt,
            run: input.run,
            session: input.session,
            signal: controller.signal,
          })
          .pipe(
            Stream.mapEffect((event) =>
              appendMappedProviderEvent({
                attempt: runningAttempt,
                event,
                run: input.run,
                session: input.session,
                state,
              }),
            ),
            Stream.flattenIterable,
          );

        const finalEvent = Stream.unwrap(
          Effect.gen(function* () {
            if (state.terminal) return Stream.fromIterable<AgentRuntimeEvent>([]);
            const completed = yield* completeRunFromAccumulatedText({
              attempt: runningAttempt,
              run: input.run,
              session: input.session,
              state,
            });
            return Stream.fromIterable(completed);
          }),
        );

        return providerEvents.pipe(
          Stream.concat(finalEvent),
          Stream.ensuring(
            Effect.sync(() => {
              cleanupAbort();
              activeRuns.delete(input.run.runId);
            }),
          ),
        );
      }),
    );

  const appendMappedProviderEvent = (input: {
    readonly attempt: AgentAttemptRecord;
    readonly event: AgentEvent;
    readonly run: AgentRunRecord;
    readonly session: AgentSessionRecord;
    readonly state: ProviderMappingState;
  }): Effect.Effect<readonly AgentRuntimeEvent[], AgentRuntimeError> =>
    Effect.gen(function* () {
      const mapped = yield* mapProviderEvent(input);
      const appended: AgentRuntimeEvent[] = [];
      for (const event of mapped) {
        appended.push(yield* durability.appendEvent(event));
      }
      return appended;
    });

  const mapProviderEvent = (input: {
    readonly attempt: AgentAttemptRecord;
    readonly event: AgentEvent;
    readonly run: AgentRunRecord;
    readonly session: AgentSessionRecord;
    readonly state: ProviderMappingState;
  }): Effect.Effect<readonly AgentRuntimeEvent[], AgentRuntimeError> =>
    Effect.gen(function* () {
      const base = eventBase(input.run, input.session, input.attempt, now, makeId);
      switch (input.event.type) {
        case "text.delta": {
          if (input.state.sawAssistantContentDelta) return [];
          const snapshot =
            input.event.snapshot ?? `${input.state.assistantText}${input.event.delta}`;
          input.state.assistantText = snapshot;
          return [
            new AgentRuntimeMessageDelta({
              ...base,
              delta: input.event.delta,
              snapshot,
            }),
          ];
        }
        case "content.delta": {
          if (isReasoningKind(input.event.streamKind)) {
            const events: AgentRuntimeEvent[] = [];
            if (!input.state.reasoningOpen) {
              input.state.reasoningOpen = true;
              events.push(
                new AgentRuntimeReasoningStarted({
                  ...base,
                  itemId: input.event.itemId,
                }),
              );
            }
            events.push(
              new AgentRuntimeReasoningDelta({
                ...base,
                delta: input.event.delta,
                itemId: input.event.itemId,
              }),
            );
            return events;
          }

          if (input.event.streamKind === "assistant_text") {
            input.state.sawAssistantContentDelta = true;
            const snapshot =
              input.event.snapshot ?? `${input.state.assistantText}${input.event.delta}`;
            input.state.assistantText = snapshot;
            return [
              new AgentRuntimeMessageDelta({
                ...base,
                delta: input.event.delta,
                snapshot,
              }),
            ];
          }

          if (isScriptLikeKind(input.event.streamKind)) {
            const scriptId = input.event.itemId ?? "provider-output";
            const events: AgentRuntimeEvent[] = [];
            if (!input.state.openScriptIds.has(scriptId)) {
              input.state.openScriptIds.add(scriptId);
              events.push(
                new AgentRuntimeScriptStarted({
                  ...base,
                  scriptId,
                  title: input.event.streamKind,
                }),
              );
            }
            events.push(
              new AgentRuntimeScriptDelta({
                ...base,
                delta: input.event.delta,
                scriptId,
              }),
            );
            return events;
          }
          return [];
        }
        case "item.started": {
          const toolName = providerToolName(input.event.itemType);
          return toolName === undefined
            ? []
            : [
                new AgentRuntimeToolStarted({
                  ...base,
                  input: input.event.item,
                  toolCallId: input.event.itemId,
                  toolName,
                }),
              ];
        }
        case "item.completed": {
          const events: AgentRuntimeEvent[] = [];
          if (input.state.openScriptIds.has(input.event.itemId)) {
            input.state.openScriptIds.delete(input.event.itemId);
            events.push(
              new AgentRuntimeScriptEnded({
                ...base,
                scriptId: input.event.itemId,
              }),
            );
          }
          const toolName = providerToolName(input.event.itemType);
          if (toolName !== undefined) {
            events.push(
              new AgentRuntimeToolCompleted({
                ...base,
                output: input.event.item,
                toolCallId: input.event.itemId,
                toolName,
              }),
            );
          }
          return events;
        }
        case "artifact":
          if (input.event.artifact.type !== "tool") return [];
          return input.event.artifact.status === "failed"
            ? [
                new AgentRuntimeToolFailed({
                  ...base,
                  code: input.event.artifact.error?.code,
                  message: input.event.artifact.error?.message ?? "Tool failed.",
                  toolCallId:
                    input.event.artifact.metadata?.itemId?.toString() ?? input.event.artifact.name,
                  toolName: input.event.artifact.name,
                }),
              ]
            : [
                new AgentRuntimeToolCompleted({
                  ...base,
                  output: input.event.artifact.output,
                  toolCallId:
                    input.event.artifact.metadata?.itemId?.toString() ?? input.event.artifact.name,
                  toolName: input.event.artifact.name,
                }),
              ];
        case "progress":
          return [
            new AgentRuntimeScriptOutput({
              ...base,
              output: input.event.message,
            }),
          ];
        case "runtime.warning":
          return [
            new AgentRuntimeWarningReported({
              ...base,
              message: input.event.message,
              raw: input.event.raw,
            }),
          ];
        case "runtime.error":
          return [
            new AgentRuntimeWarningReported({
              ...base,
              message: input.event.error.message,
              raw: input.event.error.raw,
            }),
          ];
        case "usage":
          return [
            new AgentRuntimeUsageReported({
              ...base,
              inputTokens: input.event.usage.inputTokens,
              outputTokens: input.event.usage.outputTokens,
              reasoningTokens: input.event.usage.reasoningTokens,
              totalTokens: input.event.usage.totalTokens,
            }),
          ];
        case "approval.requested": {
          const interactionId = makeId("agent_interaction");
          yield* durability.upsertInteraction({
            attemptId: input.attempt.attemptId,
            createdAt: now().toISOString(),
            defaultDecision: input.event.request.defaultDecision,
            interactionId,
            payload: jsonObject(input.event.request),
            prompt: input.event.request.kind,
            runId: input.run.runId,
            status: "open",
            type: "approval",
          });
          return [
            new AgentRuntimeApprovalRequested({
              ...base,
              interactionId,
              payload: jsonObject(input.event.request),
            }),
          ];
        }
        case "approval.resolved":
          return [
            new AgentRuntimeApprovalResolved({
              ...base,
              decision: input.event.decision,
              interactionId: input.event.requestId,
            }),
          ];
        case "user-input.requested": {
          const interactionId = makeId("agent_interaction");
          yield* durability.upsertInteraction({
            attemptId: input.attempt.attemptId,
            createdAt: now().toISOString(),
            interactionId,
            payload: jsonObject(input.event.request),
            prompt: input.event.request.prompt,
            runId: input.run.runId,
            status: "open",
            type: "user-input",
          });
          return [
            new AgentRuntimeUserInputRequested({
              ...base,
              interactionId,
              payload: jsonObject(input.event.request),
            }),
          ];
        }
        case "user-input.resolved":
          return [
            new AgentRuntimeUserInputResolved({
              ...base,
              interactionId: input.event.requestId,
              payload: jsonObject({ answers: input.event.answers }),
            }),
          ];
        case "turn.completed": {
          input.state.terminal = true;
          const terminal = yield* completeRun({
            attempt: input.attempt,
            result: jsonObject(input.event.result.metadata ?? {}),
            run: input.run,
            session: input.session,
            state: input.state,
            summary: (input.event.result.text || input.state.assistantText).trim(),
          });
          return terminal;
        }
        case "turn.failed": {
          input.state.terminal = true;
          const terminal = yield* failRun({
            attempt: input.attempt,
            code: input.event.error.code,
            message: input.event.error.message,
            retryable: input.event.error.retryable,
            run: input.run,
            session: input.session,
            state: input.state,
          });
          return terminal;
        }
        case "turn.cancelled": {
          input.state.terminal = true;
          const terminal = yield* cancelRun({
            attempt: input.attempt,
            reason: input.event.error.message,
            run: input.run,
            session: input.session,
            state: input.state,
          });
          return terminal;
        }
        default:
          return [];
      }
    });

  const completeRunFromAccumulatedText = (input: {
    readonly attempt: AgentAttemptRecord;
    readonly run: AgentRunRecord;
    readonly session: AgentSessionRecord;
    readonly state: ProviderMappingState;
  }) =>
    completeRun({
      ...input,
      result: {},
      summary: input.state.assistantText.trim(),
    });

  const closeOpenBlocks = (
    run: AgentRunRecord,
    session: AgentSessionRecord,
    attempt: AgentAttemptRecord,
    state: ProviderMappingState,
  ): AgentRuntimeEvent[] => {
    const base = eventBase(run, session, attempt, now, makeId);
    const events: AgentRuntimeEvent[] = [];
    if (state.reasoningOpen) {
      state.reasoningOpen = false;
      events.push(new AgentRuntimeReasoningEnded(base));
    }
    for (const scriptId of state.openScriptIds) {
      events.push(new AgentRuntimeScriptEnded({ ...base, scriptId }));
    }
    state.openScriptIds.clear();
    return events;
  };

  const completeRun = (input: {
    readonly attempt: AgentAttemptRecord;
    readonly result: Record<string, unknown>;
    readonly run: AgentRunRecord;
    readonly session: AgentSessionRecord;
    readonly state: ProviderMappingState;
    readonly summary: string;
  }): Effect.Effect<readonly AgentRuntimeEvent[], AgentRuntimeError> =>
    Effect.gen(function* () {
      const completedAt = now().toISOString();
      yield* durability.updateAttempt(input.attempt.attemptId, {
        completedAt,
        status: "completed",
      });
      yield* durability.updateRun(input.run.runId, {
        completedAt,
        status: "completed",
        terminal: { status: "completed", summary: input.summary },
        updatedAt: completedAt,
      });
      yield* durability.releaseRun(input.run.runId, config.ownerId);
      const base = eventBase(input.run, input.session, input.attempt, now, makeId);
      return [
        ...closeOpenBlocks(input.run, input.session, input.attempt, input.state),
        new AgentRuntimeMessageFinal({ ...base, text: input.summary }),
        new AgentRuntimeRunCompleted({
          ...base,
          result: input.result,
          summary: input.summary,
        }),
      ];
    });

  const failRun = (input: {
    readonly attempt: AgentAttemptRecord;
    readonly code: string;
    readonly message: string;
    readonly retryable?: boolean;
    readonly run: AgentRunRecord;
    readonly session: AgentSessionRecord;
    readonly state: ProviderMappingState;
  }): Effect.Effect<readonly AgentRuntimeEvent[], AgentRuntimeError> =>
    Effect.gen(function* () {
      const completedAt = now().toISOString();
      yield* durability.updateAttempt(input.attempt.attemptId, {
        completedAt,
        lastError: input.message,
        status: "failed",
      });
      yield* durability.updateRun(input.run.runId, {
        completedAt,
        status: "failed",
        terminal: {
          code: input.code,
          message: input.message,
          retryable: input.retryable,
          status: "failed",
        },
        updatedAt: completedAt,
      });
      yield* durability.releaseRun(input.run.runId, config.ownerId);
      return [
        ...closeOpenBlocks(input.run, input.session, input.attempt, input.state),
        new AgentRuntimeRunFailed({
          ...eventBase(input.run, input.session, input.attempt, now, makeId),
          code: input.code,
          message: input.message,
          retryable: input.retryable,
        }),
      ];
    });

  const cancelRun = (input: {
    readonly attempt: AgentAttemptRecord;
    readonly reason: string;
    readonly run: AgentRunRecord;
    readonly session: AgentSessionRecord;
    readonly state: ProviderMappingState;
  }): Effect.Effect<readonly AgentRuntimeEvent[], AgentRuntimeError> =>
    Effect.gen(function* () {
      const completedAt = now().toISOString();
      yield* durability.updateAttempt(input.attempt.attemptId, {
        completedAt,
        lastError: input.reason,
        status: "cancelled",
      });
      yield* durability.updateRun(input.run.runId, {
        completedAt,
        status: "cancelled",
        terminal: { reason: input.reason, status: "cancelled" },
        updatedAt: completedAt,
      });
      yield* durability.releaseRun(input.run.runId, config.ownerId);
      return [
        ...closeOpenBlocks(input.run, input.session, input.attempt, input.state),
        new AgentRuntimeRunCancelled({
          ...eventBase(input.run, input.session, input.attempt, now, makeId),
          reason: input.reason,
        }),
      ];
    });

  return {
    cancel: (request) =>
      Effect.gen(function* () {
        const run = yield* requiredRun(durability, request.runId);
        const session = yield* requiredSession(durability, run.sessionId);
        if (isTerminal(run.status)) return yield* requiredSnapshot(snapshot, run.runId);
        const active = activeRuns.get(run.runId);
        const attempts = yield* durability.listAttemptsByRun(run.runId);
        const attempt =
          attempts.find((candidate) => candidate.attemptId === active?.attemptId) ??
          attempts.at(-1);
        const updatedAt = now().toISOString();
        yield* durability.updateRun(run.runId, { status: "cancelling", updatedAt });
        if (active !== undefined && attempt !== undefined) {
          active.controller.abort(new Error(request.reason ?? "Agent run cancellation requested."));
          yield* active.harness.cancel({
            attempt,
            reason: request.reason,
            run,
            session,
          });
        }
        if (attempt !== undefined) {
          const event = yield* durability.appendEvent(
            new AgentRuntimeRunCancelled({
              ...eventBase(run, session, attempt, now, makeId),
              reason: request.reason ?? "Agent run cancellation requested.",
            }),
          );
          void event;
          yield* durability.updateAttempt(attempt.attemptId, {
            completedAt: updatedAt,
            lastError: request.reason,
            status: "cancelled",
          });
        }
        yield* durability.updateRun(run.runId, {
          completedAt: updatedAt,
          status: "cancelled",
          terminal: {
            reason: request.reason ?? "Agent run cancellation requested.",
            status: "cancelled",
          },
          updatedAt,
        });
        yield* durability.releaseRun(run.runId, config.ownerId);
        return yield* requiredSnapshot(snapshot, run.runId);
      }),
    events: replayEvents,
    inspect: snapshot,
    reconcile: (request = {}) =>
      Effect.gen(function* () {
        const active = yield* durability.listActiveRuns(request.ownerId);
        const reconciled: AgentRunSnapshot[] = [];
        for (const run of active) {
          const attempts = yield* durability.listAttemptsByRun(run.runId);
          const attempt = attempts.at(-1);
          if (attempt === undefined || activeRuns.has(run.runId)) continue;
          const completedAt = now().toISOString();
          yield* durability.updateAttempt(attempt.attemptId, {
            completedAt,
            lastError: "Run was interrupted before the runtime reconciled it.",
            status: "interrupted",
          });
          yield* durability.updateRun(run.runId, {
            completedAt,
            status: "interrupted",
            terminal: {
              reason: "Run was interrupted before the runtime reconciled it.",
              status: "interrupted",
            },
            updatedAt: completedAt,
          });
          yield* durability.appendEvent(
            new AgentRuntimeRunInterrupted({
              ...eventBase(
                run,
                yield* requiredSession(durability, run.sessionId),
                attempt,
                now,
                makeId,
              ),
              reason: "Run was interrupted before the runtime reconciled it.",
            }),
          );
          const next = yield* requiredSnapshot(snapshot, run.runId);
          reconciled.push(next);
        }
        return reconciled;
      }),
    resume: (request) =>
      Effect.gen(function* () {
        const run = yield* requiredRun(durability, request.runId);
        const session = yield* requiredSession(durability, run.sessionId);
        if (run.status === "completed" || run.status === "cancelled") {
          return yield* handleFor({ run, session });
        }
        const attempt = makeAttempt({
          attemptId: makeId("agent_attempt"),
          ownerId: config.ownerId,
          run,
          session,
          startedAt: now().toISOString(),
        });
        yield* durability.createAttempt(attempt);
        yield* durability.updateRun(run.runId, {
          attemptId: attempt.attemptId,
          status: "preparing",
          updatedAt: now().toISOString(),
        });
        yield* durability.claimRun(run.runId, config.ownerId, config.leaseDurationMs);
        yield* durability.appendEvent(
          new AgentRuntimeRunResumed({
            ...eventBase(run, session, attempt, now, makeId),
            reason: request.reason ?? request.message ?? "Agent run resumed.",
          }),
        );
        return yield* handleFor({
          attempt,
          execute: true,
          run: { ...run, attemptId: attempt.attemptId, status: "preparing" },
          session,
        });
      }),
    start: (request) =>
      Effect.gen(function* () {
        const decoded = (yield* Schema.decodeUnknownEffect(AgentRunStartRequestSchema)(
          request,
        ).pipe(
          Effect.mapError(
            (cause) =>
              new AgentRuntimeFailure({
                cause,
                code: "invalid_request",
                message: "Invalid agent run start request.",
                retryable: false,
              }),
          ),
        )) as AgentRunStartRequest;
        const idempotencyKey = decoded.idempotencyKey ?? deriveIdempotencyKey(decoded);
        const existing = yield* durability.findRunByIdempotencyKey(idempotencyKey);
        if (existing !== undefined) {
          const existingSession = yield* requiredSession(durability, existing.sessionId);
          return yield* handleFor({ run: existing, session: existingSession });
        }

        const harnessId = decoded.harness?.harnessId ?? config.defaultHarnessId;
        const providerId = (decoded.harness?.providerId ??
          config.defaultProviderId) as AgentProviderId;
        const harness = yield* options.harnessRegistry.get(harnessId);
        const capabilities = yield* harness.capabilities;
        const authorityProfile = yield* options.authorityPolicy.resolve(decoded.authority);
        yield* validateHarnessCapabilities(capabilities, authorityProfile);

        const session = yield* resolveSession({
          harnessId,
          model: decoded.harness?.model ?? config.defaultModel,
          providerId,
          request: decoded,
        });
        const runId = makeId("agent_run");
        const attemptId = makeId("agent_attempt");
        const startedAt = now().toISOString();
        const placeholderPrompt = emptyPromptBundle({
          createdAt: startedAt,
          promptId: makeId("agent_prompt"),
          templateId: decoded.prompt.templateId,
        });
        const baseRun: AgentRunRecord = {
          agentId: decoded.agent.agentId,
          attemptId,
          authority: decoded.authority,
          createdAt: startedAt,
          harnessId,
          idempotencyKey,
          metadata: jsonObject(decoded.metadata ?? {}),
          model: decoded.harness?.model ?? config.defaultModel,
          prompt: placeholderPrompt,
          providerId,
          runId,
          sessionId: session.sessionId,
          source: decoded.source,
          status: "created",
          updatedAt: startedAt,
        };
        const mcp = yield* options.mcpConnector.connect({
          authorityProfile,
          mcp: decoded.mcp,
          run: baseRun,
        });
        const prompt = yield* options.promptAssembler.assemble({
          authorityProfile,
          mcp,
          request: decoded,
          run: baseRun,
        });
        const run: AgentRunRecord = {
          ...baseRun,
          prompt,
        };
        const attempt = makeAttempt({
          attemptId,
          ownerId: config.ownerId,
          run,
          session,
          startedAt,
        });
        yield* durability.createRun(run);
        yield* durability.createAttempt(attempt);
        const lease = yield* durability.claimRun(run.runId, config.ownerId, config.leaseDurationMs);
        if (lease === undefined) {
          return yield* handleFor({ attempt, run, session });
        }
        yield* durability.appendEvent(
          new AgentRuntimeRunStarted({
            ...eventBase(run, session, attempt, now, makeId),
            agentId: run.agentId,
            harnessId: run.harnessId,
            model: run.model,
            promptTemplateId: prompt.templateId,
            providerId: run.providerId,
          }),
        );
        return yield* handleFor({
          attempt,
          authorityProfile,
          execute: true,
          mcp,
          run,
          session,
          signal: decoded.signal,
        });
      }),
    steer: (request) =>
      Effect.gen(function* () {
        const run = yield* requiredRun(durability, request.runId);
        const session = yield* requiredSession(durability, run.sessionId);
        const active = activeRuns.get(run.runId);
        const attempts = yield* durability.listAttemptsByRun(run.runId);
        const attempt =
          attempts.find((candidate) => candidate.attemptId === active?.attemptId) ??
          attempts.at(-1);
        const interactionId = makeId("agent_interaction");
        yield* durability.upsertInteraction({
          attemptId: attempt?.attemptId,
          createdAt: now().toISOString(),
          interactionId,
          payload: jsonObject({ message: request.message }),
          prompt: request.message,
          runId: run.runId,
          status: active === undefined ? "rejected" : "open",
          type: "steering",
        });

        const base =
          attempt === undefined ? undefined : eventBase(run, session, attempt, now, makeId);
        if (active === undefined || attempt === undefined || base === undefined) {
          return yield* requiredSnapshot(snapshot, run.runId);
        }

        const result = yield* active.harness.steer({
          attempt,
          message: request.message,
          run,
          session,
        });
        yield* durability.appendEvent(
          result.accepted
            ? new AgentRuntimeSteeringAccepted({
                ...base,
                interactionId,
                message: request.message,
              })
            : new AgentRuntimeSteeringRejected({
                ...base,
                interactionId,
                message: request.message,
                reason: result.reason ?? "Harness does not support steering.",
              }),
        );
        yield* durability.upsertInteraction({
          attemptId: attempt.attemptId,
          createdAt: now().toISOString(),
          interactionId,
          payload: jsonObject({ message: request.message }),
          prompt: request.message,
          resolvedAt: now().toISOString(),
          runId: run.runId,
          status: result.accepted ? "resolved" : "rejected",
          type: "steering",
        });
        return yield* requiredSnapshot(snapshot, run.runId);
      }),
  };

  function resolveSession(input: {
    readonly harnessId: string;
    readonly model?: string;
    readonly providerId: AgentProviderId;
    readonly request: AgentRunStartRequest;
  }): Effect.Effect<AgentSessionRecord, AgentRuntimeError> {
    return Effect.gen(function* () {
      const selected = input.request.session ?? { type: "create" as const };
      if (selected.type === "reuse") {
        const existing = yield* durability.getSession(selected.sessionId);
        if (existing !== undefined) return existing;
        return yield* createSession({
          conversationKey: selected.sessionId,
          harnessId: input.harnessId,
          model: input.model,
          providerId: input.providerId,
          request: input.request,
          sessionId: selected.sessionId,
        });
      }
      if (selected.type === "by-conversation-key") {
        const existing = yield* durability.findSessionByConversationKey(selected.conversationKey);
        if (existing !== undefined) return existing;
        return yield* createSession({
          conversationKey: selected.conversationKey,
          harnessId: input.harnessId,
          model: input.model,
          providerId: input.providerId,
          request: input.request,
          title: selected.title,
        });
      }
      return yield* createSession({
        conversationKey: selected.conversationKey,
        harnessId: input.harnessId,
        model: input.model,
        providerId: input.providerId,
        request: input.request,
        title: selected.title,
      });
    });
  }

  function createSession(input: {
    readonly conversationKey?: string;
    readonly harnessId: string;
    readonly model?: string;
    readonly providerId: AgentProviderId;
    readonly request: AgentRunStartRequest;
    readonly sessionId?: string;
    readonly title?: string;
  }): Effect.Effect<AgentSessionRecord, AgentRuntimeError> {
    const timestamp = now().toISOString();
    const session: AgentSessionRecord = {
      ...(input.conversationKey === undefined ? {} : { conversationKey: input.conversationKey }),
      createdAt: timestamp,
      harnessId: input.harnessId,
      metadata: {},
      ...(input.model === undefined ? {} : { model: input.model }),
      native: {},
      providerId: input.providerId,
      repositoryId: input.request.authority.repositoryId,
      sessionId: input.sessionId ?? makeId("agent_session"),
      status: "idle",
      ...(input.request.authority.ticketId === undefined
        ? {}
        : { ticketId: input.request.authority.ticketId }),
      ...(input.title === undefined ? {} : { title: input.title }),
      updatedAt: timestamp,
    };
    return durability.upsertSession(session);
  }
};

export const AgentRuntimeLive = (
  options: {
    readonly config?: Partial<AgentRuntimeConfig>;
    readonly makeId?: (prefix: string) => string;
    readonly now?: () => Date;
  } = {},
) =>
  Layer.effect(
    AgentRuntime,
    Effect.gen(function* () {
      const durability = yield* AgentDurability;
      const harnessRegistry = yield* AgentHarnessRegistry;
      const authorityPolicy = yield* AgentAuthorityPolicy;
      const mcpConnector = yield* AgentMcpConnector;
      const promptAssembler = yield* PromptAssembler;

      return AgentRuntime.of(
        makeAgentRuntime({
          authorityPolicy,
          config: options.config,
          durability,
          harnessRegistry,
          makeId: options.makeId,
          mcpConnector,
          now: options.now,
          promptAssembler,
        }),
      );
    }),
  );

const requiredRun = (
  durability: AgentDurabilityShape,
  runId: string,
): Effect.Effect<AgentRunRecord, AgentRuntimeError> =>
  durability.getRun(runId).pipe(
    Effect.flatMap((run) =>
      run === undefined
        ? Effect.fail(
            new AgentRuntimeFailure({
              code: "invalid_request",
              message: `Agent run '${runId}' was not found.`,
              retryable: false,
            }),
          )
        : Effect.succeed(run),
    ),
  );

const requiredSession = (
  durability: AgentDurabilityShape,
  sessionId: string,
): Effect.Effect<AgentSessionRecord, AgentRuntimeError> =>
  durability.getSession(sessionId).pipe(
    Effect.flatMap((session) =>
      session === undefined
        ? Effect.fail(
            new AgentRuntimeFailure({
              code: "storage_error",
              message: `Agent session '${sessionId}' was not found.`,
              retryable: false,
            }),
          )
        : Effect.succeed(session),
    ),
  );

const requiredSnapshot = (
  snapshot: (runId: string) => Effect.Effect<Option.Option<AgentRunSnapshot>, AgentRuntimeError>,
  runId: string,
): Effect.Effect<AgentRunSnapshot, AgentRuntimeError> =>
  snapshot(runId).pipe(
    Effect.flatMap((value) =>
      Option.match(value, {
        onNone: () =>
          Effect.fail(
            new AgentRuntimeFailure({
              code: "storage_error",
              message: `Agent run '${runId}' did not produce a readable snapshot.`,
              retryable: false,
            }),
          ),
        onSome: Effect.succeed,
      }),
    ),
  );

const makeAttempt = (input: {
  readonly attemptId: string;
  readonly ownerId: string;
  readonly run: AgentRunRecord;
  readonly session: AgentSessionRecord;
  readonly startedAt: string;
}): AgentAttemptRecord => ({
  attemptId: input.attemptId,
  native: {},
  ownerId: input.ownerId,
  runId: input.run.runId,
  sessionId: input.session.sessionId,
  startedAt: input.startedAt,
  status: "starting",
});

const emptyPromptBundle = (input: {
  readonly createdAt: string;
  readonly promptId: string;
  readonly templateId: string;
}): AgentPromptBundle => ({
  context: {},
  createdAt: input.createdAt,
  promptId: input.promptId,
  redactedSystemPreview: "",
  redactedUserPreview: "",
  system: "",
  systemHash: "00000000",
  templateId: input.templateId,
  templateVersion: "0.0.0",
  user: "",
  userHash: "00000000",
});

const eventBase = (
  run: AgentRunRecord,
  session: AgentSessionRecord,
  attempt: AgentAttemptRecord,
  now: () => Date,
  makeId: (prefix: string) => string,
) => ({
  attemptId: attempt.attemptId,
  authorityMode: run.authority.mode,
  commentId: run.authority.commentId,
  eventId: makeId("agent_event"),
  jobId: run.authority.jobId,
  occurredAt: now().toISOString(),
  repositoryId: run.authority.repositoryId,
  runId: run.runId,
  schemaVersion: 1 as const,
  sequence: 0,
  sessionId: session.sessionId,
  source: run.source,
  ticketId: run.authority.ticketId,
});

const deriveIdempotencyKey = (request: AgentRunStartRequest): string =>
  [
    request.source,
    request.agent.agentId,
    request.prompt.templateId,
    request.authority.repositoryId,
    request.authority.ticketId,
    request.authority.commentId,
    request.authority.jobId,
    request.authority.scheduleId,
    request.session?.type === "reuse" ? request.session.sessionId : undefined,
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(":");

const validateHarnessCapabilities = (
  capabilities: { readonly readOnlyWorkspace: boolean; readonly workspaceWrite: boolean },
  authority: AgentAuthorityProfile,
): Effect.Effect<void, AgentRuntimeError> => {
  if (authority.workspaceWrite && !capabilities.workspaceWrite) {
    return Effect.fail(
      new AgentRuntimeFailure({
        code: "harness_unsupported",
        message: "Selected harness does not support workspace-write execution.",
        retryable: false,
      }),
    );
  }
  if (authority.codebaseReadOnly && !capabilities.readOnlyWorkspace) {
    return Effect.fail(
      new AgentRuntimeFailure({
        code: "harness_unsupported",
        message: "Selected harness does not support read-only workspace execution.",
        retryable: false,
      }),
    );
  }
  return Effect.void;
};

const isTerminal = (status: AgentRunRecord["status"]): boolean =>
  status === "cancelled" ||
  status === "completed" ||
  status === "failed" ||
  status === "interrupted";

const bridgeAbort = (
  source: AbortSignal | undefined,
  controller: AbortController,
): (() => void) => {
  if (source?.aborted) controller.abort(source.reason);
  const onAbort = () => controller.abort(source?.reason);
  source?.addEventListener("abort", onAbort, { once: true });
  return () => source?.removeEventListener("abort", onAbort);
};

const isReasoningKind = (kind: AgentContentStreamKind): boolean =>
  kind === "reasoning_text" || kind === "reasoning_summary";

const isScriptLikeKind = (kind: AgentContentStreamKind): boolean =>
  kind === "command_output" || kind === "file_change_output" || kind === "tool_output";

const providerToolName = (itemType: string | undefined): string | undefined => {
  if (itemType === undefined) return undefined;
  const normalized = itemType.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
  if (
    normalized === "agent_message" ||
    normalized === "reasoning" ||
    normalized === "user_message" ||
    normalized === "plan"
  ) {
    return undefined;
  }
  return normalized;
};

const jsonObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, unknown] => isJsonValue(entry[1])),
  );
};

const isJsonValue = (value: unknown): boolean => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
};

const defaultId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
