# Cycle

Cycle is a local-first, Git-backed ticket system for teams that want their work history to live
with the code.

It is being built for a new style of software delivery: humans define intent, agents help turn that
intent into plans and code, and the ticket system keeps the full story available to both. Tickets,
comments, plans, reviews, agent execution records, and follow-up work belong inside the repository's
own Git data, not in a disconnected SaaS database.


<a href="http://www.youtube.com/watch?feature=player_embedded&amp;v=Vnjjc-kRUjQ" target="_blank">
 <img src="http://img.youtube.com/vi/Vnjjc-kRUjQ/maxresdefault.jpg" alt="Watch the video" width="100%" height="100%" border="0"/>
</a>

## Why Cycle

Most issue trackers were designed for humans moving cards across a board. Modern development now
includes agents that need durable context: what was requested, why it changed, what failed, what was
reviewed, and what still needs attention.

Cycle treats the ticket system as repository infrastructure.

- Work stays available offline, because ticket data is stored locally with the repository.
- Teams can sync ticket history through Git refs instead of depending on a hosted tracker.
- Agents can read the same issue history, comments, plans, and review records that humans use.
- Humans remain in control, with verification and approval as the default gate before work is done.
- Every meaningful change can become inspectable history, not a lost chat transcript.

## The Product Vision

Cycle is a distributed work system for repositories.

Instead of keeping planning in one tool, implementation in another, and agent context in a chat
thread, Cycle brings the workflow into one local-first loop:

1. Capture work as a repository-scoped ticket.
2. Let an agent draft, expand, split, or clarify the ticket using local project context.
3. Review the plan as a human and request changes when it is not ready.
4. Mark the ticket ready for implementation.
5. Let an agent work in an isolated Git worktree.
6. Review the output, test results, diff summary, and final report.
7. Approve, request changes, or create follow-up tickets from what was learned.

The result is a ticket system that does not just track work. It becomes the shared memory for humans
and agents working on the same codebase.

## Distributed Tickets

Cycle stores repository ticket data in the repository's `.git` directory using dedicated Cycle data
refs. Normal source branches, `HEAD`, the index, and checked-out files are not used as the ticket
database.

That gives Cycle a practical middle ground:

- Local like files on disk.
- Versioned like Git history.
- Syncable like repository data.
- Fast in the app through a rebuildable local projection.
- Portable without requiring Linear, Jira, GitHub Issues, or a hosted account.

For public or open-source projects, ticket history can travel with the repository. For private work,
it stays under the same trust boundary as the code.

## Built For Agent-Native Work

Cycle is designed around the idea that agents should not operate from thin prompts and forgotten
chat history. They should be able to understand the ticket system as a durable source of context.

The direction is:

- Agents can draft tickets from code context, user requests, failures, and existing issue history.
- Humans can verify, edit, reject, or request changes before a draft becomes committed work.
- Agents can implement approved tickets in isolated worktrees.
- Agent runs can write execution records, questions, blockers, test notes, and final reports back
  to the ticket.
- Completed work can create new tickets when the agent or reviewer discovers follow-up tasks.
- Review remains human-led by default, with agents assisting rather than silently closing work.

Cycle's goal is not to replace judgment. It is to make agent-assisted development auditable,
repeatable, and easier to trust.

## What You Can Manage In Cycle

Cycle is shaped around a Linear-inspired workflow without requiring Linear:

- Issues with title, Markdown description, status, priority, assignee, labels, due dates, estimates,
  parent issues, and external links.
- Comments and activity records that keep decisions and handoffs attached to the work.
- Backlog, todo, in-progress, review, done, and canceled workflows.
- Triage and saved views for focused queues such as bugs, stale work, blocked issues, and review.
- Issue and repository history for understanding how work changed over time.
- Repository sync status so users know whether local ticket data is current.

The long-term product direction is a complete desktop workflow for planning, tracking, delegating,
reviewing, and completing repository work with humans and agents in the same loop.

## Who It Is For

Cycle is for:

- Solo developers who want a serious local issue tracker without setting up hosted tooling.
- Small teams that want repository-native planning and sync.
- Maintainers who want ticket history to be inspectable alongside code history.
- Agent-assisted developers who need a durable workflow for plans, execution, review, and follow-up.
- Open-source projects that want issue data to be portable with the repository itself.

## Current Status

Cycle is private, pre-1.0, and under active development.

The foundations are in place: a Git-backed document store, repository-scoped ticket persistence,
desktop app shell, local projection for fast reads, typed workflow layers, and product requirements
for a full Linear-inspired, agent-aware desktop experience.

Some features described here are the product direction rather than completed user-facing behavior.
The README presents what Cycle is being built to become, while the project specifications describe
the exact implementation requirements and current sequencing.

## Try The Current Build

Cycle currently runs as an Electron desktop app from this repository.

Prerequisites:

- Node.js with Corepack
- pnpm `10.33.3`
- Git

Install and run:

```sh
corepack enable
pnpm install
pnpm desktop:dev
```

Useful commands:

```sh
pnpm desktop:dev      # run the desktop app
pnpm desktop:build    # build the desktop app
pnpm storybook        # view shared UI components
pnpm check            # typecheck, lint, and format-check
```

## Learn More

The product and implementation specs are the best place to understand the roadmap:

- `SPEC.md` describes the layered system architecture.

Cycle is building toward a simple promise: the ticket system should be as local, durable,
inspectable, and agent-readable as the code it describes.
