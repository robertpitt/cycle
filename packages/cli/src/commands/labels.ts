import { Command, Flag } from "effect/unstable/cli";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { stripUndefined } from "../shared/payloads.ts";
import { prettyJson, queryString } from "../shared/values.ts";
import { optionalString } from "./root.ts";

const labelPath = (repositoryId: string, suffix = "") =>
  `/v1/repositories/${encodeURIComponent(repositoryId)}/labels${suffix}`;

export const labels = Command.make("labels").pipe(
  Command.withSubcommands([
    Command.make(
      "list",
      {
        archived: optionalString("archived"),
        cursor: optionalString("cursor"),
        limit: optionalString("limit"),
        q: optionalString("q"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            labelPath(
              repositoryId,
              queryString({
                "filter[archived]": optionToUndefined(input.archived),
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
      "upsert",
      {
        color: optionalString("color"),
        description: optionalString("description"),
        labelId: Flag.string("label-id"),
        name: Flag.string("name"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "PUT",
            labelPath(repositoryId, `/${encodeURIComponent(input.labelId)}`),
            stripUndefined({
              color: optionToUndefined(input.color),
              description: optionToUndefined(input.description),
              id: input.labelId,
              name: input.name,
            }),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "archive",
      { labelId: Flag.string("label-id"), repository: Flag.string("repository") },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "POST",
            labelPath(repositoryId, `/${encodeURIComponent(input.labelId)}/archive`),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
  ]),
);
