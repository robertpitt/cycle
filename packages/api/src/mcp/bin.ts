#!/usr/bin/env node
import { defaultLayer as CycleLoggingLive } from "@cycle/logging";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { CycleApiError } from "@cycle/api";
import {
  runCycleMcpStdio,
  startCycleMcpHttpServerEffect,
  type CycleMcpHttpOptions,
  type CycleMcpOptions,
} from "./server/index.ts";

const logging = { packageName: "api" } as const;

const flags = parseFlags(process.argv.slice(2));
const env = process.env;
const common: CycleMcpOptions = {
  apiToken: flags["api-token"],
  apiUrl: flags["api-url"],
  env,
  requireApiOnStart: flags["require-api"] === "true",
};

if ((flags.transport ?? env.CYCLE_MCP_TRANSPORT) === "http") {
  const options: CycleMcpHttpOptions = {
    ...common,
    auth:
      flags["no-http-auth"] === "true" || env.CYCLE_MCP_HTTP_AUTH === "false"
        ? false
        : {
            token:
              flags["mcp-token"] ??
              env.CYCLE_MCP_TOKEN ??
              flags["api-token"] ??
              env.CYCLE_API_TOKEN ??
              "",
          },
    host: hostFrom(flags.host ?? env.CYCLE_MCP_HOST),
    path: flags.path ?? env.CYCLE_MCP_PATH,
    port: numberFrom(flags.port ?? env.CYCLE_MCP_PORT),
  };

  Effect.acquireRelease(startCycleMcpHttpServerEffect(options), (server) =>
    Effect.tryPromise({
      try: () => server.close(),
      catch: (cause) =>
        new CycleApiError({
          cause,
          message: cause instanceof Error ? cause.message : "failed to close MCP server",
          operation: "close mcp server",
        }),
    }).pipe(Effect.catch(() => Effect.void)),
  ).pipe(
    Effect.flatMap(() => Effect.never),
    Effect.scoped,
    Effect.provide([NodeServices.layer, CycleLoggingLive(logging)]),
    NodeRuntime.runMain,
  );
} else {
  runCycleMcpStdio(common).pipe(
    Effect.provide([NodeServices.layer, CycleLoggingLive(logging)]),
    NodeRuntime.runMain,
  );
}

function parseFlags(args: ReadonlyArray<string>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    if (key === "no-http-auth") {
      out[key] = "true";
      continue;
    }

    out[key] = args[i + 1];
    i++;
  }

  return out;
}

function hostFrom(value: string | undefined): "127.0.0.1" | "localhost" | undefined {
  if (value === "127.0.0.1" || value === "localhost") return value;
  return undefined;
}

function numberFrom(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
