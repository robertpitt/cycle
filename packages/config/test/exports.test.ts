import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { AppConfig, AppConfigLive } from "@cycle/config/app-config";
import { AppConfigState } from "@cycle/contracts/schemas/app";
import { AppConfigTest } from "@cycle/config/testing";

describe("@cycle/config package exports", () => {
  it("exposes canonical app config and testing subpaths", () => {
    assert.equal(typeof AppConfig, "function");
    assert.equal(typeof AppConfigLive, "object");
    assert.equal(typeof AppConfigState, "object");
    assert.equal(typeof AppConfigTest, "function");
  });
});
