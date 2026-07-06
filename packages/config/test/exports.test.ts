import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { AppConfig as AppConfigFromPascal, AppConfigLive } from "@cycle/config/AppConfig";
import { AppConfigState as AppConfigStateFromSchema } from "@cycle/config/AppConfigSchema";
import {
  AppConfig as AppConfigFromLegacy,
  AppConfigState as AppConfigStateFromLegacy,
} from "@cycle/config/app-config";
import { AppConfigLive as AppConfigLiveFromLegacy } from "@cycle/config/app-config-live";
import { AppConfigState as AppConfigStateFromKebabSchema } from "@cycle/config/app-config-schema";
import { AppConfigTest } from "@cycle/config/testing";

describe("@cycle/config package exports", () => {
  it("maps PascalCase and legacy subpaths to the same service exports", () => {
    assert.equal(AppConfigFromPascal, AppConfigFromLegacy);
    assert.equal(AppConfigLive, AppConfigLiveFromLegacy);
    assert.equal(AppConfigStateFromSchema, AppConfigStateFromKebabSchema);
    assert.equal(AppConfigStateFromSchema, AppConfigStateFromLegacy);
    assert.equal(typeof AppConfigTest, "function");
  });
});
