import { Command, Flag } from "effect/unstable/cli";
import { exitCodes } from "../services/CliRuntime.ts";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { cliFailure } from "../services/errors.ts";
import { stripUndefined } from "../shared/payloads.ts";
import {
  parseJsonObject,
  parseJsonValue,
  parsePositiveInteger,
  prettyJson,
  queryString,
} from "../shared/values.ts";
import { optionalString } from "./root.ts";

const taskPath = (suffix = "") => `/v1/agent-tasks${suffix}`;

export const agentTasks = Command.make("agent-tasks").pipe(
  Command.withSubcommands([
    Command.make(
      "create",
      {
        agentId: optionalString("agent-id"),
        authority: optionalString("authority"),
        data: optionalString("data"),
        input: optionalString("input"),
        instructions: optionalString("instructions"),
        issueId: optionalString("issue-id"),
        maxAttempts: optionalString("max-attempts"),
        model: optionalString("model"),
        providerId: optionalString("provider-id"),
        repository: optionalString("repository"),
        requestedBy: optionalString("requested-by"),
      },
      (input) =>
        commandEffect(async (api) => {
          const issueId = optionToUndefined(input.issueId);
          const repository = optionToUndefined(input.repository);
          if (issueId !== undefined && repository === undefined) {
            throw cliFailure(
              exitCodes.invalidUsage,
              "INVALID_USAGE",
              "--repository is required with --issue-id.",
            );
          }
          const repositoryId =
            repository === undefined ? undefined : await api.resolveRepository(repository);
          const rawInput = optionToUndefined(input.input);
          const payload = {
            ...parseJsonObject(optionToUndefined(input.data)),
            ...stripUndefined({
              agentId: optionToUndefined(input.agentId),
              authority:
                optionToUndefined(input.authority) === undefined
                  ? undefined
                  : { mode: optionToUndefined(input.authority) },
              context: issueId === undefined ? {} : undefined,
              input: rawInput === undefined ? undefined : parseInput(rawInput),
              instructions: optionToUndefined(input.instructions),
              maxAttempts: parsePositiveInteger(
                optionToUndefined(input.maxAttempts),
                "--max-attempts",
              ),
              model: optionToUndefined(input.model),
              providerId: optionToUndefined(input.providerId),
              requestedBy: optionToUndefined(input.requestedBy),
            }),
          };
          const path =
            issueId === undefined || repositoryId === undefined
              ? taskPath()
              : `/v1/repositories/${encodeURIComponent(repositoryId)}/issues/${encodeURIComponent(issueId)}/agent-tasks`;
          const response = await api.request("POST", path, payload);
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "list",
      {
        cursor: optionalString("cursor"),
        limit: optionalString("limit"),
        originKind: optionalString("origin-kind"),
        repositoryId: optionalString("repository-id"),
        status: optionalString("status"),
        ticketId: optionalString("ticket-id"),
      },
      (input) =>
        commandEffect(async (api) => {
          const response = await api.request(
            "GET",
            taskPath(
              queryString({
                "filter[originKind]": optionToUndefined(input.originKind),
                "filter[repositoryId]": optionToUndefined(input.repositoryId),
                "filter[status]": optionToUndefined(input.status),
                "filter[ticketId]": optionToUndefined(input.ticketId),
                "page[cursor]": optionToUndefined(input.cursor),
                "page[limit]": optionToUndefined(input.limit),
              }),
            ),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    taskGetCommand(),
    Command.make(
      "events",
      {
        cursor: optionalString("cursor"),
        limit: optionalString("limit"),
        taskId: Flag.string("task-id"),
      },
      (input) =>
        commandEffect(async (api) => {
          const response = await api.request(
            "GET",
            taskPath(
              `/${encodeURIComponent(input.taskId)}/events${queryString({ "page[cursor]": optionToUndefined(input.cursor), "page[limit]": optionToUndefined(input.limit) })}`,
            ),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "input",
      {
        input: Flag.string("input"),
        requestedBy: optionalString("requested-by"),
        taskId: Flag.string("task-id"),
      },
      (input) =>
        commandEffect(async (api) => {
          const response = await api.request(
            "POST",
            taskPath(`/${encodeURIComponent(input.taskId)}/input`),
            stripUndefined({
              input: parseInput(input.input),
              requestedBy: optionToUndefined(input.requestedBy),
            }),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    taskActionCommand("cancel"),
    taskActionCommand("retry"),
  ]),
);

function taskGetCommand() {
  return Command.make("status", { taskId: Flag.string("task-id") }, (input) =>
    commandEffect(async (api) => {
      const response = await api.request("GET", taskPath(`/${encodeURIComponent(input.taskId)}`));
      return { human: prettyJson(response.data), json: response };
    }),
  );
}

function taskActionCommand(action: "cancel" | "retry") {
  return Command.make(
    action,
    {
      reason: optionalString("reason"),
      requestedBy: optionalString("requested-by"),
      taskId: Flag.string("task-id"),
    },
    (input) =>
      commandEffect(async (api) => {
        const response = await api.request(
          "POST",
          taskPath(`/${encodeURIComponent(input.taskId)}/${action}`),
          stripUndefined({
            reason: action === "cancel" ? optionToUndefined(input.reason) : undefined,
            requestedBy: optionToUndefined(input.requestedBy),
          }),
        );
        return { human: prettyJson(response.data), json: response };
      }),
  );
}

const parseInput = (value: string): unknown => {
  const trimmed = value.trim();
  return trimmed.startsWith("{") ? parseJsonValue(trimmed, "--input") : value;
};
