import { Command } from "effect/unstable/cli";
import { automation } from "./automation.ts";
import { agentTasks } from "./agentTasks.ts";
import { backend } from "./backend.ts";
import { chat } from "./chat.ts";
import { comments } from "./comments.ts";
import { drafts } from "./drafts.ts";
import { initiatives } from "./initiatives.ts";
import { issue } from "./issues.ts";
import { labels } from "./labels.ts";
import { pages } from "./pages.ts";
import { repositories } from "./repositories.ts";
import { cycle } from "./root.ts";
import { status } from "./status.ts";
import { templates } from "./templates.ts";
import { users } from "./users.ts";
import { views } from "./views.ts";

export const cycleCommand = cycle.pipe(
  Command.withSubcommands([
    status,
    repositories,
    issue,
    comments,
    pages,
    views,
    drafts,
    templates,
    labels,
    users,
    initiatives,
    agentTasks,
    chat,
    automation,
    backend,
  ]),
);
