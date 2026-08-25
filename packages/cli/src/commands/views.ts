import { Command, Flag } from "effect/unstable/cli";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { stripUndefined } from "../shared/payloads.ts";
import { parseBoolean, parseJsonObject, prettyJson, queryString } from "../shared/values.ts";
import { optionalString } from "./root.ts";

const viewPath = (repositoryId: string, suffix = "") =>
  `/v1/repositories/${encodeURIComponent(repositoryId)}/views${suffix}`;

export const views = Command.make("views").pipe(
  Command.withSubcommands([
    Command.make(
      "list",
      {
        cursor: optionalString("cursor"),
        kind: optionalString("kind"),
        limit: optionalString("limit"),
        pinned: optionalString("pinned"),
        q: optionalString("q"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            viewPath(
              repositoryId,
              queryString({
                "filter[kind]": optionToUndefined(input.kind),
                "filter[pinned]": optionToUndefined(input.pinned),
                "page[cursor]": optionToUndefined(input.cursor),
                "page[limit]": optionToUndefined(input.limit),
                q: optionToUndefined(input.q),
              }),
            ),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "create",
      {
        data: optionalString("data"),
        description: optionalString("description"),
        kind: optionalString("kind"),
        name: Flag.string("name"),
        pinned: optionalString("pinned"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request("POST", viewPath(repositoryId), {
            ...parseJsonObject(optionToUndefined(input.data)),
            ...stripUndefined({
              description: optionToUndefined(input.description),
              kind: optionToUndefined(input.kind),
              name: input.name,
              pinned: parseBoolean(optionToUndefined(input.pinned), "--pinned"),
            }),
          });
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    viewGetCommand(),
    Command.make(
      "update",
      {
        data: optionalString("data"),
        description: optionalString("description"),
        kind: optionalString("kind"),
        name: optionalString("name"),
        pinned: optionalString("pinned"),
        repository: Flag.string("repository"),
        viewId: Flag.string("view-id"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "PATCH",
            viewPath(repositoryId, `/${encodeURIComponent(input.viewId)}`),
            {
              ...parseJsonObject(optionToUndefined(input.data)),
              ...stripUndefined({
                description: optionToUndefined(input.description),
                kind: optionToUndefined(input.kind),
                name: optionToUndefined(input.name),
                pinned: parseBoolean(optionToUndefined(input.pinned), "--pinned"),
              }),
            },
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "archive",
      { repository: Flag.string("repository"), viewId: Flag.string("view-id") },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "POST",
            viewPath(repositoryId, `/${encodeURIComponent(input.viewId)}/archive`),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
  ]),
);

function viewGetCommand() {
  return Command.make(
    "get",
    { repository: Flag.string("repository"), viewId: Flag.string("view-id") },
    (input) =>
      commandEffect(async (api) => {
        const repositoryId = await api.resolveRepository(input.repository);
        const response = await api.request(
          "GET",
          viewPath(repositoryId, `/${encodeURIComponent(input.viewId)}`),
        );
        return { human: prettyJson(response.data), json: response };
      }),
  );
}
