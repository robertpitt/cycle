import { Command, Flag } from "effect/unstable/cli";
import { exitCodes } from "../services/CliRuntime.ts";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { cliFailure } from "../services/errors.ts";
import { capitalize, issueId, issueStatus, issueTitle } from "../shared/format.ts";
import { bodyFromInput } from "../shared/input.ts";
import { issueListQuery, issueUpdatePayload, stripUndefined } from "../shared/payloads.ts";
import { optionalString, repeatedString } from "./root.ts";

export const issue = Command.make("issue").pipe(
  Command.withSubcommands([
    Command.make(
      "create",
      {
        body: optionalString("body"),
        label: repeatedString("label"),
        priority: optionalString("priority"),
        repository: Flag.string("repository"),
        status: optionalString("status"),
        title: Flag.string("title"),
        type: optionalString("type"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const body = await bodyFromInput(runtime, optionToUndefined(input.body), false);
          const response = await api.request<Record<string, unknown>>(
            "POST",
            `/v1/repositories/${encodeURIComponent(repositoryId)}/issues`,
            stripUndefined({
              body,
              labels: input.label,
              priority: optionToUndefined(input.priority),
              status: optionToUndefined(input.status),
              title: input.title,
              type: optionToUndefined(input.type),
            }),
          );

          return {
            human: `Created issue ${issueId(response.data)}: ${issueTitle(response.data)}`,
            json: response,
          };
        }),
    ),
    Command.make(
      "get",
      {
        issueId: Flag.string("issue-id"),
        repository: Flag.string("repository"),
      },
      ({ issueId: issueIdValue, repository }) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(repository);
          const response = await api.request<Record<string, unknown>>(
            "GET",
            `/v1/repositories/${encodeURIComponent(repositoryId)}/issues/${encodeURIComponent(issueIdValue)}`,
          );

          return {
            human: `${issueId(response.data)} ${issueStatus(response.data)} ${issueTitle(response.data)}`,
            json: response,
          };
        }),
    ),
    Command.make(
      "list",
      {
        cursor: optionalString("cursor"),
        label: repeatedString("label"),
        limit: optionalString("limit"),
        priority: optionalString("priority"),
        q: optionalString("q"),
        repository: Flag.string("repository"),
        sort: optionalString("sort"),
        status: optionalString("status"),
        type: optionalString("type"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request<ReadonlyArray<Record<string, unknown>>>(
            "GET",
            `/v1/repositories/${encodeURIComponent(repositoryId)}/issues${issueListQuery(input)}`,
          );

          return {
            human:
              response.data.length === 0
                ? "No issues found."
                : response.data
                    .map((item) => `${issueId(item)} ${issueStatus(item)} ${issueTitle(item)}`)
                    .join("\n"),
            json: response,
          };
        }),
    ),
    Command.make(
      "update",
      {
        assignee: optionalString("assignee"),
        body: optionalString("body"),
        issueId: Flag.string("issue-id"),
        label: repeatedString("label"),
        message: optionalString("message"),
        priority: optionalString("priority"),
        repository: Flag.string("repository"),
        status: optionalString("status"),
        title: optionalString("title"),
        type: optionalString("type"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const body = await bodyFromInput(runtime, optionToUndefined(input.body), true);
          const payload = issueUpdatePayload(input, body);

          if (Object.keys(payload).length === 0) {
            throw cliFailure(
              exitCodes.invalidUsage,
              "INVALID_USAGE",
              "At least one issue field must be supplied.",
            );
          }

          const response = await api.request<Record<string, unknown>>(
            "PATCH",
            `/v1/repositories/${encodeURIComponent(repositoryId)}/issues/${encodeURIComponent(input.issueId)}`,
            payload,
          );

          return {
            human: `Updated issue ${issueId(response.data)}: ${issueTitle(response.data)}`,
            json: response,
          };
        }),
    ),
    Command.make(
      "transition",
      {
        issueId: Flag.string("issue-id"),
        reason: optionalString("reason"),
        repository: Flag.string("repository"),
        status: Flag.string("status"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request<Record<string, unknown>>(
            "POST",
            `/v1/repositories/${encodeURIComponent(repositoryId)}/issues/${encodeURIComponent(input.issueId)}/transitions`,
            stripUndefined({
              reason: optionToUndefined(input.reason),
              status: input.status,
            }),
          );

          return {
            human: `Transitioned issue ${issueId(response.data)} to ${issueStatus(response.data)}`,
            json: response,
          };
        }),
    ),
    issueLifecycleAction("archive"),
    issueLifecycleAction("restore"),
  ]),
);

function issueLifecycleAction(action: "archive" | "restore") {
  return Command.make(
    action,
    {
      issueId: Flag.string("issue-id"),
      reason: optionalString("reason"),
      repository: Flag.string("repository"),
    },
    (input) =>
      commandEffect(async (api) => {
        const repositoryId = await api.resolveRepository(input.repository);
        const response = await api.request<Record<string, unknown>>(
          "POST",
          `/v1/repositories/${encodeURIComponent(repositoryId)}/issues/${encodeURIComponent(input.issueId)}/${action}`,
          stripUndefined({
            reason: optionToUndefined(input.reason),
          }),
        );

        return {
          human: `${capitalize(action)}d issue ${issueId(response.data)}: ${issueTitle(response.data)}`,
          json: response,
        };
      }),
  );
}
