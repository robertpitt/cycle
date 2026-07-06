import { Schema } from "effect";

const RuntimeDiscoveryRest = Schema.Record(Schema.String, Schema.Unknown);

export const DesktopApiRuntimeFile = Schema.StructWithRest(
  Schema.Struct({
    baseUrl: Schema.optional(Schema.String),
  }),
  [RuntimeDiscoveryRest],
);
export type DesktopApiRuntimeFile = typeof DesktopApiRuntimeFile.Type;

export const runtimeBaseUrlFromDiscovery = (value: unknown): string | undefined => {
  const parsed = Schema.decodeUnknownSync(DesktopApiRuntimeFile)(value);
  return parsed.baseUrl === undefined || parsed.baseUrl.length === 0
    ? undefined
    : parsed.baseUrl.replace(/\/+$/u, "");
};

export const parseRuntimeBaseUrlFromDiscoveryText = (text: string): string | undefined =>
  runtimeBaseUrlFromDiscovery(JSON.parse(text) as unknown);
