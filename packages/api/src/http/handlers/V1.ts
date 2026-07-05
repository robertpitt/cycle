import { HttpApiBuilder } from "effect/unstable/httpapi";
import { CycleHttpApi } from "../CycleHttpApi.ts";
import * as agentTasks from "./v1/agentTasks.ts";
import * as agents from "./v1/agents.ts";
import * as autocompleteHandlers from "./v1/autocomplete.ts";
import * as automation from "./v1/automation.ts";
import * as comments from "./v1/comments.ts";
import * as drafts from "./v1/drafts.ts";
import * as inbox from "./v1/inbox.ts";
import * as initiatives from "./v1/initiatives.ts";
import * as issues from "./v1/issues.ts";
import * as labels from "./v1/labels.ts";
import * as repositories from "./v1/repositories.ts";
import * as settings from "./v1/settings.ts";
import * as templates from "./v1/templates.ts";
import * as users from "./v1/users.ts";
import * as views from "./v1/views.ts";

export const V1ApiHandlers = HttpApiBuilder.group(CycleHttpApi, "v1", (handlers) =>
  handlers
    .handle("status", repositories.status)
    .handle("autocomplete", autocompleteHandlers.autocomplete)
    .handle("listRepositories", repositories.listRepositories)
    .handle("openRepository", repositories.openRepository)
    .handle("getRepository", repositories.getRepository)
    .handle("listRepositoryWarnings", repositories.listRepositoryWarnings)
    .handle("listRepositoryHistory", repositories.listRepositoryHistory)
    .handle("syncRepository", repositories.syncRepository)
    .handle("pushRepository", repositories.pushRepository)
    .handle("listAgentProviders", agents.listAgentProviders)
    .handle("updateAgentProviderPreference", settings.updateAgentProviderPreference)
    .handle("createAgentTask", agentTasks.createAgentTask)
    .handle("createIssueAgentTask", agentTasks.createIssueAgentTask)
    .handle("listAgentTasks", agentTasks.listAgentTasks)
    .handle("getAgentTask", agentTasks.getAgentTask)
    .handle("listAgentTaskEvents", agentTasks.listAgentTaskEvents)
    .handle("appendAgentTaskInput", agentTasks.appendAgentTaskInput)
    .handle("cancelAgentTask", agentTasks.cancelAgentTask)
    .handle("retryAgentTask", agentTasks.retryAgentTask)
    .handle("getAppConfig", settings.getAppConfig)
    .handle("updateProfile", settings.updateProfile)
    .handle("completeOnboarding", settings.completeOnboarding)
    .handle("setThemePreference", settings.setThemePreference)
    .handle("setInterfaceDensity", settings.setInterfaceDensity)
    .handle("updateRepositoryPreferences", settings.updateRepositoryPreferences)
    .handle("removeRepository", settings.removeRepository)
    .handle("listInbox", inbox.listInbox)
    .handle("inboxSummary", inbox.inboxSummary)
    .handle("markInboxRead", inbox.markInboxRead)
    .handle("markInboxUnread", inbox.markInboxUnread)
    .handle("archiveInbox", inbox.archiveInbox)
    .handle("listIssues", issues.listIssues)
    .handle("createIssue", issues.createIssue)
    .handle("getIssue", issues.getIssue)
    .handle("updateIssue", issues.updateIssue)
    .handle("transitionIssue", issues.transitionIssue)
    .handle("archiveIssue", issues.archiveIssue)
    .handle("restoreIssue", issues.restoreIssue)
    .handle("listIssueHistory", issues.listIssueHistory)
    .handle("getIssueRevision", issues.getIssueRevision)
    .handle("diffIssue", issues.diffIssue)
    .handle("addIssueRelation", issues.addIssueRelation)
    .handle("removeIssueRelation", issues.removeIssueRelation)
    .handle("listIssueRecords", issues.listIssueRecords)
    .handle("addIssueRecord", issues.addIssueRecord)
    .handle("listIssueComments", comments.listIssueComments)
    .handle("addIssueComment", comments.addIssueComment)
    .handle("createDraft", drafts.createDraft)
    .handle("updateDraft", drafts.updateDraft)
    .handle("commitDraft", drafts.commitDraft)
    .handle("listLabels", labels.listLabels)
    .handle("upsertLabel", labels.upsertLabel)
    .handle("archiveLabel", labels.archiveLabel)
    .handle("listUsers", users.listUsers)
    .handle("getUser", users.getUser)
    .handle("upsertUser", users.upsertUser)
    .handle("listViews", views.listViews)
    .handle("createView", views.createView)
    .handle("getView", views.getView)
    .handle("updateView", views.updateView)
    .handle("archiveView", views.archiveView)
    .handle("listTemplates", templates.listTemplates)
    .handle("createTemplate", templates.createTemplate)
    .handle("getTemplate", templates.getTemplate)
    .handle("updateTemplate", templates.updateTemplate)
    .handle("archiveTemplate", templates.archiveTemplate)
    .handle("createInitiative", initiatives.createInitiative)
    .handle("getInitiativeProgress", initiatives.getInitiativeProgress)
    .handle("addInitiativeUpdate", initiatives.addInitiativeUpdate)
    .handle("evaluateAutomation", automation.evaluateAutomation),
);
