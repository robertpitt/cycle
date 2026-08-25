import { Command, Flag } from "effect/unstable/cli";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { bodyFromInput } from "../shared/input.ts";
import { stripUndefined } from "../shared/payloads.ts";
import { parseBoolean, parseJsonObject, prettyJson, queryString } from "../shared/values.ts";
import { optionalString } from "./root.ts";

const pagePath = (repositoryId: string, suffix = "") =>
  `/v1/repositories/${encodeURIComponent(repositoryId)}/pages${suffix}`;

export const pages = Command.make("pages").pipe(
  Command.withSubcommands([
    Command.make(
      "list",
      {
        archived: optionalString("archived"),
        cursor: optionalString("cursor"),
        directory: optionalString("directory"),
        limit: optionalString("limit"),
        recursive: optionalString("recursive"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            pagePath(
              repositoryId,
              queryString({
                archived: optionToUndefined(input.archived),
                directory: optionToUndefined(input.directory),
                "page[cursor]": optionToUndefined(input.cursor),
                "page[limit]": optionToUndefined(input.limit),
                recursive: optionToUndefined(input.recursive),
              }),
            ),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "create",
      {
        body: optionalString("body"),
        commitMessage: optionalString("commit-message"),
        data: optionalString("data"),
        path: Flag.string("path"),
        repository: Flag.string("repository"),
        title: Flag.string("title"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const body = await bodyFromInput(runtime, optionToUndefined(input.body), false);
          const response = await api.request("POST", pagePath(repositoryId), {
            ...parseJsonObject(optionToUndefined(input.data)),
            body: body ?? "",
            ...stripUndefined({
              commitMessage: optionToUndefined(input.commitMessage),
              path: input.path,
              title: input.title,
            }),
          });
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "get",
      {
        includeArchived: optionalString("include-archived"),
        pageId: Flag.string("page-id"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            pagePath(
              repositoryId,
              `/${encodeURIComponent(input.pageId)}${queryString({ includeArchived: optionToUndefined(input.includeArchived) })}`,
            ),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "update",
      {
        body: optionalString("body"),
        commitMessage: optionalString("commit-message"),
        data: optionalString("data"),
        expectedRevisionId: Flag.string("expected-revision-id"),
        pageId: Flag.string("page-id"),
        path: optionalString("path"),
        repository: Flag.string("repository"),
        title: optionalString("title"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const body = await bodyFromInput(runtime, optionToUndefined(input.body), true);
          const response = await api.request(
            "PATCH",
            pagePath(repositoryId, `/${encodeURIComponent(input.pageId)}`),
            {
              ...parseJsonObject(optionToUndefined(input.data)),
              ...stripUndefined({
                body,
                commitMessage: optionToUndefined(input.commitMessage),
                expectedRevisionId: input.expectedRevisionId,
                path: optionToUndefined(input.path),
                title: optionToUndefined(input.title),
              }),
            },
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    pageLifecycleCommand("archive"),
    pageLifecycleCommand("restore"),
    Command.make(
      "history",
      {
        cursor: optionalString("cursor"),
        limit: optionalString("limit"),
        pageId: Flag.string("page-id"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            pagePath(
              repositoryId,
              `/${encodeURIComponent(input.pageId)}/history${queryString({ "page[cursor]": optionToUndefined(input.cursor), "page[limit]": optionToUndefined(input.limit) })}`,
            ),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "revision",
      {
        pageId: Flag.string("page-id"),
        repository: Flag.string("repository"),
        snapshotId: Flag.string("snapshot-id"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            pagePath(
              repositoryId,
              `/${encodeURIComponent(input.pageId)}/revisions/${encodeURIComponent(input.snapshotId)}`,
            ),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "comments",
      {
        cursor: optionalString("cursor"),
        limit: optionalString("limit"),
        pageId: Flag.string("page-id"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            pagePath(
              repositoryId,
              `/${encodeURIComponent(input.pageId)}/comments${queryString({ "page[cursor]": optionToUndefined(input.cursor), "page[limit]": optionToUndefined(input.limit) })}`,
            ),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "comment-add",
      {
        body: optionalString("body"),
        pageId: Flag.string("page-id"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const body = await bodyFromInput(runtime, optionToUndefined(input.body), false);
          const response = await api.request(
            "POST",
            pagePath(repositoryId, `/${encodeURIComponent(input.pageId)}/comments`),
            { body: body ?? "" },
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
  ]),
);

function pageLifecycleCommand(action: "archive" | "restore") {
  return Command.make(
    action,
    {
      expectedRevisionId: Flag.string("expected-revision-id"),
      humanApproved: optionalString("human-approved"),
      pageId: Flag.string("page-id"),
      reason: optionalString("reason"),
      repository: Flag.string("repository"),
    },
    (input) =>
      commandEffect(async (api) => {
        const repositoryId = await api.resolveRepository(input.repository);
        const response = await api.request(
          "POST",
          pagePath(repositoryId, `/${encodeURIComponent(input.pageId)}/${action}`),
          stripUndefined({
            expectedRevisionId: input.expectedRevisionId,
            humanApproved: parseBoolean(optionToUndefined(input.humanApproved), "--human-approved"),
            reason: optionToUndefined(input.reason),
          }),
        );
        return { human: prettyJson(response.data), json: response };
      }),
  );
}
