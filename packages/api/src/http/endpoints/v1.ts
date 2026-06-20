import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { CycleAuthorization } from "../authorization.ts";
import {
  AgentProvidersResourceEnvelope,
  ApiStatusResourceEnvelope,
  AppConfigResourceEnvelope,
  AutocompleteQueryParams,
  AutocompleteResourceEnvelope,
  AutomationEvaluatePayload,
  AutomationEvaluationResourceEnvelope,
  CompleteOnboardingPayload,
  DraftParams,
  DraftCreatePayload,
  DraftDocumentCreatedEnvelope,
  DraftDocumentResourceEnvelope,
  DraftUpdatePayload,
  InboxMutationPayload,
  InboxMutationResourceEnvelope,
  InboxPageResourceEnvelope,
  InboxQueryParams,
  InboxSummaryResourceEnvelope,
  InitiativeCreatedEnvelope,
  InitiativeCreatePayload,
  InitiativeParams,
  InitiativeProgressResourceEnvelope,
  InitiativeUpdateCreatedEnvelope,
  InitiativeUpdatePayload,
  HttpHistoryCollectionEnvelope,
  IssueCommentParams,
  IssueCommentAddPayload,
  IssueCreatePayload,
  IssueDiffQueryParams,
  IssueHistoryQueryParams,
  IssueListQueryParams,
  IssueParams,
  IssueReasonPayload,
  IssueRecordAddPayload,
  IssueRelationPayload,
  IssueRevisionParams,
  IssueTransitionPayload,
  IssueUpdatePayload,
  HttpLabelCollectionEnvelope,
  HttpLabelResourceEnvelope,
  HttpRecordCollectionEnvelope,
  HttpRecordCreatedEnvelope,
  HttpRecordResourceEnvelope,
  HttpTemplateCollectionEnvelope,
  HttpTemplateResourceEnvelope,
  HttpTicketCollectionEnvelope,
  HttpTicketCreatedEnvelope,
  HttpTicketResourceEnvelope,
  HttpTicketRevisionDiffEnvelope,
  HttpTicketSearchCollectionEnvelope,
  HttpUserCollectionEnvelope,
  HttpUserResourceEnvelope,
  HttpViewCollectionEnvelope,
  HttpViewResourceEnvelope,
  LabelParams,
  LabelPayload,
  LabelQueryParams,
  ProfileResourceEnvelope,
  ProfileUpdatePayload,
  RepositoryCollectionQuery,
  RepositoryHistoryCollectionEnvelope,
  RepositoryHistoryQuery,
  RepositoryOpenPayload,
  RepositoryParams,
  RepositoryPushAcceptedEnvelope,
  RepositoryRecordNullableResourceEnvelope,
  RepositoryStatusAcceptedEnvelope,
  RepositoryStatusCollectionEnvelope,
  RepositoryStatusCreatedEnvelope,
  RepositoryStatusResourceEnvelope,
  RepositoryWarningCollectionEnvelope,
  RepositoryPreferencesPayload,
  RecordListQueryParams,
  TemplateCreatePayload,
  TemplateCreatedEnvelope,
  TemplateParams,
  TemplateQueryParams,
  TemplateUpdatePayload,
  ThemePreferencePayload,
  TicketDocumentResourceEnvelope,
  UserParams,
  UserPayload,
  UserQueryParams,
  ViewCreatePayload,
  ViewCreatedEnvelope,
  ViewParams,
  ViewQueryParams,
  ViewUpdatePayload,
} from "../schemas.ts";

