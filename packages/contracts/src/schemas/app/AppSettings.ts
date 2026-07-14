import { Schema } from "effect";

export const DEFAULT_API_HOST = "127.0.0.1";

export const ApiHost = Schema.Literals([DEFAULT_API_HOST, "localhost"]);
export type ApiHost = typeof ApiHost.Type;

export const ThemePreference = Schema.Literals(["light", "dark", "system"]);
export type ThemePreference = typeof ThemePreference.Type;

export const InterfaceDensity = Schema.Literals(["compact", "spacious"]);
export type InterfaceDensity = typeof InterfaceDensity.Type;

export const RepositoryCommitStyle = Schema.Literals(["descriptive", "compact"]);
export type RepositoryCommitStyle = typeof RepositoryCommitStyle.Type;

export const isApiHost = Schema.is(ApiHost);
export const isThemePreference = Schema.is(ThemePreference);
export const isInterfaceDensity = Schema.is(InterfaceDensity);
export const isRepositoryCommitStyle = Schema.is(RepositoryCommitStyle);
