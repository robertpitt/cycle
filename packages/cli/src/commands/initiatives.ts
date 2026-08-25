import { Command, Flag } from "effect/unstable/cli";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { bodyFromInput } from "../shared/input.ts";
import { stripUndefined } from "../shared/payloads.ts";
import { parseJsonObject, prettyJson } from "../shared/values.ts";
import { optionalString, repeatedString } from "./root.ts";

const initiativePath = (repositoryId: string, suffix = "") =>
  `/v1/repositories/${encodeURIComponent(repositoryId)}/initiatives${suffix}`;

export const initiatives = Command.make("initiatives").pipe(
  Command.withSubcommands([
    Command.make(
      "create",
      {
        body: optionalString("body"),
        data: optionalString("data"),
        label: repeatedString("label"),
        priority: optionalString("priority"),
        repository: Flag.string("repository"),
        status: optionalString("status"),
        title: Flag.string("title"),
      },
      (input) =>
        commandEffect(async (api, runtime) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const body = await bodyFromInput(runtime, optionToUndefined(input.body), true);
          const response = await api.request("POST", initiativePath(repositoryId), {
            ...parseJsonObject(optionToUndefined(input.data)),
            ...stripUndefined({
              body,
              labels: input.label.length === 0 ? undefined : input.label,
              priority: optionToUndefined(input.priority),
              repository: repositoryId,
              status: optionToUndefined(input.status),
              title: input.title,
              type: "initiative",
            }),
          });
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "progress",
      { initiativeId: Flag.string("initiative-id"), repository: Flag.string("repository") },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "GET",
            initiativePath(repositoryId, `/${encodeURIComponent(input.initiativeId)}/progress`),
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
    Command.make(
      "update",
      {
        blocker: repeatedString("blocker"),
        data: optionalString("data"),
        initiativeId: Flag.string("initiative-id"),
        nextStep: repeatedString("next-step"),
        progressNote: optionalString("progress-note"),
        repository: Flag.string("repository"),
        status: Flag.string("status"),
        summary: Flag.string("summary"),
      },
      (input) =>
        commandEffect(async (api) => {
          const repositoryId = await api.resolveRepository(input.repository);
          const response = await api.request(
            "POST",
            initiativePath(repositoryId, `/${encodeURIComponent(input.initiativeId)}/updates`),
            {
              ...parseJsonObject(optionToUndefined(input.data)),
              ...stripUndefined({
                blockers: input.blocker.length === 0 ? undefined : input.blocker,
                nextSteps: input.nextStep.length === 0 ? undefined : input.nextStep,
                progressNote: optionToUndefined(input.progressNote),
                status: input.status,
                summary: input.summary,
              }),
            },
          );
          return { human: prettyJson(response.data), json: response };
        }),
    ),
  ]),
);
