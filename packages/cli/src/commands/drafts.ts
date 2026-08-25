import { Command, Flag } from "effect/unstable/cli";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { bodyFromInput } from "../shared/input.ts";
import { stripUndefined } from "../shared/payloads.ts";
import { parseJsonObject, prettyJson } from "../shared/values.ts";
import { optionalString, repeatedString } from "./root.ts";

const draftPath = (repositoryId: string, suffix = "") =>
  `/v1/repositories/${encodeURIComponent(repositoryId)}/drafts${suffix}`;

export const drafts = Command.make("drafts").pipe(
  Command.withSubcommands([
    Command.make("list", { repository: Flag.string("repository") }, (input) =>
      commandEffect(async (api) => {
        const repositoryId = await api.resolveRepository(input.repository);
        const response = await api.request("GET", draftPath(repositoryId));
        return { human: prettyJson(response.data), json: response };
      }),
    ),
    Command.make(
      "create",
      {
        assignee: optionalString("assignee"),
        body: optionalString("body"),
        data: optionalString("data"),
        label: repeatedString("label"),
        priority: optionalString("priority"),
        project: optionalString("project"),
        repository: Flag.string("repository"),
        status: optionalString("status"),
        title: Flag.string("title"),
        type: Flag.string("type"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const body = await bodyFromInput(runtime, optionToUndefined(input.body), true);
          const response = await api.request("POST", draftPath(repositoryId), {
            ...parseJsonObject(optionToUndefined(input.data)),
            ...stripUndefined({
              assignee: optionToUndefined(input.assignee),
              body,
              labels: input.label.length === 0 ? undefined : input.label,
              priority: optionToUndefined(input.priority),
              project: optionToUndefined(input.project),
              repository: repositoryId,
              status: optionToUndefined(input.status),
              title: input.title,
              type: input.type,
            }),
          });
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "update",
      {
        body: optionalString("body"),
        data: optionalString("data"),
        draftId: Flag.string("draft-id"),
        repository: Flag.string("repository"),
        status: optionalString("status"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const body = await bodyFromInput(runtime, optionToUndefined(input.body), true);
          const response = await api.request(
            "PATCH",
            draftPath(repositoryId, `/${encodeURIComponent(input.draftId)}`),
            {
              ...parseJsonObject(optionToUndefined(input.data)),
              ...stripUndefined({ body, status: optionToUndefined(input.status) }),
            },
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "commit",
      { draftId: Flag.string("draft-id"), repository: Flag.string("repository") },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "POST",
            draftPath(repositoryId, `/${encodeURIComponent(input.draftId)}/commit`),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
  ]),
);
