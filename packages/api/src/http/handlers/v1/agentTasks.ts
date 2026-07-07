import { AgentTaskFailure, type AgentTaskStatus } from "@cycle/agents";
import { AgentTaskUsecases, type AgentTaskUsecasesShape } from "@cycle/usecases";
import { Effect, Result } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";
import { CycleRequestContext } from "../../middleware/CycleRequestContextMiddleware.ts";
import { positiveIntegerParam, urlFromRequest } from "../query.ts";
import { collectionResponse, errorResponse, resourceResponse } from "../responses.ts";
import type { V1Request } from "./types.ts";

type AgentTaskUsecaseRequirements = Effect.Services<
  ReturnType<AgentTaskUsecasesShape["createTicketTask"]>
>;

type AgentTaskOperation<A> = (
  usecases: AgentTaskUsecasesShape,
) => Effect.Effect<A, AgentTaskFailure, AgentTaskUsecaseRequirements>;

export const createAgentTask = ({ payload, request }: V1Request<"createAgentTask">) =>
  taskResponse(request, 202, (usecases) => usecases.createGenericTask(payload));

export const createIssueAgentTask = ({
  params,
  payload,
  request,
}: V1Request<"createIssueAgentTask">) =>
  taskResponse(request, 202, (usecases) =>
    usecases.createTicketTask(params.repositoryId, params.issueId, payload),
  );

export const listAgentTasks = ({ query, request }: V1Request<"listAgentTasks">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const url = urlFromRequest(request);
    const limit = query["page[limit]"] ?? 100;
    const page = yield* runTaskUsecase(requestId, (usecases) =>
      usecases.listTasks({
        after: positiveIntegerParam(query["page[cursor]"] ?? url.searchParams.get("after")),
        limit,
        originKind: query["filter[originKind]"] ?? url.searchParams.get("originKind") ?? undefined,
        repositoryId:
          query["filter[repositoryId]"] ?? url.searchParams.get("repositoryId") ?? undefined,
        status: agentTaskStatusParam(query["filter[status]"] ?? url.searchParams.get("status")),
        ticketId: query["filter[ticketId]"] ?? url.searchParams.get("ticketId") ?? undefined,
      }),
    );
    if (HttpServerResponse.isHttpServerResponse(page)) return page;

    return collectionResponse(requestId, url, page.entries, limit, page.nextCursor ?? null);
  });

export const getAgentTask = ({ params, request }: V1Request<"getAgentTask">) =>
  taskResponse(request, 200, (usecases) => usecases.getTask(params.taskId));

export const listAgentTaskEvents = ({ params, query, request }: V1Request<"listAgentTaskEvents">) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const url = urlFromRequest(request);
    const limit = query["page[limit]"] ?? 100;
    const events = yield* runTaskUsecase(requestId, (usecases) =>
      usecases.listEvents({
        afterSequence: positiveIntegerParam(
          query["page[cursor]"] ?? url.searchParams.get("afterSequence"),
        ),
        limit,
        taskId: params.taskId,
      }),
    );
    if (HttpServerResponse.isHttpServerResponse(events)) return events;

    return collectionResponse(requestId, url, events, limit, null);
  });

export const appendAgentTaskInput = ({
  params,
  payload,
  request,
}: V1Request<"appendAgentTaskInput">) =>
  taskResponse(request, 200, (usecases) => usecases.appendTaskInput(params.taskId, payload));

export const cancelAgentTask = ({ params, payload, request }: V1Request<"cancelAgentTask">) =>
  taskResponse(request, 200, (usecases) => usecases.cancelTask(params.taskId, payload));

export const retryAgentTask = ({ params, payload, request }: V1Request<"retryAgentTask">) =>
  taskResponse(request, 200, (usecases) => usecases.retryTask(params.taskId, payload));

const taskResponse = (
  request: HttpServerRequest.HttpServerRequest,
  status: number,
  operation: AgentTaskOperation<unknown>,
) =>
  Effect.gen(function* () {
    const { requestId } = yield* CycleRequestContext;
    const result = yield* runTaskUsecase(requestId, operation);
    if (HttpServerResponse.isHttpServerResponse(result)) return result;
    if (result === undefined)
      return errorResponse(requestId, 404, "NOT_FOUND", "Agent task not found.");

    return resourceResponse(requestId, status, result);
  });

const runTaskUsecase = <A>(
  requestId: string,
  operation: AgentTaskOperation<A>,
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

const agentTaskStatuses = new Set<AgentTaskStatus>([
  "cancelled",
  "cancelling",
  "completed",
  "failed",
  "queued",
  "running",
  "starting",
  "waiting_for_input",
]);

const agentTaskStatusParam = (
  value: AgentTaskStatus | string | null | undefined,
): AgentTaskStatus | undefined =>
  value !== null && value !== undefined && agentTaskStatuses.has(value as AgentTaskStatus)
    ? (value as AgentTaskStatus)
    : undefined;

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
