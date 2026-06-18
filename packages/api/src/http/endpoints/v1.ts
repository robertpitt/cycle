import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { CycleAuthorization } from "../authorization.ts";
import {
  AcceptedResourceEnvelope,
  AnyPayload,
  CollectionEnvelope,
  CreatedResourceEnvelope,
  DraftParams,
  InitiativeParams,
  IssueCommentParams,
  IssueParams,
  IssueRevisionParams,
  LabelParams,
  RepositoryParams,
  ResourceEnvelope,
  TemplateParams,
  UserParams,
  ViewParams,
} from "../schemas.ts";

export class V1ApiGroup extends HttpApiGroup.make("v1", { topLevel: true })
  .add(
    HttpApiEndpoint.get("status", "/v1/status", { success: ResourceEnvelope }),
    HttpApiEndpoint.get("autocomplete", "/v1/autocomplete", { success: ResourceEnvelope }),
    HttpApiEndpoint.get("listRepositories", "/v1/repositories", { success: CollectionEnvelope }),
    HttpApiEndpoint.post("openRepository", "/v1/repositories", {
      payload: AnyPayload,
      success: CreatedResourceEnvelope,
    }),
    HttpApiEndpoint.get("getRepository", "/v1/repositories/:repositoryId", {
      params: RepositoryParams,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.get("listRepositoryWarnings", "/v1/repositories/:repositoryId/warnings", {
      params: RepositoryParams,
      success: CollectionEnvelope,
    }),
    HttpApiEndpoint.get("listRepositoryHistory", "/v1/repositories/:repositoryId/history", {
      params: RepositoryParams,
      success: CollectionEnvelope,
    }),
    HttpApiEndpoint.post("syncRepository", "/v1/repositories/:repositoryId/sync", {
      params: RepositoryParams,
      success: AcceptedResourceEnvelope,
    }),
    HttpApiEndpoint.post("pushRepository", "/v1/repositories/:repositoryId/push", {
      params: RepositoryParams,
      success: AcceptedResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listAgentProviders", "/v1/agents/providers", {
      success: ResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("getAppConfig", "/v1/app-config", {
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.patch("updateProfile", "/v1/profile", {
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.post("completeOnboarding", "/v1/profile/onboarding", {
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.patch("setThemePreference", "/v1/theme", {
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.patch(
      "updateRepositoryPreferences",
      "/v1/repositories/:repositoryId/preferences",
      {
        params: RepositoryParams,
        payload: AnyPayload,
        success: ResourceEnvelope,
      },
    ),
  )
  .add(
    HttpApiEndpoint.get("listInbox", "/v1/inbox", {
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.get("inboxSummary", "/v1/inbox/summary", {
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.post("markInboxRead", "/v1/inbox/read", {
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.post("markInboxUnread", "/v1/inbox/unread", {
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.post("archiveInbox", "/v1/inbox/archive", {
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listIssues", "/v1/repositories/:repositoryId/issues", {
      params: RepositoryParams,
      success: CollectionEnvelope,
    }),
    HttpApiEndpoint.post("createIssue", "/v1/repositories/:repositoryId/issues", {
      params: RepositoryParams,
      payload: AnyPayload,
      success: CreatedResourceEnvelope,
    }),
    HttpApiEndpoint.get("getIssue", "/v1/repositories/:repositoryId/issues/:issueId", {
      params: IssueParams,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.patch("updateIssue", "/v1/repositories/:repositoryId/issues/:issueId", {
      params: IssueParams,
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.post(
      "transitionIssue",
      "/v1/repositories/:repositoryId/issues/:issueId/transitions",
      {
        params: IssueParams,
        payload: Schema.Struct({ reason: Schema.optional(Schema.String), status: Schema.String }),
        success: ResourceEnvelope,
      },
    ),
    HttpApiEndpoint.post("archiveIssue", "/v1/repositories/:repositoryId/issues/:issueId/archive", {
      params: IssueParams,
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.post("restoreIssue", "/v1/repositories/:repositoryId/issues/:issueId/restore", {
      params: IssueParams,
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.get(
      "listIssueHistory",
      "/v1/repositories/:repositoryId/issues/:issueId/history",
      { params: IssueParams, success: CollectionEnvelope },
    ),
    HttpApiEndpoint.get(
      "getIssueRevision",
      "/v1/repositories/:repositoryId/issues/:issueId/revisions/:snapshotId",
      { params: IssueRevisionParams, success: ResourceEnvelope },
    ),
    HttpApiEndpoint.get("diffIssue", "/v1/repositories/:repositoryId/issues/:issueId/diffs", {
      params: IssueParams,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.post(
      "addIssueRelation",
      "/v1/repositories/:repositoryId/issues/:issueId/relations",
      { params: IssueParams, payload: AnyPayload, success: ResourceEnvelope },
    ),
    HttpApiEndpoint.post(
      "removeIssueRelation",
      "/v1/repositories/:repositoryId/issues/:issueId/relations/remove",
      { params: IssueParams, payload: AnyPayload, success: ResourceEnvelope },
    ),
    HttpApiEndpoint.get(
      "listIssueRecords",
      "/v1/repositories/:repositoryId/issues/:issueId/records",
      { params: IssueParams, success: CollectionEnvelope },
    ),
    HttpApiEndpoint.post(
      "addIssueRecord",
      "/v1/repositories/:repositoryId/issues/:issueId/records",
      { params: IssueParams, payload: AnyPayload, success: CreatedResourceEnvelope },
    ),
  )
  .add(
    HttpApiEndpoint.get(
      "listIssueComments",
      "/v1/repositories/:repositoryId/issues/:issueId/comments",
      { params: IssueParams, success: CollectionEnvelope },
    ),
    HttpApiEndpoint.post(
      "addIssueComment",
      "/v1/repositories/:repositoryId/issues/:issueId/comments",
      {
        params: IssueParams,
        payload: Schema.Struct({ body: Schema.String }),
        success: CreatedResourceEnvelope,
      },
    ),
    HttpApiEndpoint.post(
      "archiveIssueComment",
      "/v1/repositories/:repositoryId/issues/:issueId/comments/:commentId/archive",
      { params: IssueCommentParams, payload: AnyPayload, success: ResourceEnvelope },
    ),
  )
  .add(
    HttpApiEndpoint.post("createDraft", "/v1/repositories/:repositoryId/drafts", {
      params: RepositoryParams,
      payload: AnyPayload,
      success: CreatedResourceEnvelope,
    }),
    HttpApiEndpoint.patch("updateDraft", "/v1/repositories/:repositoryId/drafts/:draftId", {
      params: DraftParams,
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.post("commitDraft", "/v1/repositories/:repositoryId/drafts/:draftId/commit", {
      params: DraftParams,
      success: ResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listLabels", "/v1/repositories/:repositoryId/labels", {
      params: RepositoryParams,
      success: CollectionEnvelope,
    }),
    HttpApiEndpoint.put("upsertLabel", "/v1/repositories/:repositoryId/labels/:labelId", {
      params: LabelParams,
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.post("archiveLabel", "/v1/repositories/:repositoryId/labels/:labelId/archive", {
      params: LabelParams,
      success: ResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listUsers", "/v1/repositories/:repositoryId/users", {
      params: RepositoryParams,
      success: CollectionEnvelope,
    }),
    HttpApiEndpoint.get("getUser", "/v1/repositories/:repositoryId/users/:userId", {
      params: UserParams,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.put("upsertUser", "/v1/repositories/:repositoryId/users/:userId", {
      params: UserParams,
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listViews", "/v1/repositories/:repositoryId/views", {
      params: RepositoryParams,
      success: CollectionEnvelope,
    }),
    HttpApiEndpoint.post("createView", "/v1/repositories/:repositoryId/views", {
      params: RepositoryParams,
      payload: AnyPayload,
      success: CreatedResourceEnvelope,
    }),
    HttpApiEndpoint.get("getView", "/v1/repositories/:repositoryId/views/:viewId", {
      params: ViewParams,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.patch("updateView", "/v1/repositories/:repositoryId/views/:viewId", {
      params: ViewParams,
      payload: AnyPayload,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.post("archiveView", "/v1/repositories/:repositoryId/views/:viewId/archive", {
      params: ViewParams,
      success: ResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listTemplates", "/v1/repositories/:repositoryId/templates", {
      params: RepositoryParams,
      success: CollectionEnvelope,
    }),
    HttpApiEndpoint.post("createTemplate", "/v1/repositories/:repositoryId/templates", {
      params: RepositoryParams,
      payload: AnyPayload,
      success: CreatedResourceEnvelope,
    }),
    HttpApiEndpoint.get("getTemplate", "/v1/repositories/:repositoryId/templates/:templateId", {
      params: TemplateParams,
      success: ResourceEnvelope,
    }),
    HttpApiEndpoint.patch(
      "updateTemplate",
      "/v1/repositories/:repositoryId/templates/:templateId",
      { params: TemplateParams, payload: AnyPayload, success: ResourceEnvelope },
    ),
    HttpApiEndpoint.post(
      "archiveTemplate",
      "/v1/repositories/:repositoryId/templates/:templateId/archive",
      { params: TemplateParams, success: ResourceEnvelope },
    ),
  )
  .add(
    HttpApiEndpoint.post("createInitiative", "/v1/repositories/:repositoryId/initiatives", {
      params: RepositoryParams,
      payload: AnyPayload,
      success: CreatedResourceEnvelope,
    }),
    HttpApiEndpoint.get(
      "getInitiativeProgress",
      "/v1/repositories/:repositoryId/initiatives/:initiativeId/progress",
      { params: InitiativeParams, success: ResourceEnvelope },
    ),
    HttpApiEndpoint.post(
      "addInitiativeUpdate",
      "/v1/repositories/:repositoryId/initiatives/:initiativeId/updates",
      { params: InitiativeParams, payload: AnyPayload, success: CreatedResourceEnvelope },
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "evaluateAutomation",
      "/v1/repositories/:repositoryId/automation/evaluations",
      { params: RepositoryParams, payload: AnyPayload, success: ResourceEnvelope },
    ),
  )
  .middleware(CycleAuthorization)
  .annotateMerge(
    OpenApi.annotations({
      title: "Cycle v1",
      description: "Local authenticated Cycle API routes.",
    }),
  ) {}
