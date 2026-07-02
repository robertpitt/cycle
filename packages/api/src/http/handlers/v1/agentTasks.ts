import { AgentTaskFailure } from "@cycle/agents/task";
import { AgentTaskUsecases, type AgentTaskUsecasesShape } from "@cycle/usecases";
import { Effect, Result } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";
import {
  collectionResponse,
  errorResponse,
  pageLimitFrom,
  requestIdFromHeaders,
  resourceResponse,
  urlFromRequest,
} from "../shared.ts";

export const withAgentTaskHandlers = (handlers: any) =>
  handlers
    .handle("createAgentTask", ({ payload, request }: any) =>
      taskResponse(request, 202, (usecases) => usecases.createGenericTask(payload)),
    )
    .handle("createIssueAgentTask", ({ params, payload, request }: any) =>
      taskResponse(request, 202, (usecases) =>
        usecases.createTicketTask(params.repositoryId, params.issueId, payload),
      ),
    )
    .handle("listAgentTasks", ({ query, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const page = yield* runTaskUsecase(requestId, (usecases) =>
          usecases.listTasks({
            after: query.after,
            limit: query["page[limit]"] ?? 100,
            originKind: query.originKind ?? query["filter[originKind]"],
            repositoryId: query.repositoryId ?? query["filter[repositoryId]"],
            status: query.status ?? query["filter[status]"],
            ticketId: query.ticketId ?? query["filter[ticketId]"],
          }),
        );
        if (HttpServerResponse.isHttpServerResponse(page)) return page;

        return collectionResponse(
          requestId,
          url,
          page.entries,
          pageLimitFrom(url.searchParams),
          page.nextCursor ?? null,
        );
      }),
    )
    .handle("getAgentTask", ({ params, request }: any) =>
      taskResponse(request, 200, (usecases) => usecases.getTask(params.taskId)),
    )
    .handle("listAgentTaskEvents", ({ params, query, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const url = urlFromRequest(request);
        const events = yield* runTaskUsecase(requestId, (usecases) =>
          usecases.listEvents({
            afterSequence: query.afterSequence,
            limit: query["page[limit]"] ?? 100,
            taskId: params.taskId,
          }),
        );
        if (HttpServerResponse.isHttpServerResponse(events)) return events;

        return collectionResponse(requestId, url, events, pageLimitFrom(url.searchParams), null);
      }),
    )
    .handle("appendAgentTaskInput", ({ params, payload, request }: any) =>
      taskResponse(request, 200, (usecases) => usecases.appendTaskInput(params.taskId, payload)),
    )
    .handle("cancelAgentTask", ({ params, payload, request }: any) =>
      taskResponse(request, 200, (usecases) => usecases.cancelTask(params.taskId, payload)),
    )
    .handle("retryAgentTask", ({ params, payload, request }: any) =>
      taskResponse(request, 200, (usecases) => usecases.retryTask(params.taskId, payload)),
    );

const taskResponse = (
  request: { readonly headers: any; readonly url: string },
  status: number,
  operation: (
    usecases: AgentTaskUsecasesShape,
  ) => Effect.Effect<unknown, AgentTaskFailure, any>,
) =>
  Effect.gen(function* () {
    const requestId = yield* requestIdFromHeaders(request.headers);
    const result = yield* runTaskUsecase(requestId, operation);
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    if (result === undefined) return errorResponse(requestId, 404, "NOT_FOUND", "Agent task not found.");

    return resourceResponse(requestId, status, result);
  });

const runTaskUsecase = <A>(
  requestId: string,
  operation: (
    usecases: AgentTaskUsecasesShape,
  ) => Effect.Effect<A, AgentTaskFailure, any>,
): Effect.Effect<A | HttpServerResponse.HttpServerResponse, never, CycleApiRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const result = yield* Effect.result(
      Effect.gen(function* () {
        const usecases = yield* AgentTaskUsecases;
        return yield* operation(usecases);
      }).pipe(Effect.provide(runtime.useCaseLayer)) as Effect.Effect<A, AgentTaskFailure>,
    );

    if (Result.isFailure(result)) {
      return failureResponse(requestId, result.failure);
    }

    return result.success;
  });

const failureResponse = (
  requestId: string,
  failure: AgentTaskFailure,
): HttpServerResponse.HttpServerResponse => {
  switch (failure.code) {
    case "invalid_request":
      return errorResponse(requestId, 400, "INVALID_AGENT_TASK_REQUEST", failure.message);
    case "not_found":
      return errorResponse(requestId, 404, "NOT_FOUND", failure.message);
    case "conflict":
      return errorResponse(requestId, 409, "AGENT_TASK_CONFLICT", failure.message);
    case "unsupported_operation":
      return errorResponse(requestId, 422, "AGENT_TASK_UNSUPPORTED", failure.message);
    case "storage_failed":
      return errorResponse(requestId, 503, "AGENT_TASK_STORAGE_FAILED", failure.message, true);
    default:
      return errorResponse(requestId, 500, "AGENT_TASK_FAILED", failure.message);
  }
};
