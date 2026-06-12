import { Command, Flag } from "effect/unstable/cli";
import { exitCodes } from "../services/CliRuntime.ts";
import { commandEffect } from "../services/command.ts";
import { stringField } from "../shared/format.ts";
import { automationEvaluatePayload } from "../shared/payloads.ts";
import { optionalString, repeatedString } from "./root.ts";

export const automation = Command.make("automation").pipe(
  Command.withSubcommands([
    Command.make(
      "evaluate",
      {
        failOnWarnings: Flag.boolean("fail-on-warnings"),
        issueId: repeatedString("issue-id"),
        label: repeatedString("label"),
        priority: optionalString("priority"),
        q: optionalString("q"),
        repository: Flag.string("repository"),
        requireFresh: Flag.boolean("require-fresh"),
        severityThreshold: optionalString("severity-threshold"),
        status: optionalString("status"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request<Record<string, unknown>>(
            "POST",
            `/v1/repositories/${encodeURIComponent(repositoryId)}/automation/evaluations`,
            automationEvaluatePayload(input),
          );
          const status = stringField(response.data, "status", "pass");

          if (status === "fail") runtime.setExitCode?.(exitCodes.automationFailed);

          return {
            human: `Automation ${status}`,
            json: response,
          };
        }),
    ),
  ]),
);
