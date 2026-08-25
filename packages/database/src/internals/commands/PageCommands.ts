import { Context, Effect, Layer } from "effect";
import { DatabaseIdGenerator } from "../../DatabaseIdGenerator.ts";
import { DatabaseIdentity } from "../../DatabaseIdentity.ts";
import { makePageOperations, type PageOperationsShape } from "../../PageOperations.ts";
import { RepositoryRegistry } from "../RepositoryRegistry.ts";
import { DatabaseProjectionService } from "../projection/DatabaseProjection.ts";
import { WriteCoordinator } from "../repository/WriteCoordinator.ts";
import { CommandWriter } from "./CommandWriter.ts";

export class PageCommands extends Context.Service<PageCommands, PageOperationsShape>()(
  "@cycle/database/internals/commands/PageCommands",
) {}

export const PageCommandsLive = Layer.effect(
  PageCommands,
  Effect.gen(function* () {
    const commandWriter = yield* CommandWriter;
    const ids = yield* DatabaseIdGenerator;
    const identity = yield* DatabaseIdentity;
    const projection = yield* DatabaseProjectionService;
    const registry = yield* RepositoryRegistry;
    const writeCoordinator = yield* WriteCoordinator;
    return PageCommands.of(
      makePageOperations({
        appendEvent: commandWriter.appendEvent,
        beginWritePlan: commandWriter.beginWritePlan,
        ensureActorUserProfile: commandWriter.ensureActorUserProfile,
        getRepository: registry.get,
        ids,
        identity,
        projection,
        writeAndSync: writeCoordinator.writeAndSync,
      }),
    );
  }),
);
