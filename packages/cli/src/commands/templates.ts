import { Command, Flag } from "effect/unstable/cli";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { bodyFromInput } from "../shared/input.ts";
import { stripUndefined } from "../shared/payloads.ts";
import { parseBoolean, parseJsonObject, prettyJson, queryString } from "../shared/values.ts";
import { optionalString } from "./root.ts";

const templatePath = (repositoryId: string, suffix = "") =>
  `/v1/repositories/${encodeURIComponent(repositoryId)}/templates${suffix}`;

export const templates = Command.make("templates").pipe(
  Command.withSubcommands([
    Command.make(
      "list",
      {
        active: optionalString("active"),
        cursor: optionalString("cursor"),
        kind: optionalString("kind"),
        limit: optionalString("limit"),
        q: optionalString("q"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            templatePath(
              repositoryId,
              queryString({
                "filter[active]": optionToUndefined(input.active),
                "filter[kind]": optionToUndefined(input.kind),
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
        active: optionalString("active"),
        body: optionalString("body"),
        data: optionalString("data"),
        description: optionalString("description"),
        kind: Flag.string("kind"),
        name: Flag.string("name"),
        repository: Flag.string("repository"),
        titleTemplate: Flag.string("title-template"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const bodyTemplate = await bodyFromInput(runtime, optionToUndefined(input.body), false);
          const response = await api.request("POST", templatePath(repositoryId), {
            ...parseJsonObject(optionToUndefined(input.data)),
            ...stripUndefined({
              active: parseBoolean(optionToUndefined(input.active), "--active"),
              bodyTemplate: bodyTemplate ?? "",
              description: optionToUndefined(input.description),
              kind: input.kind,
              name: input.name,
              titleTemplate: input.titleTemplate,
            }),
          });
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    templateGetCommand(),
    Command.make(
      "update",
      {
        active: optionalString("active"),
        body: optionalString("body"),
        data: optionalString("data"),
        description: optionalString("description"),
        kind: optionalString("kind"),
        name: optionalString("name"),
        repository: Flag.string("repository"),
        templateId: Flag.string("template-id"),
        titleTemplate: optionalString("title-template"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const bodyTemplate = await bodyFromInput(runtime, optionToUndefined(input.body), true);
          const response = await api.request(
            "PATCH",
            templatePath(repositoryId, `/${encodeURIComponent(input.templateId)}`),
            {
              ...parseJsonObject(optionToUndefined(input.data)),
              ...stripUndefined({
                active: parseBoolean(optionToUndefined(input.active), "--active"),
                bodyTemplate,
                description: optionToUndefined(input.description),
                kind: optionToUndefined(input.kind),
                name: optionToUndefined(input.name),
                titleTemplate: optionToUndefined(input.titleTemplate),
              }),
            },
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "archive",
      { repository: Flag.string("repository"), templateId: Flag.string("template-id") },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "POST",
            templatePath(repositoryId, `/${encodeURIComponent(input.templateId)}/archive`),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
  ]),
);

function templateGetCommand() {
  return Command.make(
    "get",
    { repository: Flag.string("repository"), templateId: Flag.string("template-id") },
    (input) =>
      commandEffect(async (api) => {
        const repositoryId = await api.resolveRepository(input.repository);
        const response = await api.request(
          "GET",
          templatePath(repositoryId, `/${encodeURIComponent(input.templateId)}`),
        );
        return { human: prettyJson(response.data), json: response };
      }),
  );
}
