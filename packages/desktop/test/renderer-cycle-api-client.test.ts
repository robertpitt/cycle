import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "vitest";
import {
  parseAgentActivity,
  parseAgentSettings,
  summarizeAgentActivity,
} from "../src/renderer/lib/agentWork.ts";
import { cycleApiClient, decodeRepositoryIssueCursor } from "../src/renderer/lib/cycleApiClient.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
});

describe("renderer cycle API client", () => {
  it("schema-decodes repository issue cursors", () => {
    const cursor = JSON.stringify({
      __cycleRepositoryIssueCursors: {
        repo_a: "cursor-a",
        repo_b: "",
      },
    });

    assert.deepEqual(decodeRepositoryIssueCursor(cursor), {
      repo_a: "cursor-a",
    });
  });

  it("rejects malformed repository issue cursors", () => {
    assert.equal(
      decodeRepositoryIssueCursor(
        JSON.stringify({
          __cycleRepositoryIssueCursors: {
            repo_a: 42,
          },
        }),
      ),
      undefined,
    );
    assert.equal(
      decodeRepositoryIssueCursor(
        JSON.stringify({
          __cycleRepositoryIssueCursors: {},
          debug: true,
        }),
      ),
      undefined,
    );
  });

  it("summarizes visible agent activity jobs", () => {
    const activity = summarizeAgentActivity([
      {
        agentId: "agent-a",
        jobId: "job-queued",
        repositoryId: "repo-a",
        status: "queued",
      },
      {
        agentId: "agent-a",
        jobId: "job-failed",
        repositoryId: "repo-a",
        status: "failed",
      },
      {
        agentId: "agent-a",
        jobId: "job-completed",
        repositoryId: "repo-a",
        status: "completed",
      },
      {
        agentId: "agent-a",
        jobId: "job-waiting",
        repositoryId: "repo-a",
        status: "waiting-for-input",
      },
    ]);

    assert.deepEqual(
      activity.jobs.map((job) => job.jobId),
      ["job-queued", "job-failed", "job-waiting"],
    );
    assert.equal(activity.queuedCount, 1);
    assert.equal(activity.failedCount, 1);
    assert.equal(activity.waitingCount, 1);
  });

  it("parses activity collection events into latest job summaries", () => {
    const activity = parseAgentActivity({
      data: [
        {
          payload: {
            agentId: "agent-a",
            jobId: "job-a",
            repositoryId: "repo-a",
            status: "queued",
          },
        },
        {
          payload: {
            agentId: "agent-a",
            jobId: "job-a",
            repositoryId: "repo-a",
            status: "running",
          },
        },
      ],
      globalPaused: true,
    });

    assert.equal(activity.globalPaused, true);
    assert.equal(activity.runningCount, 1);
    assert.deepEqual(
      activity.jobs.map((job) => [job.jobId, job.status]),
      [["job-a", "running"]],
    );
  });

  it("normalizes unsupported mention authority to ticket context", () => {
    const settings = parseAgentSettings({
      defaultMentionAuthorityMode: "implementation-worktree",
      defaultProviderId: "codex",
      enabledProviders: ["codex"],
      maxConcurrentJobs: 1,
      paused: false,
    });

    assert.equal(settings.defaultMentionAuthorityMode, "ticket-context");
  });

  it("sends empty JSON payloads for agent job control posts", async () => {
    const calls: Array<{ readonly body?: BodyInit | null; readonly url: string }> = [];
    const storage = new Map<string, string>();

    globalThis.window = {
      location: {
        hash: "",
        protocol: "http:",
        search: "?cycleApiUrl=http://cycle.test&cycleApiToken=test-token",
      },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    } as Window & typeof globalThis;
    globalThis.fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          data: {
            agentId: "agent-a",
            jobId: "job-a",
            repositoryId: "repo-a",
            status: "cancelled",
          },
          meta: { requestId: "req-test" },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    };

    await cycleApiClient.cancelAgentJob("job-a");
    await cycleApiClient.resumeAgentJob("job-a");

    assert.deepEqual(
      calls.map((call) => [call.url, call.body]),
      [
        ["http://cycle.test/v1/agent-jobs/job-a/cancel", "{}"],
        ["http://cycle.test/v1/agent-jobs/job-a/resume", "{}"],
      ],
    );
  });
});
