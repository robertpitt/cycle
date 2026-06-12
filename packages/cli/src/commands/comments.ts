import { Command, Flag } from "effect/unstable/cli";
import { exitCodes } from "../services/CliRuntime.ts";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { cliFailure } from "../services/errors.ts";
import { stringField } from "../shared/format.ts";
import { bodyFromInput } from "../shared/input.ts";
import { stripUndefined } from "../shared/payloads.ts";
import { optionalString } from "./root.ts";

export const comments = Command.make("comments").pipe(
  Command.withSubcommands([
    Command.make(
      "add",
      {
        body: optionalString("body"),
        email: optionalString("email"),
        issueId: Flag.string("issue-id"),
        name: optionalString("name"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const body = await bodyFromInput(runtime, optionToUndefined(input.body), false);

          if (body === undefined) {
            throw cliFailure(exitCodes.invalidUsage, "INVALID_USAGE", "Comment body is required.");
          }

          const response = await api.request<Record<string, unknown>>(
            "POST",
            `/v1/repositories/${encodeURIComponent(repositoryId)}/issues/${encodeURIComponent(input.issueId)}/comments`,
            { body },
          );

          return {
            human: `Added comment ${stringField(response.data, "id", "unknown")} to issue ${input.issueId}`,
            json: response,
          };
        }),
    ),
    Command.make(
      "list",
      {
        issueId: Flag.string("issue-id"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request<ReadonlyArray<Record<string, unknown>>>(
            "GET",
            `/v1/repositories/${encodeURIComponent(repositoryId)}/issues/${encodeURIComponent(input.issueId)}/comments`,
          );

          return {
            human:
              response.data.length === 0
                ? "No comments found."
                : response.data.map((comment) => stringField(comment, "id", "unknown")).join("\n"),
            json: response,
          };
        }),
    ),
    Command.make(
      "archive",
      {
        commentId: Flag.string("comment-id"),
        issueId: Flag.string("issue-id"),
        reason: optionalString("reason"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request<Record<string, unknown>>(
            "POST",
            `/v1/repositories/${encodeURIComponent(repositoryId)}/issues/${encodeURIComponent(input.issueId)}/comments/${encodeURIComponent(input.commentId)}/archive`,
            stripUndefined({
              reason: optionToUndefined(input.reason),
            }),
          );

          return {
            human: `Archived comment ${input.commentId} on issue ${input.issueId}`,
            json: response,
          };
        }),
    ),
  ]),
);
