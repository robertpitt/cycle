import { Effect, Schema } from "effect";
import { RuntimeDiscoveryError } from "./ConfigErrors.ts";

const PositiveInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const RuntimeDiscoveryMetadata = Schema.Record(Schema.String, Schema.Unknown);

export const RuntimeDiscoveryFile = Schema.StructWithRest(
  Schema.Struct({
    apiVersion: Schema.optionalKey(Schema.NonEmptyString),
    baseUrl: Schema.NonEmptyString,
    mcpPath: Schema.optionalKey(Schema.NonEmptyString),
    mcpUrl: Schema.optionalKey(Schema.NonEmptyString),
    pid: Schema.optionalKey(PositiveInteger),
    specUrl: Schema.optionalKey(Schema.NonEmptyString),
    startedAt: Schema.optionalKey(Schema.NonEmptyString),
  }),
  [RuntimeDiscoveryMetadata],
);
export type RuntimeDiscoveryFile = typeof RuntimeDiscoveryFile.Type;

const RuntimeDiscoveryJson = Schema.fromJsonString(RuntimeDiscoveryFile);

const invalidDiscoveryFile = () =>
  new RuntimeDiscoveryError({
    message: "Runtime discovery file does not match the current schema.",
    operation: "RuntimeDiscovery.decode",
  });

export const decodeRuntimeDiscoveryJson = (text: string) =>
  Schema.decodeUnknownEffect(RuntimeDiscoveryJson)(text).pipe(
    Effect.mapError(invalidDiscoveryFile),
  );

export const encodeRuntimeDiscoveryJson = (file: RuntimeDiscoveryFile) =>
  Schema.encodeEffect(RuntimeDiscoveryJson)(file).pipe(
    Effect.mapError(
      () =>
        new RuntimeDiscoveryError({
          message: "Unable to encode runtime discovery file.",
          operation: "RuntimeDiscovery.encode",
        }),
    ),
  );
