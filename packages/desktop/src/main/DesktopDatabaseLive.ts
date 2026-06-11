import {
  DatabaseIdGenerator,
  DatabaseIdentity,
  DatabaseLiveWithOptions,
  validationError,
} from "@cycle/database";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Effect, Layer } from "effect";
import { ElectronApp } from "../platform/ElectronApp.ts";
import { Profile } from "../shared/Profile.ts";
import { DesktopLogger } from "./DesktopLoggerLive.ts";

const DesktopDatabaseIdentityLive = Layer.effect(
  DatabaseIdentity,
  Effect.gen(function* () {
    const profile = yield* Profile;

    return DatabaseIdentity.of({
      currentActor: profile.getProfile().pipe(
        Effect.map((current) => ({
          email: current.email.trim().length === 0 ? undefined : current.email,
          name: current.displayName.trim().length === 0 ? "Cycle User" : current.displayName,
          type: "human" as const,
        })),
        Effect.mapError((error) =>
          validationError("profile", "failed to read profile for database identity", error),
        ),
      ),
    });
  }),
);

const DesktopDatabaseIdGeneratorLive = Layer.succeed(
  DatabaseIdGenerator,
  DatabaseIdGenerator.of({
    draftId: Effect.sync(() => `drf_${randomUUID().replaceAll("-", "")}`),
    labelId: Effect.sync(() => `lbl_${randomUUID().replaceAll("-", "")}`),
    recordId: Effect.sync(() => `rec_${randomUUID().replaceAll("-", "")}`),
    templateId: Effect.sync(() => `tpl_${randomUUID().replaceAll("-", "")}`),
    ticketId: Effect.sync(() => `iss_${randomUUID().replaceAll("-", "")}`),
    viewId: Effect.sync(() => `view_${randomUUID().replaceAll("-", "")}`),
  }),
);

export const DesktopDatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const app = yield* ElectronApp;
    const logger = yield* DesktopLogger;
    const projectionPath = yield* app
      .getPath("userData")
      .pipe(Effect.map((userData) => join(userData, "cycle-projection.sqlite")));

    yield* Effect.tryPromise({
      try: () => mkdir(dirname(projectionPath), { recursive: true }),
      catch: (cause) => validationError("database", "failed to create projection directory", cause),
    });

    return DatabaseLiveWithOptions({
      logger: (event) => {
        void Effect.runPromise(
          logger.info(event.message, {
            ...(event.repositoryId === undefined ? {} : { repositoryId: event.repositoryId }),
            ...(event.data === undefined ? {} : event.data),
            scope: event.scope,
          }),
        );
      },
      projectionPath,
    }).pipe(
      Layer.provide(Layer.mergeAll(DesktopDatabaseIdentityLive, DesktopDatabaseIdGeneratorLive)),
    );
  }),
);
