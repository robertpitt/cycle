import { Command, Flag } from "effect/unstable/cli";
import { commandEffect } from "../services/command.ts";
import { capitalize, formatRepository, stringField } from "../shared/format.ts";

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
    repositoryAction("sync"),
    repositoryAction("push"),
  ]),
);

function repositoryAction(action: "push" | "sync") {
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
