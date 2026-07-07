import { AgentTaskFailure, type AgentTaskEvent } from "@cycle/agents";
import { AgentTaskUsecases, type AgentTaskUsecasesShape } from "@cycle/usecases";
import { Effect, Layer, Stream } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import type { CycleApiRuntimeShape } from "../../runtime/CycleApiRuntime.ts";

type ServerMessage = {
  readonly event?: AgentTaskEvent;
  readonly payload?: unknown;
  readonly taskId?: string;
  readonly type: string;
  readonly version: 1;
};

type AgentTaskUsecaseRequirements = Effect.Services<
  ReturnType<AgentTaskUsecasesShape["createTicketTask"]>
>;

type AgentTaskOperation<A> = (
  usecases: AgentTaskUsecasesShape,
) => Effect.Effect<A, AgentTaskFailure, AgentTaskUsecaseRequirements>;

export const makeAgentTaskWebSocketLayer = (
  runtime: CycleApiRuntimeShape,
): Layer.Layer<never, never, never> =>
  HttpRouter.add("GET", "/v1/agent-tasks/stream", (request) =>
    Effect.scoped(
      Effect.gen(function* () {
        const url = new URL(request.url, "http://127.0.0.1");
        const token = bearerTokenFromHeaders(request.headers) ?? url.searchParams.get("token");
        if (token !== runtime.staticToken) {
          return HttpServerResponse.text("Unauthorized.", { status: 401 });
        }

        const taskId = url.searchParams.get("taskId");
        if (taskId === null || taskId.length === 0) {
          return HttpServerResponse.text("Missing taskId.", { status: 400 });
        }

        const afterSequence = numberParam(url.searchParams.get("afterSequence"));
        const socket = yield* request.upgrade;
        const write = yield* socket.writer;
        const context = yield* Effect.context<never>();
        const send = (message: ServerMessage) =>
          Effect.promise(() => Effect.runPromiseWith(context)(write(JSON.stringify(message))));

        const task = yield* runTaskEffect(runtime, (usecases) => usecases.getTask(taskId));
        if (task === undefined) {
          yield* send({
            payload: {
              code: "NOT_FOUND",
              message: "Agent task not found.",
            },
            taskId,
            type: "error",
            version: 1,
          });
          return HttpServerResponse.empty();
        }

        yield* send({
          payload: {
            afterSequence: afterSequence ?? null,
            task,
          },
          taskId,
          type: "snapshot",
          version: 1,
        });

        const stream = Stream.unwrap(
          Effect.gen(function* () {
            const usecases = yield* AgentTaskUsecases;
            return usecases.subscribe({ afterSequence, taskId });
          }).pipe(Effect.provide(runtime.useCaseLayer)) as Effect.Effect<
            Stream.Stream<AgentTaskEvent, AgentTaskFailure>,
            AgentTaskFailure
          >,
        );

        yield* Stream.runForEach(stream, (event) =>
          send({
            event,
            taskId,
            type: "event",
            version: 1,
          }),
        ).pipe(
          Effect.provide(runtime.useCaseLayer),
          Effect.catch((failure) =>
            send({
              payload: {
                code: failureCode(failure),
                message: failureMessage(failure),
              },
              taskId,
              type: "error",
              version: 1,
            }),
          ),
        );

        return HttpServerResponse.empty();
      }).pipe(
        Effect.catch(() =>
          Effect.succeed(
            HttpServerResponse.text("WebSocket upgrade required.", {
              status: 400,
            }),
          ),
        ),
      ),
    ),
  ) as Layer.Layer<never, never, never>;

const runTaskEffect = <A>(
  runtime: CycleApiRuntimeShape,
  operation: AgentTaskOperation<A>,
): Effect.Effect<A, AgentTaskFailure> =>
  Effect.gen(function* () {
    const usecases = yield* AgentTaskUsecases;
    return yield* operation(usecases);
  }).pipe(Effect.provide(runtime.useCaseLayer)) as Effect.Effect<A, AgentTaskFailure>;

const bearerTokenFromHeaders = (
  headers: Readonly<Record<string, string | undefined>>,
): string | undefined => {
  const authorization = headers.authorization;
  if (authorization === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/iu.exec(authorization);
  return match?.[1];
};

const numberParam = (value: string | null): number | undefined => {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const failureCode = (failure: unknown): string =>
  failure instanceof AgentTaskFailure ? failure.code : "unknown";

const failureMessage = (failure: unknown): string =>
  failure instanceof Error ? failure.message : "Agent task stream failed.";
