import { Result, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  InterfaceDensityPayload,
  LocalApiConfigOutput,
  RepositoryPreferencesPayload,
  ThemePreferencePayload,
} from "../src/http/schemas/AppConfigResourceEnvelope.ts";

const decodes = (schema: Schema.Decoder<unknown, never>, value: unknown): boolean =>
  Result.isSuccess(Schema.decodeUnknownResult(schema, { onExcessProperty: "error" })(value));

describe("app config HTTP schemas", () => {
  it("accepts the existing desktop settings payloads", () => {
    expect(decodes(ThemePreferencePayload, { preference: "dark" })).toBe(true);
    expect(decodes(InterfaceDensityPayload, { density: "spacious" })).toBe(true);
    expect(
      decodes(RepositoryPreferencesPayload, {
        preferences: { autoSync: false, commitStyle: "compact", sidebarExpanded: false },
      }),
    ).toBe(true);
  });

  it("rejects unsupported settings values", () => {
    expect(decodes(ThemePreferencePayload, { preference: "sepia" })).toBe(false);
    expect(decodes(InterfaceDensityPayload, { density: "comfortable" })).toBe(false);
    expect(decodes(RepositoryPreferencesPayload, { preferences: { commitStyle: "verbose" } })).toBe(
      false,
    );
    expect(
      decodes(LocalApiConfigOutput, {
        enabled: true,
        host: "0.0.0.0",
        port: "auto",
        staticToken: "token",
      }),
    ).toBe(false);
  });
});
