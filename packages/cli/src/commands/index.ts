import { Command } from "effect/unstable/cli";
import { automation } from "./automation.ts";
import { comments } from "./comments.ts";
import { issue } from "./issues.ts";
import { repositories } from "./repositories.ts";
import { cycle } from "./root.ts";
import { status } from "./status.ts";

export const cycleCommand = cycle.pipe(
  Command.withSubcommands([status, repositories, issue, comments, automation]),
);
