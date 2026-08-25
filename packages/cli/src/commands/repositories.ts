import { Command, Flag } from "effect/unstable/cli";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { capitalize, formatRepository, stringField } from "../shared/format.ts";
import { prettyJson, queryString } from "../shared/values.ts";
import { optionalString } from "./root.ts";

export const repositories = Command.make("repositories").pipe(
  Command.withSubcommands([
    Command.make("list", {}, () =>
      commandEffect(async (api) => {
        const response = await api.request<ReadonlyArray<Record<string, unknown>>>(
          "GET",
          "/v1/repositories",
        );

        return {
          human:
            response.data.length === 0
              ? "No repositories registered."
              : response.data.map(formatRepository).join("\n"),
          json: response,
        };
      }),
    ),
    Command.make(
      "add",
      {
        repository: Flag.string("repository"),
      },
      ({ repository }) =>
        commandEffect(async (api) => {
          const response = await api.request<Record<string, unknown>>("POST", "/v1/repositories", {
            path: repository,
          });

          return {
            human: `Registered repository ${stringField(response.data, "repositoryId", repository)}`,
            json: response,
          };
        }),
    ),
    Command.make(
      "status",
      {
        repository: Flag.string("repository"),
      },
      ({ repository }) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(repository);
          const response = await api.request(
            "GET",
            `/v1/repositories/${encodeURIComponent(repositoryId)}`,
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    repositoryCollection("warnings"),
    repositoryCollection("history"),
    repositoryCollection("sync-events"),
    Command.make("remove", { repository: Flag.string("repository") }, ({ repository }) =>
      commandEffect(async (api) => {
        const repositoryId = await api.resolveRepository(repository);
        const response = await api.request(
          "DELETE",
          `/v1/repositories/${encodeURIComponent(repositoryId)}`,
        );
        return {
          human: `Removed repository ${repositoryId}`,
          json: response,
        };
      }),
    ),
    repositoryAction("fetch"),
    repositoryAction("sync"),
    repositoryAction("push"),
  ]),
);

function repositoryAction(action: "fetch" | "push" | "sync") {
  return Command.make(
    action,
    {
      repository: Flag.string("repository"),
    },
    ({ repository }) =>
      commandEffect(async (api) => {
        const repositoryId = await api.resolveRepository(repository);
        const response = await api.request(
          "POST",
          `/v1/repositories/${encodeURIComponent(repositoryId)}/${action}`,
        );

        return {
          human: `${capitalize(action)} requested for ${repositoryId}`,
          json: response,
        };
      }),
  );
}

function repositoryCollection(action: "history" | "sync-events" | "warnings") {
  return Command.make(
    action,
    {
      cursor: optionalString("cursor"),
      limit: optionalString("limit"),
      repository: Flag.string("repository"),
      ticketId: optionalString("ticket-id"),
    },
    (input) =>
      commandEffect(async (api) => {
        const repositoryId = await api.resolveRepository(input.repository);
        const response = await api.request(
          "GET",
          `/v1/repositories/${encodeURIComponent(repositoryId)}/${action}${queryString({
            "filter[ticketId]":
              action === "history" ? optionToUndefined(input.ticketId) : undefined,
            "page[cursor]": optionToUndefined(input.cursor),
            "page[limit]": optionToUndefined(input.limit),
          })}`,
        );
        return { human: prettyJson(response.data), json: response };
      }),
  );
}
