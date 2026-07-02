import {
  AgentTaskFailure,
  AgentTaskService,
  type AgentTask,
  type AgentTaskEvent,
  type AgentTaskEventQuery,
  type AgentTaskInput,
  type AgentTaskListQuery,
  type AgentTaskPage,
  type AgentTaskRequest,
  type AgentTaskSubscriptionQuery,
  type CancelAgentTaskInput,
  type RetryAgentTaskInput,
} from "@cycle/agents/task";
import { DatabaseService, type TicketDocument } from "@cycle/database";
import { Context, Effect, Layer, Stream } from "effect";

export type CreateTicketAgentTaskInput = {
  readonly agentId?: string;
  readonly authority?: AgentTaskRequest["authority"];
  readonly idempotencyKey?: string;
  readonly input?: AgentTaskRequest["input"];
  readonly instructions?: string;
  readonly maxAttempts?: number;
  readonly metadata?: AgentTaskRequest["metadata"];
  readonly model?: string;
  readonly providerId?: string;
  readonly requestedBy?: string;
  readonly responseFormat?: AgentTaskRequest["responseFormat"];
  readonly tools?: AgentTaskRequest["tools"];
  readonly trigger?: string;
  readonly workspace?: AgentTaskRequest["workspace"];
};

export type AgentTaskUsecasesShape = {
  readonly appendTaskInput: (
    taskId: string,
    input: AgentTaskInput,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskFailure, AgentTaskService>;
  readonly cancelTask: (
    taskId: string,
    input?: CancelAgentTaskInput,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskFailure, AgentTaskService>;
  readonly createGenericTask: (
    request: AgentTaskRequest,
  ) => Effect.Effect<AgentTask, AgentTaskFailure, AgentTaskService>;
  readonly createTicketTask: (
    repositoryId: string,
    ticketId: string,
    input?: CreateTicketAgentTaskInput,
  ) => Effect.Effect<AgentTask, AgentTaskFailure, AgentTaskService | DatabaseService>;
  readonly getTask: (
    taskId: string,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskFailure, AgentTaskService>;
  readonly listEvents: (
    query: AgentTaskEventQuery,
  ) => Effect.Effect<readonly AgentTaskEvent[], AgentTaskFailure, AgentTaskService>;
  readonly listTasks: (
    query?: AgentTaskListQuery,
  ) => Effect.Effect<AgentTaskPage, AgentTaskFailure, AgentTaskService>;
  readonly retryTask: (
    taskId: string,
    input?: RetryAgentTaskInput,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskFailure, AgentTaskService>;
  readonly subscribe: (
    query: AgentTaskSubscriptionQuery,
  ) => Stream.Stream<AgentTaskEvent, AgentTaskFailure, AgentTaskService>;
};

export class AgentTaskUsecases extends Context.Service<AgentTaskUsecases, AgentTaskUsecasesShape>()(
  "@cycle/usecases/AgentTaskUsecases",
) {}

export const makeAgentTaskUsecases = (): AgentTaskUsecasesShape => ({
  appendTaskInput: (taskId, input) =>
    AgentTaskService.pipe(Effect.flatMap((service) => service.appendTaskInput(taskId, input))),
  cancelTask: (taskId, input) =>
    AgentTaskService.pipe(Effect.flatMap((service) => service.cancelTask(taskId, input))),
  createGenericTask: (request) =>
    AgentTaskService.pipe(Effect.flatMap((service) => service.createTask(request))),
  createTicketTask: (repositoryId, ticketId, input = {}) =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const taskService = yield* AgentTaskService;
      const ticket = yield* database.getTicket(repositoryId, ticketId).pipe(
        Effect.mapError(
          (cause) =>
            new AgentTaskFailure({
              code: "storage_failed",
              message: "Ticket context could not be loaded for the agent task.",
              retryable: true,
              cause,
            }),
        ),
      );

      if (ticket === null) {
        return yield* new AgentTaskFailure({
          code: "not_found",
          message: `Ticket '${ticketId}' was not found.`,
          retryable: false,
          cause: { repositoryId, ticketId },
        });
      }

      return yield* taskService.createTask(
        ticketAgentTaskRequest({
          input,
          repositoryId,
          ticket,
          ticketId,
        }),
      );
    }),
  getTask: (taskId) => AgentTaskService.pipe(Effect.flatMap((service) => service.getTask(taskId))),
  listEvents: (query) =>
    AgentTaskService.pipe(Effect.flatMap((service) => service.listEvents(query))),
  listTasks: (query) =>
    AgentTaskService.pipe(Effect.flatMap((service) => service.listTasks(query))),
  retryTask: (taskId, input) =>
    AgentTaskService.pipe(Effect.flatMap((service) => service.retryTask(taskId, input))),
  subscribe: (query) =>
    Stream.unwrap(AgentTaskService.pipe(Effect.map((service) => service.subscribe(query)))),
});

export const AgentTaskUsecasesLive = Layer.succeed(
  AgentTaskUsecases,
  AgentTaskUsecases.of(makeAgentTaskUsecases()),
);

const ticketAgentTaskRequest = (input: {
  readonly input: CreateTicketAgentTaskInput;
  readonly repositoryId: string;
  readonly ticket: TicketDocument;
  readonly ticketId: string;
}): AgentTaskRequest => {
  const authority = input.input.authority ?? {
    mode: input.input.workspace === undefined ? "read-only" : "workspace-write",
  };
  const metadata = input.input.metadata ?? {};
  const trigger = input.input.trigger ?? "manual";
  const idempotencyKey =
    input.input.idempotencyKey ??
    `ticket:${input.repositoryId}:${input.ticketId}:${trigger}:${input.input.agentId ?? "codex"}`;

  return {
    agentId: input.input.agentId ?? "codex",
    authority,
    context: {
      repositoryId: input.repositoryId,
      ticket: jsonObject(input.ticket),
      ticketId: input.ticketId,
    },
    idempotencyKey,
    input:
      input.input.input ??
      `Work on ticket ${input.ticketId}: ${input.ticket.title}\n\n${input.ticket.body}`,
    instructions:
      input.input.instructions ??
      "Use the supplied ticket context to complete the requested work. Report what changed and any follow-up needed.",
    maxAttempts: input.input.maxAttempts,
    metadata,
    model: input.input.model,
    origin: {
      kind: "ticket",
      repositoryId: input.repositoryId,
      ticketId: input.ticketId,
      trigger,
    },
    providerId: input.input.providerId ?? "codex",
    requestedBy: input.input.requestedBy ?? "user",
    responseFormat: input.input.responseFormat,
    tools: input.input.tools,
    workspace: input.input.workspace,
  };
};

const jsonObject = (value: unknown): AgentTaskRequest["context"] =>
  JSON.parse(JSON.stringify(value)) as AgentTaskRequest["context"];
