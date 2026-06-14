#!/usr/bin/env node
import { defaultLayer as CycleLoggingLive } from "@cycle/logging";
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { runCycleCliEffect } from "./cli.ts";

runCycleCliEffect().pipe(
  Effect.flatMap((exitCode) =>
    Effect.sync(() => {
      process.exitCode = exitCode;
    }),
  ),
  Effect.provide(CycleLoggingLive()),
  NodeRuntime.runMain,
);
