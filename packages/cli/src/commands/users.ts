import { Command, Flag } from "effect/unstable/cli";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { stripUndefined } from "../shared/payloads.ts";
import { prettyJson, queryString } from "../shared/values.ts";
import { optionalString, repeatedString } from "./root.ts";

const userPath = (repositoryId: string, suffix = "") =>
  `/v1/repositories/${encodeURIComponent(repositoryId)}/users${suffix}`;

export const users = Command.make("users").pipe(
  Command.withSubcommands([
    Command.make(
      "list",
      {
        cursor: optionalString("cursor"),
        disabled: optionalString("disabled"),
        limit: optionalString("limit"),
        q: optionalString("q"),
        repository: Flag.string("repository"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            userPath(
              repositoryId,
              queryString({
                "filter[disabled]": optionToUndefined(input.disabled),
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
      "get",
      { repository: Flag.string("repository"), userId: Flag.string("user-id") },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            userPath(repositoryId, `/${encodeURIComponent(input.userId)}`),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "upsert",
      {
        alias: repeatedString("alias"),
        avatarUrl: optionalString("avatar-url"),
        disabledAt: optionalString("disabled-at"),
        displayName: Flag.string("display-name"),
        email: optionalString("email"),
        repository: Flag.string("repository"),
        source: optionalString("source"),
        timezone: optionalString("timezone"),
        userId: Flag.string("user-id"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "PUT",
            userPath(repositoryId, `/${encodeURIComponent(input.userId)}`),
            stripUndefined({
              aliases: input.alias.length === 0 ? undefined : input.alias,
              avatarUrl: optionToUndefined(input.avatarUrl),
              disabledAt: optionToUndefined(input.disabledAt),
              displayName: input.displayName,
              email: optionToUndefined(input.email),
              source: optionToUndefined(input.source),
              timezone: optionToUndefined(input.timezone),
            }),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
  ]),
);
