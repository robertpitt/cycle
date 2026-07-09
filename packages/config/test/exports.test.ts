import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { AppConfig, AppConfigLive } from "@cycle/config";
import { AppConfigState } from "@cycle/config";
import { AppConfigTest } from "@cycle/config/testing";

describe("@cycle/config package exports", () => {
  it("exposes the canonical root API", () => {
    assert.equal(typeof AppConfig, "function");
    assert.equal(typeof AppConfigLive, "object");
    assert.equal(typeof AppConfigState, "object");
    assert.equal(typeof AppConfigTest, "function");
  });
});
