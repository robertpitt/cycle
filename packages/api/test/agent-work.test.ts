import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  makeHttpAgentWorkRuntime,
  makeAgentWorkRuntime,
  makeInMemoryAgentWorkStore,
  mergeGlobalAgentWorkSettings,
  mergeRepositoryAgentWorkSettings,
  type AgentWorkJob,
} from "@cycle/usecases/agent-work";

const makeRuntime = (now?: () => Date) => {
  const store = makeInMemoryAgentWorkStore();
  const runtime = makeAgentWorkRuntime({ now, ownerId: "test-owner", store });
  return { runtime, store };
};

const startMentionJob = (
  runtime: ReturnType<typeof makeAgentWorkRuntime>,
  input: Partial<Parameters<typeof runtime.startJob>[0]> = {},
): Promise<AgentWorkJob> =>
  runtime.startJob({
    agentId: "codex",
    authorityMode: "ticket-context",
    commentId: "COMMENT-1",
    repositoryId: "repo-1",
    requestedBy: "tester",
    ticketId: "TICKET-1",
    trigger: "agent-mention",
    ...input,
  });

describe("agent work runtime", () => {
  it("appends, replays, filters, and subscribes to local events in sequence", async () => {
    const { runtime } = makeRuntime();
    const seen: string[] = [];
    const unsubscribe = runtime.eventHub.subscribe(
      { eventTypes: ["local.agent_job_created"], repositoryId: "repo-1" },
      (event) => {
        seen.push(`${event.sequence}:${event.eventType}`);
      },
    );

    const job = await startMentionJob(runtime);
    unsubscribe();

    const all = await runtime.eventHub.replay({ repositoryId: "repo-1" });
    const jobEvents = await runtime.eventHub.replay({ jobId: job.jobId });

    expect(all.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(jobEvents.map((event) => event.eventType)).toEqual([
      "local.agent_job_created",
      "local.agent_job_status_changed",
      "local.agent_job_status_changed",
      "local.agent_job_status_changed",
    ]);
    expect(seen).toEqual(["1:local.agent_job_created"]);
  });

  it("returns the existing non-terminal job for duplicate mention triggers", async () => {
    const { runtime } = makeRuntime();

    const first = await startMentionJob(runtime, { commentId: "COMMENT-9" });
    const second = await startMentionJob(runtime, { commentId: "COMMENT-9" });
    const jobs = await runtime.listJobs({ includeTerminal: false });
    const createdEvents = await runtime.eventHub.replay({
      eventTypes: ["local.agent_job_created"],
    });

    expect(second.jobId).toBe(first.jobId);
    expect(jobs).toHaveLength(1);
    expect(createdEvents).toHaveLength(1);
  });

  it("gates worktree authority until the Agent Work executor policy enables it", async () => {
    const { runtime } = makeRuntime();

    const job = await startMentionJob(runtime, {
      assignmentVersion: 1,
      authorityMode: "implementation-worktree",
      ticketStatus: "todo",
      trigger: "assignment-pickup",
    });

    expect(job.status).toBe("queued");
    expect(job.currentGate).toBe("unsupported-provider-capability");
  });

  it("allows worktree authority when an execution policy explicitly supports it", async () => {
    const store = makeInMemoryAgentWorkStore();
    const runtime = makeAgentWorkRuntime({
      executionPolicy: {
        supportedAuthorityModes: ["ticket-context", "implementation-worktree"],
      },
      ownerId: "test-owner",
      store,
    });

    const job = await startMentionJob(runtime, {
      assignmentVersion: 1,
      authorityMode: "implementation-worktree",
      ticketStatus: "todo",
      trigger: "assignment-pickup",
    });

    expect(job.status).toBe("running");
    expect(job.currentGate).toBe(null);
  });

  it("downgrades mention authority when full-access jobs are disabled", async () => {
    const store = makeInMemoryAgentWorkStore();
    const runtime = makeHttpAgentWorkRuntime(
      makeAgentWorkRuntime({ ownerId: "test-owner", store }),
    );

    await runtime.patchSettings({
      allowFullAccessJobs: false,
      defaultMentionAuthorityMode: "implementation-worktree",
    });

    const [job] = await runtime.handleSuccessfulComment({
      body: "Please check this cycle-agent:codex",
      commentId: "COMMENT-1",
      repositoryId: "repo-1",
      ticketId: "TICKET-1",
    });

    expect(job?.authorityMode).toBe("ticket-context");
    expect(job?.metadata.commentBody).toBe("Please check this cycle-agent:codex");
  });

  it("applies pause gates and default global concurrency of one", async () => {
    const { runtime } = makeRuntime();

    const running = await startMentionJob(runtime, {
      commentId: "COMMENT-1",
      ticketId: "TICKET-1",
    });
    const blockedByConcurrency = await startMentionJob(runtime, {
      commentId: "COMMENT-2",
      ticketId: "TICKET-2",
    });

    expect(running.status).toBe("running");
    expect(blockedByConcurrency.status).toBe("queued");
    expect(blockedByConcurrency.currentGate).toBe("global-concurrency");

    await runtime.pauseScope("global", { actor: "tester", reason: "maintenance" });
    const blockedByPause = await startMentionJob(runtime, {
      commentId: "COMMENT-3",
      ticketId: "TICKET-3",
    });
    const suspended = await runtime.getJob(running.jobId);

    expect(suspended?.status).toBe("suspended");
    expect(blockedByPause.status).toBe("queued");
    expect(blockedByPause.currentGate).toBe("global-paused");
  });

  it("records status history for every transition", async () => {
    const { runtime, store } = makeRuntime();

    const job = await startMentionJob(runtime);
    await runtime.cancelJob(job.jobId, "tester");

    const history = await store.listStatusHistory(job.jobId);
    expect(history.map((entry) => entry.toStatus)).toEqual([
      "queued",
      "starting",
      "running",
      "cancelling",
      "cancelled",
    ]);
  });

  it("reconciles stale leased running jobs from retry-safe checkpoints", async () => {
    let timestamp = new Date("2026-06-21T10:00:00.000Z");
    const { runtime } = makeRuntime(() => timestamp);

    const job = await startMentionJob(runtime);
    await runtime.recordCheckpoint(job.jobId, {
      payload: { phase: "before-provider-turn" },
      retrySafe: true,
      step: "before-provider-turn",
    });

    timestamp = new Date("2026-06-21T10:02:01.000Z");
    const reconciled = await runtime.reconcileStaleJobs();
    const updated = await runtime.getJob(job.jobId);

    expect(reconciled.map((entry) => entry.jobId)).toEqual([job.jobId]);
    expect(updated?.status).toBe("retry-wait");
    expect(updated?.currentGate).toBe("stale-lease");
    expect(updated?.lastError?.code).toBe("stale-lease");
  });

  it("validates global and repository settings defaults", () => {
    const global = mergeGlobalAgentWorkSettings(undefined);
    const repository = mergeRepositoryAgentWorkSettings("repo-1", undefined);
    const invalid = mergeGlobalAgentWorkSettings({ maxConcurrentJobs: 0 });
    const unlimited = mergeGlobalAgentWorkSettings({ maxConcurrentJobs: null });

    expect(global).toMatchObject({
      ok: true,
      value: {
        allowDisposableWorktreeForMentions: true,
        allowFullAccessJobs: false,
        defaultMentionAuthorityMode: "ticket-context",
        defaultProviderId: "codex",
        maxConcurrentJobs: 1,
        paused: false,
      },
    });
    expect(repository).toMatchObject({
      ok: true,
      value: {
        agentWorkDisabled: false,
        maxConcurrentJobs: 1,
        paused: false,
        repositoryId: "repo-1",
      },
    });
    expect(invalid.ok).toBe(false);
    expect(unlimited).toMatchObject({
      ok: true,
      value: {
        maxConcurrentJobs: null,
      },
    });
  });

  it("keeps effect unstable workflow imports behind the agent-work boundary", () => {
    const root = fileURLToPath(new URL("../src", import.meta.url));
    const matches = listTypescriptFiles(root).filter((file) =>
      readFileSync(file, "utf8").includes("effect/unstable/workflow"),
    );
    const outsideBoundary = matches.filter((file) => !file.endsWith("/agent-work/workflow.ts"));

    expect(outsideBoundary).toEqual([]);
  });

  it("keeps the legacy api-owned Agent Work runtime deleted", () => {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    expect(existsSync(join(root, "packages/api/src/agentWork/runtime.ts"))).toBe(false);

    const offenders = listTypescriptFiles(join(root, "packages"))
      .filter((file) => !file.includes("/test/"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          source.includes("agentWork/runtime") ||
          source.includes("../agentWork") ||
          source.includes("AgentWorkRuntimeV11") ||
          source.includes("makeHttpInMemoryAgentWorkRuntime")
        );
      });

    expect(offenders).toEqual([]);
  });
});

const listTypescriptFiles = (root: string): readonly string[] => {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (["node_modules", "out", "storybook-static"].includes(entry)) continue;
      files.push(...listTypescriptFiles(path));
    } else if (path.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
};
