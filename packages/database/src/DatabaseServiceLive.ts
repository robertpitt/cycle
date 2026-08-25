import { makeSqliteLayer } from "@cycle/sqlite";
import { Effect, Layer } from "effect";
import { databaseProjectionMigrations } from "./DatabaseProjectionMigrations.ts";
import { DatabaseService, type DatabaseServiceOptions } from "./DatabaseService.ts";
import { assembleDatabaseService } from "./DatabaseServiceAssembly.ts";
import { CommandWriterLive } from "./internals/commands/CommandWriter.ts";
import { DraftCommands, DraftCommandsLive } from "./internals/commands/DraftCommands.ts";
import { InboxOperations, InboxOperationsLive } from "./internals/commands/InboxOperations.ts";
import {
  MetadataOperations,
  MetadataOperationsLive,
} from "./internals/commands/MetadataOperations.ts";
import { PageCommands, PageCommandsLive } from "./internals/commands/PageCommands.ts";
import { TicketCommands, TicketCommandsLive } from "./internals/commands/TicketCommands.ts";
import {
  DatabaseProjectionLive,
  DatabaseProjectionService,
} from "./internals/projection/DatabaseProjection.ts";
import { ProjectionCatalogStoreLive } from "./internals/projection/ProjectionCatalogStore.ts";
import { ProjectionInboxStoreLive } from "./internals/projection/ProjectionInboxStore.ts";
import { ProjectionPageStoreLive } from "./internals/projection/ProjectionPageStore.ts";
import { ProjectionRepositoryStoreLive } from "./internals/projection/ProjectionRepositoryStore.ts";
import { ProjectionTicketStoreLive } from "./internals/projection/ProjectionTicketStore.ts";
import { ProjectionWriterLive } from "./internals/projection/ProjectionWriter.ts";
import { RepositoryRegistryLive } from "./internals/RepositoryRegistry.ts";
import {
  RepositoryCoordinator,
  RepositoryCoordinatorLive,
} from "./internals/repository/RepositoryCoordinator.ts";
import { RepositoryPermitLive } from "./internals/repository/RepositoryPermit.ts";
import { WriteCoordinatorLive } from "./internals/repository/WriteCoordinator.ts";

const DEFAULT_PROJECTION_PATH = ":memory:";

const ProjectionStoresLive = Layer.mergeAll(
  ProjectionCatalogStoreLive,
  ProjectionInboxStoreLive,
  ProjectionRepositoryStoreLive,
  ProjectionTicketStoreLive.pipe(Layer.provideMerge(ProjectionPageStoreLive)),
);

const ProjectionInfrastructureLive = DatabaseProjectionLive.pipe(
  Layer.provideMerge(ProjectionWriterLive.pipe(Layer.provideMerge(ProjectionStoresLive))),
);

const RepositoryCoordinatorLayer = RepositoryCoordinatorLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(ProjectionInfrastructureLive, RepositoryRegistryLive, RepositoryPermitLive),
  ),
);

const WriteCoordinatorLayer = WriteCoordinatorLive.pipe(
  Layer.provideMerge(RepositoryCoordinatorLayer),
);

const CommandWriterLayer = CommandWriterLive.pipe(Layer.provideMerge(WriteCoordinatorLayer));

const DatabaseInternalsLive = Layer.mergeAll(
  DraftCommandsLive,
  InboxOperationsLive,
  MetadataOperationsLive,
  PageCommandsLive,
  TicketCommandsLive,
).pipe(Layer.provideMerge(CommandWriterLayer));

const makeDatabaseServiceLayer = (options: DatabaseServiceOptions) =>
  Layer.effect(
    DatabaseService,
    Effect.gen(function* () {
      const coordinator = yield* RepositoryCoordinator;
      const drafts = yield* DraftCommands;
      const inbox = yield* InboxOperations;
      const metadata = yield* MetadataOperations;
      const pages = yield* PageCommands;
      const projection = yield* DatabaseProjectionService;
      const tickets = yield* TicketCommands;

      return DatabaseService.of(
        assembleDatabaseService(projection, coordinator, drafts, inbox, metadata, pages, tickets),
      );
    }),
  ).pipe(
    Layer.provide(DatabaseInternalsLive),
    Layer.provide(
      makeSqliteLayer({
        filename: options.projectionPath ?? DEFAULT_PROJECTION_PATH,
        migrations: databaseProjectionMigrations,
      }),
    ),
  );

export const DatabaseLive = makeDatabaseServiceLayer({});

export const DatabaseLiveWithOptions = (options: DatabaseServiceOptions) =>
  makeDatabaseServiceLayer(options);
