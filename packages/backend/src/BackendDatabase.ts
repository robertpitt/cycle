import {
  DatabaseIdGenerator,
  DatabaseIdentity,
  DatabaseLiveWithOptions,
  ValidationError,
} from "@cycle/database";
import { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { LocalSettings } from "./LocalSettings.ts";
import { backendPaths, type BackendStartOptions } from "./BackendConfig.ts";

export const BackendDatabaseIdentityLive = Layer.effect(
  DatabaseIdentity,
  Effect.gen(function* () {
    const settings = yield* LocalSettings;

    return DatabaseIdentity.of({
      currentActor: settings.getProfile().pipe(
        Effect.map((current) => ({
          email: current.email.trim().length === 0 ? undefined : current.email,
          name: current.displayName.trim().length === 0 ? "Cycle User" : current.displayName,
          type: "human" as const,
        })),
        Effect.mapError(
          (error) =>
            new ValidationError({
              field: "profile",
              message: "failed to read profile for database identity",
              cause: error,
            }),
        ),
      ),
    });
  }),
);

export const BackendDatabaseIdGeneratorLive = Layer.effect(
  DatabaseIdGenerator,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const randomUuid = crypto.randomUUIDv4.pipe(
      Effect.mapError(
        (cause) =>
          new ValidationError({
            field: "id",
            message: "failed to generate database id",
            cause,
          }),
      ),
    );
    const makeId = (prefix: string) =>
      randomUuid.pipe(Effect.map((uuid) => `${prefix}_${uuid.replaceAll("-", "")}`));

    return DatabaseIdGenerator.of({
      draftId: makeId("drf"),
      eventId: makeId("evt"),
      labelId: makeId("lbl"),
      recordId: makeId("rec"),
      templateId: makeId("tpl"),
      ticketId: randomUuid.pipe(
        Effect.map((uuid) =>
          BigInt(`0x${uuid.replaceAll("-", "")}`)
            .toString(36)
            .toUpperCase()
            .padStart(5, "0"),
        ),
      ),
      viewId: makeId("view"),
    });
  }),
);

export const BackendDatabaseLive = (options: BackendStartOptions = {}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* backendPaths(options);

      yield* fs.makeDirectory(path.dirname(paths.databasePath), { recursive: true }).pipe(
        Effect.mapError(
          (cause) =>
            new ValidationError({
              field: "database",
              message: "failed to create Cycle directory",
              cause,
            }),
        ),
      );

      return DatabaseLiveWithOptions({
        projectionPath: paths.databasePath,
      }).pipe(
        Layer.provide(Layer.mergeAll(BackendDatabaseIdentityLive, BackendDatabaseIdGeneratorLive)),
      );
    }),
  );

export const BackendDatabaseTest = BackendDatabaseLive;
