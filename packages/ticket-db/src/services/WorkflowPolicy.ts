import { Context, Effect, Layer } from "effect";
import {
  DEFAULT_PROTECTED_SECTIONS,
  defaultIssueBody,
  hasSectionContent,
} from "../domain/IssueBody.ts";
import { normalizeKey } from "../domain/IssueDocument.ts";
import type { CreateIssueInput } from "../domain/Types.ts";
import type { TicketDbFailure } from "../errors/TicketDbFailure.ts";
import { workflowError } from "../errors/WorkflowError.ts";
import type { Actor } from "../schemas/Actor.ts";
import type { IssueDocument } from "../schemas/IssueDocument.ts";
import type { IssueStatus } from "../schemas/IssueStatus.ts";

export type WorkflowPolicyShape = {
  readonly assertTransitionAllowed: (
    from: IssueStatus,
    to: IssueStatus,
    actor: Actor,
    issue: IssueDocument,
  ) => Effect.Effect<void, TicketDbFailure>;
  readonly assertReady: (issue: IssueDocument) => Effect.Effect<void, TicketDbFailure>;
  readonly defaultIssueBody: (input: CreateIssueInput) => string;
  readonly protectedSections: ReadonlyArray<string>;
};

export class WorkflowPolicy extends Context.Service<WorkflowPolicy, WorkflowPolicyShape>()(
  "@cycle/ticket-db/WorkflowPolicy",
) {}

const defaultTransitions: Readonly<Record<string, ReadonlyArray<string>>> = {
  backlog: ["todo", "ready", "canceled"],
  canceled: ["backlog", "todo"],
  done: ["in-review"],
  "in-progress": ["needs-review", "in-review", "canceled"],
  "in-review": ["needs-review", "done", "in-progress", "canceled"],
  "needs-review": ["todo", "ready", "in-progress", "in-review", "canceled"],
  ready: ["in-progress", "todo", "canceled"],
  todo: ["backlog", "ready", "canceled"],
};

export const makeDefaultWorkflowPolicy = (): WorkflowPolicyShape => {
  const policy: WorkflowPolicyShape = {
    assertReady: (issue) =>
      Effect.gen(function* () {
        if (!hasSectionContent(issue.body, "Acceptance Criteria")) {
          return yield* Effect.fail(
            workflowError(
              `Issue ${issue.id} cannot be ready without acceptance criteria`,
              issue.id,
            ),
          );
        }

        if (
          issue.frontmatter.planningNotRequired !== true &&
          !hasSectionContent(issue.body, "Implementation Plan")
        ) {
          return yield* Effect.fail(
            workflowError(
              `Issue ${issue.id} cannot be ready without an implementation plan`,
              issue.id,
            ),
          );
        }
      }),
    assertTransitionAllowed: (from, to, actor, issue) =>
      Effect.gen(function* () {
        const fromKey = normalizeKey(from);
        const toKey = normalizeKey(to);
        const allowed = defaultTransitions[fromKey] ?? [];

        if (!allowed.includes(toKey)) {
          return yield* Effect.fail(
            workflowError(`Transition from ${fromKey} to ${toKey} is not allowed`, issue.id),
          );
        }

        if (toKey === "ready") {
          yield* policy.assertReady(issue);
        }

        if (toKey === "done" && actor.type !== "human") {
          return yield* Effect.fail(
            workflowError(`Only a human actor can mark issue ${issue.id} done`, issue.id),
          );
        }
      }),
    defaultIssueBody: () => defaultIssueBody(),
    protectedSections: [...DEFAULT_PROTECTED_SECTIONS],
  };

  return policy;
};

export const WorkflowPolicyDefault = Layer.succeed(
  WorkflowPolicy,
  WorkflowPolicy.of(makeDefaultWorkflowPolicy()),
);
