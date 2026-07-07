import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "vitest";
import { defaultAppConfig } from "@cycle/config/app-config-schema";
import { cycleApiClient } from "../src/renderer/lib/cycleApiClient.ts";
import { getRendererAppConfig } from "../src/renderer/queries/appConfig.ts";

const originalGetAppConfig = cycleApiClient.getAppConfig;

afterEach(() => {
  cycleApiClient.getAppConfig = originalGetAppConfig;
});

describe("renderer app config", () => {
  it("loads browser app config from the backend API", async () => {
    cycleApiClient.getAppConfig = async () => ({
      ...defaultAppConfig(),
      onboarding: {
        completed: true,
      },
      profile: {
        displayName: "Saved User",
        email: "saved@example.com",
      },
    });

    const config = await getRendererAppConfig();

    assert.equal(config.profile.displayName, "Saved User");
    assert.equal(config.profile.email, "saved@example.com");
  });
});
