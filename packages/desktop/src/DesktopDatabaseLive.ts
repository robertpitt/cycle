import {
  DatabaseIdGenerator,
  DatabaseIdentity,
  DatabaseLiveWithOptions,
  ValidationError,
} from "@cycle/database";
import { Config, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { Profile } from "./shared/Profile.ts";

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

const DesktopDatabaseIdGeneratorLive = Layer.effect(
  DatabaseIdGenerator,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const randomUuid = crypto.randomUUIDv4.pipe(
      Effect.mapError(
        (cause) =>
          new ValidationError({
            field: "id",
            message: "failed to generate database id",
            cause: cause,
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

export const DesktopDatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const homeDirectory = yield* Config.string("HOME").pipe(
      Config.withDefault("."),
      Config.map((value) => value.trim() || "."),
    );
    const projectionPath = path.join(homeDirectory, ".cycle", "cycle.db");

    yield* fs.makeDirectory(path.dirname(projectionPath), { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new ValidationError({
            field: "database",
            message: "failed to create Cycle directory",
            cause: cause,
          }),
      ),
    );

    return DatabaseLiveWithOptions({
      projectionPath,
    }).pipe(
      Layer.provide(Layer.mergeAll(DesktopDatabaseIdentityLive, DesktopDatabaseIdGeneratorLive)),
    );
  }),
);
