import { Redacted, Schema } from "effect";

export const CycleApiConnectionSource = Schema.Literals([
  "explicit",
  "env",
  "runtimeDiscovery",
  "appConfig",
  "default",
]);
export type CycleApiConnectionSource = typeof CycleApiConnectionSource.Type;

export const CycleApiConnectionResult = Schema.Struct({
  baseUrl: Schema.NonEmptyString,
  source: Schema.Struct({
    baseUrl: CycleApiConnectionSource,
    token: CycleApiConnectionSource,
  }),
  token: Schema.RedactedFromValue(Schema.NonEmptyString, {
    label: "Cycle API token",
  }),
});
export type CycleApiConnectionResult = typeof CycleApiConnectionResult.Type;

export const cycleApiConnectionToken = (connection: CycleApiConnectionResult): string =>
  Redacted.value(connection.token);

export type CycleApiConnectionInput = {
  readonly apiToken?: string | Redacted.Redacted<string>;
  readonly apiUrl?: string;
};