export class V1ApiGroup extends HttpApiGroup.make("v1", { topLevel: true })
  .add(
    HttpApiEndpoint.get("status", "/v1/status", { success: ApiStatusResourceEnvelope }),
    HttpApiEndpoint.get("autocomplete", "/v1/autocomplete", {
      query: AutocompleteQueryParams,
      success: AutocompleteResourceEnvelope,
    }),
    HttpApiEndpoint.get("listRepositories", "/v1/repositories", {
      query: RepositoryCollectionQuery.fields,
      success: RepositoryStatusCollectionEnvelope,
    }),
    HttpApiEndpoint.post("openRepository", "/v1/repositories", {
      payload: RepositoryOpenPayload,
      success: RepositoryStatusCreatedEnvelope,
    }),
    HttpApiEndpoint.get("getRepository", "/v1/repositories/:repositoryId", {
      params: RepositoryParams,
      success: RepositoryStatusResourceEnvelope,
    }),
    HttpApiEndpoint.get("listRepositoryWarnings", "/v1/repositories/:repositoryId/warnings", {
      params: RepositoryParams,
      success: RepositoryWarningCollectionEnvelope,
    }),
    HttpApiEndpoint.get("listRepositoryHistory", "/v1/repositories/:repositoryId/history", {
      params: RepositoryParams,
      query: RepositoryHistoryQuery.fields,
      success: RepositoryHistoryCollectionEnvelope,
    }),
    HttpApiEndpoint.post("syncRepository", "/v1/repositories/:repositoryId/sync", {
      params: RepositoryParams,
      success: RepositoryStatusAcceptedEnvelope,
    }),
    HttpApiEndpoint.post("pushRepository", "/v1/repositories/:repositoryId/push", {
      params: RepositoryParams,
      success: RepositoryPushAcceptedEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listAgentProviders", "/v1/agents/providers", {
      success: AgentProvidersResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("getAppConfig", "/v1/app-config", {
      success: AppConfigResourceEnvelope,
    }),
    HttpApiEndpoint.patch("updateProfile", "/v1/profile", {
      payload: ProfileUpdatePayload,
      success: ProfileResourceEnvelope,
    }),
    HttpApiEndpoint.post("completeOnboarding", "/v1/profile/onboarding", {
      payload: CompleteOnboardingPayload,
      success: AppConfigResourceEnvelope,
    }),
    HttpApiEndpoint.patch("setThemePreference", "/v1/theme", {
      payload: ThemePreferencePayload,
      success: AppConfigResourceEnvelope,
    }),
    HttpApiEndpoint.patch(
      "updateRepositoryPreferences",
      "/v1/repositories/:repositoryId/preferences",
      {
        params: RepositoryParams,
        payload: RepositoryPreferencesPayload,
        success: RepositoryRecordNullableResourceEnvelope,
      },
    ),
  )
  .add(
    HttpApiEndpoint.get("listInbox", "/v1/inbox", {
      query: InboxQueryParams,
      success: InboxPageResourceEnvelope,
    }),
    HttpApiEndpoint.get("inboxSummary", "/v1/inbox/summary", {
      query: InboxQueryParams,
      success: InboxSummaryResourceEnvelope,
    }),
    HttpApiEndpoint.post("markInboxRead", "/v1/inbox/read", {
      payload: InboxMutationPayload,
      success: InboxMutationResourceEnvelope,
    }),
    HttpApiEndpoint.post("markInboxUnread", "/v1/inbox/unread", {
      payload: InboxMutationPayload,
      success: InboxMutationResourceEnvelope,
    }),
    HttpApiEndpoint.post("archiveInbox", "/v1/inbox/archive", {
      payload: InboxMutationPayload,
      success: InboxMutationResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listIssues", "/v1/repositories/:repositoryId/issues", {
      params: RepositoryParams,
      query: IssueListQueryParams,
      success: [HttpTicketCollectionEnvelope, HttpTicketSearchCollectionEnvelope],
    }),
    HttpApiEndpoint.post("createIssue", "/v1/repositories/:repositoryId/issues", {
      params: RepositoryParams,
      payload: IssueCreatePayload,
      success: HttpTicketCreatedEnvelope,
    }),
    HttpApiEndpoint.get("getIssue", "/v1/repositories/:repositoryId/issues/:issueId", {
      params: IssueParams,
      success: HttpTicketResourceEnvelope,
    }),
    HttpApiEndpoint.patch("updateIssue", "/v1/repositories/:repositoryId/issues/:issueId", {
      params: IssueParams,
      payload: IssueUpdatePayload,
      success: HttpTicketResourceEnvelope,
    }),
    HttpApiEndpoint.post(
      "transitionIssue",
      "/v1/repositories/:repositoryId/issues/:issueId/transitions",
      {
        params: IssueParams,
        payload: IssueTransitionPayload,
        success: HttpTicketResourceEnvelope,
      },
    ),
    HttpApiEndpoint.post("archiveIssue", "/v1/repositories/:repositoryId/issues/:issueId/archive", {
      params: IssueParams,
      payload: IssueReasonPayload,
      success: HttpTicketResourceEnvelope,
    }),
    HttpApiEndpoint.post("restoreIssue", "/v1/repositories/:repositoryId/issues/:issueId/restore", {
      params: IssueParams,
      payload: IssueReasonPayload,
      success: HttpTicketResourceEnvelope,
    }),
    HttpApiEndpoint.get(
      "listIssueHistory",
      "/v1/repositories/:repositoryId/issues/:issueId/history",
      {
        params: IssueParams,
        query: IssueHistoryQueryParams,
        success: HttpHistoryCollectionEnvelope,
      },
    ),
    HttpApiEndpoint.get(
      "getIssueRevision",
      "/v1/repositories/:repositoryId/issues/:issueId/revisions/:snapshotId",
      { params: IssueRevisionParams, success: HttpTicketResourceEnvelope },
    ),
    HttpApiEndpoint.get("diffIssue", "/v1/repositories/:repositoryId/issues/:issueId/diffs", {
      params: IssueParams,
      query: IssueDiffQueryParams,
      success: HttpTicketRevisionDiffEnvelope,
    }),
    HttpApiEndpoint.post(
      "addIssueRelation",
      "/v1/repositories/:repositoryId/issues/:issueId/relations",
      { params: IssueParams, payload: IssueRelationPayload, success: HttpTicketResourceEnvelope },
    ),
    HttpApiEndpoint.post(
      "removeIssueRelation",
      "/v1/repositories/:repositoryId/issues/:issueId/relations/remove",
      { params: IssueParams, payload: IssueRelationPayload, success: HttpTicketResourceEnvelope },
    ),
    HttpApiEndpoint.get(
      "listIssueRecords",
      "/v1/repositories/:repositoryId/issues/:issueId/records",
      { params: IssueParams, query: RecordListQueryParams, success: HttpRecordCollectionEnvelope },
    ),
    HttpApiEndpoint.post(
      "addIssueRecord",
      "/v1/repositories/:repositoryId/issues/:issueId/records",
      { params: IssueParams, payload: IssueRecordAddPayload, success: HttpRecordCreatedEnvelope },
    ),
  )
  .add(
    HttpApiEndpoint.get(
      "listIssueComments",
      "/v1/repositories/:repositoryId/issues/:issueId/comments",
      { params: IssueParams, query: RecordListQueryParams, success: HttpRecordCollectionEnvelope },
    ),
    HttpApiEndpoint.post(
      "addIssueComment",
      "/v1/repositories/:repositoryId/issues/:issueId/comments",
      {
        params: IssueParams,
        payload: IssueCommentAddPayload,
        success: HttpRecordCreatedEnvelope,
      },
    ),
    HttpApiEndpoint.post(
      "archiveIssueComment",
      "/v1/repositories/:repositoryId/issues/:issueId/comments/:commentId/archive",
      {
        params: IssueCommentParams,
        payload: IssueReasonPayload,
        success: HttpRecordResourceEnvelope,
      },
    ),
  )
  .add(
    HttpApiEndpoint.post("createDraft", "/v1/repositories/:repositoryId/drafts", {
      params: RepositoryParams,
      payload: DraftCreatePayload,
      success: DraftDocumentCreatedEnvelope,
    }),
    HttpApiEndpoint.patch("updateDraft", "/v1/repositories/:repositoryId/drafts/:draftId", {
      params: DraftParams,
      payload: DraftUpdatePayload,
      success: DraftDocumentResourceEnvelope,
    }),
    HttpApiEndpoint.post("commitDraft", "/v1/repositories/:repositoryId/drafts/:draftId/commit", {
      params: DraftParams,
      success: TicketDocumentResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listLabels", "/v1/repositories/:repositoryId/labels", {
      params: RepositoryParams,
      query: LabelQueryParams,
      success: HttpLabelCollectionEnvelope,
    }),
    HttpApiEndpoint.put("upsertLabel", "/v1/repositories/:repositoryId/labels/:labelId", {
      params: LabelParams,
      payload: LabelPayload,
      success: HttpLabelResourceEnvelope,
    }),
    HttpApiEndpoint.post("archiveLabel", "/v1/repositories/:repositoryId/labels/:labelId/archive", {
      params: LabelParams,
      success: HttpLabelResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listUsers", "/v1/repositories/:repositoryId/users", {
      params: RepositoryParams,
      query: UserQueryParams,
      success: HttpUserCollectionEnvelope,
    }),
    HttpApiEndpoint.get("getUser", "/v1/repositories/:repositoryId/users/:userId", {
      params: UserParams,
      success: HttpUserResourceEnvelope,
    }),
    HttpApiEndpoint.put("upsertUser", "/v1/repositories/:repositoryId/users/:userId", {
      params: UserParams,
      payload: UserPayload,
      success: HttpUserResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listViews", "/v1/repositories/:repositoryId/views", {
      params: RepositoryParams,
      query: ViewQueryParams,
      success: HttpViewCollectionEnvelope,
    }),
    HttpApiEndpoint.post("createView", "/v1/repositories/:repositoryId/views", {
      params: RepositoryParams,
      payload: ViewCreatePayload,
      success: ViewCreatedEnvelope,
    }),
    HttpApiEndpoint.get("getView", "/v1/repositories/:repositoryId/views/:viewId", {
      params: ViewParams,
      success: HttpViewResourceEnvelope,
    }),
    HttpApiEndpoint.patch("updateView", "/v1/repositories/:repositoryId/views/:viewId", {
      params: ViewParams,
      payload: ViewUpdatePayload,
      success: HttpViewResourceEnvelope,
    }),
    HttpApiEndpoint.post("archiveView", "/v1/repositories/:repositoryId/views/:viewId/archive", {
      params: ViewParams,
      success: HttpViewResourceEnvelope,
    }),
  )
  .add(
    HttpApiEndpoint.get("listTemplates", "/v1/repositories/:repositoryId/templates", {
      params: RepositoryParams,
      query: TemplateQueryParams,
      success: HttpTemplateCollectionEnvelope,
    }),
    HttpApiEndpoint.post("createTemplate", "/v1/repositories/:repositoryId/templates", {
      params: RepositoryParams,
      payload: TemplateCreatePayload,
      success: TemplateCreatedEnvelope,
    }),
    HttpApiEndpoint.get("getTemplate", "/v1/repositories/:repositoryId/templates/:templateId", {
      params: TemplateParams,
      success: HttpTemplateResourceEnvelope,
    }),
    HttpApiEndpoint.patch(
      "updateTemplate",
      "/v1/repositories/:repositoryId/templates/:templateId",
      {
        params: TemplateParams,
        payload: TemplateUpdatePayload,
        success: HttpTemplateResourceEnvelope,
      },
    ),
    HttpApiEndpoint.post(
      "archiveTemplate",
      "/v1/repositories/:repositoryId/templates/:templateId/archive",
      { params: TemplateParams, success: HttpTemplateResourceEnvelope },
    ),
  )
  .add(
    HttpApiEndpoint.post("createInitiative", "/v1/repositories/:repositoryId/initiatives", {
      params: RepositoryParams,
      payload: InitiativeCreatePayload,
      success: InitiativeCreatedEnvelope,
    }),
    HttpApiEndpoint.get(
      "getInitiativeProgress",
      "/v1/repositories/:repositoryId/initiatives/:initiativeId/progress",
      { params: InitiativeParams, success: InitiativeProgressResourceEnvelope },
    ),
    HttpApiEndpoint.post(
      "addInitiativeUpdate",
      "/v1/repositories/:repositoryId/initiatives/:initiativeId/updates",
      {
        params: InitiativeParams,
        payload: InitiativeUpdatePayload,
        success: InitiativeUpdateCreatedEnvelope,
      },
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "evaluateAutomation",
      "/v1/repositories/:repositoryId/automation/evaluations",
      {
        params: RepositoryParams,
        payload: AutomationEvaluatePayload,
        success: AutomationEvaluationResourceEnvelope,
      },
    ),
  )
  .middleware(CycleAuthorization)
  .annotateMerge(
    OpenApi.annotations({
      title: "Cycle v1",
      description: "Local authenticated Cycle API routes.",
    }),
  ) {}
