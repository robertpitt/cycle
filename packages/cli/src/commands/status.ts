import { Command } from "effect/unstable/cli";
import { commandEffect } from "../services/command.ts";
import { stringField } from "../shared/format.ts";

export const status = Command.make("status", {}, () =>
  commandEffect(async (api) => {
    const response = await api.request("GET", "/v1/status");

    return {
      human: `Cycle API ${stringField(response.data, "status", "ok")}`,
      json: response,
    };
  }),
).pipe(Command.withDescription("Read local API status."));
