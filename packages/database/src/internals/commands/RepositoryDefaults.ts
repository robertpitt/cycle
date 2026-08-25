import {
  CURRENT_SCHEMA_VERSION,
  type Actor,
  type IssueTemplateDocument,
  type LabelDefinitionDocument,
  type SavedViewDocument,
  type TicketQuery,
} from "../../domain/index.ts";
export const defaultRepositoryMetadata = (
  actor: Actor,
  now: string,
  actorUserId: string | undefined,
): {
  readonly labels: ReadonlyArray<LabelDefinitionDocument>;
  readonly templates: ReadonlyArray<IssueTemplateDocument>;
  readonly views: ReadonlyArray<SavedViewDocument>;
} => {
  const label = (
    id: string,
    name: string,
    color: string,
    description: string,
  ): LabelDefinitionDocument => ({
    color,
    createdAt: now,
    createdBy: actor,
    description,
    id,
    name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: now,
  });
  const view = (
    id: string,
    name: string,
    query: TicketQuery,
    groupBy: SavedViewDocument["groupBy"] = "status",
  ): SavedViewDocument => ({
    builtIn: true,
    createdAt: now,
    createdBy: actor,
    groupBy,
    id,
    kind: "list",
    name,
    pinned: true,
    query,
    repositoryScope: "current-repository",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sort: {
      direction: "desc",
      field: "updatedAt",
    },
    updatedAt: now,
  });
  const template = (
    id: string,
    name: string,
    kind: IssueTemplateDocument["kind"],
    titleTemplate: string,
    bodyTemplate: string,
    defaults: IssueTemplateDocument["defaults"] = {},
  ): IssueTemplateDocument => ({
    active: true,
    bodyTemplate,
    createdAt: now,
    createdBy: actor,
    defaults,
    id,
    kind,
    name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    titleTemplate,
    updatedAt: now,
  });

  return {
    labels: [
      label("bug", "Bug", "red", "Defects, regressions, and broken expected behavior."),
      label("feature", "Feature", "blue", "New user-facing capability or product workflow."),
      label("improvement", "Improvement", "green", "Incremental refinement to existing behavior."),
      label("qa", "QA", "amber", "Validation, test coverage, and release confidence work."),
    ],
    templates: [
      template(
        "bug",
        "Bug report",
        "bug",
        "{{title}}",
        "## Expected\n\n## Actual\n\n## Steps to reproduce\n\n## Environment\n",
        {
          labels: ["bug"],
          priority: "high",
          type: "bug",
        },
      ),
      template(
        "feature",
        "Feature",
        "feature",
        "{{title}}",
        "## Context\n\n## Outcome\n\n## Acceptance criteria\n\n## Risks\n",
        {
          labels: ["feature"],
          priority: "medium",
          type: "feature",
        },
      ),
      template(
        "implementation",
        "Implementation task",
        "implementation",
        "{{title}}",
        "## Scope\n\n## Plan\n\n## Verification\n",
        {
          labels: ["improvement"],
          priority: "medium",
          type: "task",
        },
      ),
      template("qa", "QA task", "qa", "{{title}}", "## Test focus\n\n## Scenarios\n\n## Notes\n", {
        labels: ["qa"],
        priority: "medium",
        type: "task",
      }),
      template(
        "initiative",
        "Initiative",
        "initiative",
        "{{title}}",
        "## Outcome\n\n## Scope\n\n## Progress updates\n",
        {
          priority: "medium",
          type: "epic",
        },
      ),
    ],
    views: [
      view("triage", "Triage", {
        hasAssignee: false,
        statusIn: ["backlog", "todo"],
      }),
      view("open-bugs", "Open bugs", {
        labelIn: ["bug"],
        statusIn: ["backlog", "todo", "in-progress"],
      }),
      ...(actorUserId === undefined
        ? []
        : [
            view(
              "assigned-to-me",
              "Assigned to me",
              {
                assigneeIn: [actorUserId],
                statusIn: ["backlog", "todo", "in-progress"],
              },
              "priority",
            ),
          ]),
      view(
        "review-queue",
        "Review queue",
        {
          statusIn: ["in-progress"],
        },
        "assignee",
      ),
      view(
        "stale-backlog",
        "Stale backlog",
        {
          statusIn: ["backlog"],
        },
        "priority",
      ),
      view("blocked-work", "Blocked work", {
        blocked: true,
      }),
    ],
  };
};
