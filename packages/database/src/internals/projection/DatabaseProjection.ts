import { Context, Effect, Layer } from "effect";
import type { MaterializationProjectionReader } from "../materialization/MaterializationTypes.ts";
import {
  ProjectionCatalogStore,
  type ProjectionCatalogStoreShape,
} from "./ProjectionCatalogStore.ts";
import { ProjectionInboxStore, type ProjectionInboxStoreShape } from "./ProjectionInboxStore.ts";
import { ProjectionPageStore, type ProjectionPageStoreShape } from "./ProjectionPageStore.ts";
import {
  ProjectionRepositoryStore,
  type ProjectionRepositoryStoreShape,
} from "./ProjectionRepositoryStore.ts";
import { ProjectionTicketStore, type ProjectionTicketStoreShape } from "./ProjectionTicketStore.ts";
import { ProjectionWriter, type ProjectionWriterShape } from "./ProjectionWriter.ts";

export type DatabaseProjection = MaterializationProjectionReader & {
  readonly catalog: ProjectionCatalogStoreShape;
  readonly inbox: ProjectionInboxStoreShape;
  readonly pages: ProjectionPageStoreShape;
  readonly repositories: ProjectionRepositoryStoreShape;
  readonly tickets: ProjectionTicketStoreShape;
  readonly writer: ProjectionWriterShape;
} & Pick<
    ProjectionCatalogStoreShape,
    | "getTemplate"
    | "getUser"
    | "getView"
    | "listLabels"
    | "listTemplates"
    | "listUsers"
    | "listViews"
  > &
  Pick<
    ProjectionTicketStoreShape,
    | "getTicket"
    | "listTickets"
    | "recordVisible"
    | "repositoryHistory"
    | "searchTickets"
    | "ticketComments"
    | "ticketRecords"
    | "ticketVisible"
  > & {
    readonly archiveInboxItems: ProjectionInboxStoreShape["archive"];
    readonly inboxSummary: ProjectionInboxStoreShape["summary"];
    readonly listInbox: ProjectionInboxStoreShape["list"];
    readonly listRepositories: ProjectionRepositoryStoreShape["list"];
    readonly markInboxRead: ProjectionInboxStoreShape["markRead"];
    readonly markInboxUnread: ProjectionInboxStoreShape["markUnread"];
    readonly registerRepository: ProjectionRepositoryStoreShape["register"];
    readonly repositoryStatus: ProjectionRepositoryStoreShape["status"];
    readonly setCycleRepositoryMetadata: ProjectionRepositoryStoreShape["setCycleMetadata"];
    readonly warnings: ProjectionRepositoryStoreShape["warnings"];
  };

export const makeDatabaseProjection = (services: {
  readonly catalog: ProjectionCatalogStoreShape;
  readonly inbox: ProjectionInboxStoreShape;
  readonly pages: ProjectionPageStoreShape;
  readonly repositories: ProjectionRepositoryStoreShape;
  readonly tickets: ProjectionTicketStoreShape;
  readonly writer: ProjectionWriterShape;
}): DatabaseProjection => ({
  ...services,
  archiveInboxItems: services.inbox.archive,
  getTemplate: services.catalog.getTemplate,
  getTicket: services.tickets.getTicket,
  getUser: services.catalog.getUser,
  getView: services.catalog.getView,
  inboxSummary: services.inbox.summary,
  listInbox: services.inbox.list,
  listLabels: services.catalog.listLabels,
  listRepositories: services.repositories.list,
  listTemplates: services.catalog.listTemplates,
  listTickets: services.tickets.listTickets,
  listUsers: services.catalog.listUsers,
  listViews: services.catalog.listViews,
  markInboxRead: services.inbox.markRead,
  markInboxUnread: services.inbox.markUnread,
  recordVisible: services.tickets.recordVisible,
  registerRepository: services.repositories.register,
  repositoryHistory: services.tickets.repositoryHistory,
  repositoryStatus: services.repositories.status,
  searchTickets: services.tickets.searchTickets,
  setCycleRepositoryMetadata: services.repositories.setCycleMetadata,
  ticketComments: services.tickets.ticketComments,
  ticketRecords: services.tickets.ticketRecords,
  ticketVisible: services.tickets.ticketVisible,
  warnings: services.repositories.warnings,
});

export class DatabaseProjectionService extends Context.Service<
  DatabaseProjectionService,
  DatabaseProjection
>()("@cycle/database/internals/projection/DatabaseProjection") {}

export const DatabaseProjectionLive = Layer.effect(
  DatabaseProjectionService,
  Effect.gen(function* () {
    const catalog = yield* ProjectionCatalogStore;
    const inbox = yield* ProjectionInboxStore;
    const pages = yield* ProjectionPageStore;
    const repositories = yield* ProjectionRepositoryStore;
    const tickets = yield* ProjectionTicketStore;
    const writer = yield* ProjectionWriter;
    return DatabaseProjectionService.of(
      makeDatabaseProjection({ catalog, inbox, pages, repositories, tickets, writer }),
    );
  }),
);
