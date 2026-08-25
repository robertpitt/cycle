import { Effect } from "effect";
import type { DatabaseServiceShape } from "./DatabaseService.ts";
import type { AddCommentInput, CommitOptions } from "./domain/index.ts";
import type { DraftCommandsShape } from "./internals/commands/DraftCommands.ts";
import type { InboxOperationsShape } from "./internals/commands/InboxOperations.ts";
import type { MetadataOperationsShape } from "./internals/commands/MetadataOperations.ts";
import type { PageOperationsShape } from "./PageOperations.ts";
import type { TicketCommandsShape } from "./internals/commands/TicketCommands.ts";
import type { DatabaseProjection } from "./internals/projection/DatabaseProjection.ts";
import type { RepositoryCoordinatorShape } from "./internals/repository/RepositoryCoordinator.ts";

export const assembleDatabaseService = (
  projection: DatabaseProjection,
  coordinator: RepositoryCoordinatorShape,
  draftCommands: DraftCommandsShape,
  inboxOperations: InboxOperationsShape,
  metadataOperations: MetadataOperationsShape,
  pageOperations: PageOperationsShape,
  ticketCommands: TicketCommandsShape,
): DatabaseServiceShape => {
  const syncRepository = coordinator.sync;
  const pushRepository = coordinator.push;
  const rebuildRepository = coordinator.rebuild;
  const {
    addInitiativeUpdate,
    addRecord,
    archiveTicket,
    createInitiative,
    createTicket,
    deleteTicket,
    initiativeProgress,
    listIssueRelations,
    mutateIssueRelation,
    restoreTicket,
    ticketDiff,
    ticketRevision,
    updateTicket,
  } = ticketCommands;
  const { commitDraft, createDraft, listDrafts, updateDraft } = draftCommands;

  const {
    archiveLabel,
    archiveTemplate,
    createTemplate,
    createView,
    deleteView,
    updateTemplate,
    updateView,
    upsertLabel,
    upsertUser,
  } = metadataOperations;
  const { archiveInboxItems, inboxSummary, listInbox, markInboxRead, markInboxUnread } =
    inboxOperations;

  const addTicketComment = (
    repositoryId: string,
    ticketId: string,
    input: AddCommentInput,
    options?: CommitOptions,
  ) =>
    addRecord(
      repositoryId,
      ticketId,
      {
        payload: { body: input.body },
        recordType: "comment",
      },
      options,
    );

  const addComment: DatabaseServiceShape["addComment"] = ((
    targetOrRepositoryId: Parameters<typeof pageOperations.addComment>[0] | string,
    inputOrTicketId: Parameters<typeof pageOperations.addComment>[1] | string,
    optionsOrInput?: CommitOptions | AddCommentInput,
    legacyOptions?: CommitOptions,
  ) =>
    typeof targetOrRepositoryId === "string" && typeof inputOrTicketId === "string"
      ? addTicketComment(
          targetOrRepositoryId,
          inputOrTicketId,
          optionsOrInput as AddCommentInput,
          legacyOptions,
        )
      : pageOperations.addComment(
          targetOrRepositoryId as Parameters<typeof pageOperations.addComment>[0],
          inputOrTicketId as Parameters<typeof pageOperations.addComment>[1],
          optionsOrInput as CommitOptions | undefined,
        )) as DatabaseServiceShape["addComment"];

  return {
    ...pageOperations,
    addComment,
    addTicketComment,
    addIssueRelation: (repositoryId, ticketId, relation, options) =>
      mutateIssueRelation(repositoryId, ticketId, relation, "add", options),
    addInitiativeUpdate,
    addRecord,
    archiveInboxItems,
    archiveLabel,
    archiveTemplate,
    archiveTicket,
    commitDraft,
    createInitiative,
    createDraft,
    createTemplate,
    createTicket,
    createView,
    deleteView,
    deleteTicket,
    getTicket: projection.getTicket,
    getTemplate: projection.getTemplate,
    getUser: projection.getUser,
    getView: projection.getView,
    inboxSummary,
    initiativeProgress,
    listInbox,
    listDrafts,
    listIssueRelations,
    listLabels: projection.listLabels,
    listRepositories: projection.listRepositories,
    listTemplates: projection.listTemplates,
    listTickets: projection.listTickets,
    listUsers: projection.listUsers,
    listViews: projection.listViews,
    materializationWarnings: projection.warnings,
    markInboxRead,
    markInboxUnread,
    openRepository: coordinator.open,
    repositoryHistory: projection.repositoryHistory,
    pushRepository,
    rebuildRepository,
    repositoryStatus: projection.repositoryStatus,
    removeIssueRelation: (repositoryId, ticketId, relation, options) =>
      mutateIssueRelation(repositoryId, ticketId, relation, "remove", options),
    restoreTicket,
    searchTickets: projection.searchTickets,
    syncRepository,
    ticketComments: (repositoryId, ticketId, query = {}) =>
      projection
        .getTicket(repositoryId, ticketId)
        .pipe(
          Effect.flatMap((ticket) =>
            ticket === null
              ? Effect.succeed({ entries: [] })
              : projection.ticketComments(repositoryId, ticketId, query),
          ),
        ),
    ticketHistory: (repositoryId, ticketId, query = {}) =>
      projection.repositoryHistory(repositoryId, { ...query, ticketId }),
    ticketDiff,
    ticketRevision,
    ticketRecords: (repositoryId, ticketId, query = {}) =>
      projection
        .getTicket(repositoryId, ticketId)
        .pipe(
          Effect.flatMap((ticket) =>
            ticket === null
              ? Effect.succeed({ entries: [] })
              : projection.ticketRecords(repositoryId, ticketId, query),
          ),
        ),
    transitionTicket: (repositoryId, ticketId, input, options) =>
      updateTicket(repositoryId, ticketId, {
        frontmatter: {
          status: input.status,
        },
        message: options?.message,
      }),
    updateDraft,
    updateTemplate,
    updateTicket,
    updateView,
    upsertLabel,
    upsertUser,
  };
};
