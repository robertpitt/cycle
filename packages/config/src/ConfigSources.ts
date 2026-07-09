import { Config, ConfigProvider, Redacted } from "effect";
import { trimNonEmpty } from "./internal/strings.ts";

export type ConfigSourceEnv = Readonly<Record<string, string | undefined>>;

export const definedEnv = (env: ConfigSourceEnv): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

export const envProvider = (env: ConfigSourceEnv): ConfigProvider.ConfigProvider =>
  ConfigProvider.fromEnv({ env: definedEnv(env) });

export const optionalConfigString = (name: string): Config.Config<string | undefined> =>
  Config.string(name).pipe(Config.map(trimNonEmpty), Config.withDefault(undefined));

export const optionalConfigRedacted = (
  name: string,
): Config.Config<Redacted.Redacted<string> | undefined> =>
  Config.redacted(name).pipe(
    Config.map((value) => {
      const trimmed = trimNonEmpty(Redacted.value(value));
      return trimmed === undefined ? undefined : Redacted.make(trimmed, { label: name });
    }),
    Config.withDefault(undefined),
  );
