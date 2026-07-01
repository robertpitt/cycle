import type { AgentWorkRuntime, StartAgentWorkJobInput } from "./runtime.ts";
import type {
  AgentWorkActivityRecord,
  AgentWorkCheckpoint,
  AgentWorkJob,
  AgentWorkJsonObject,
  AgentWorkLease,
  AgentWorkPauseScope,
  AgentWorkPauseScopeName,
} from "./types.ts";

export type AgentWorkWorkflowAdapter = {
  readonly startJob: (input: StartAgentWorkJobInput) => Promise<AgentWorkJob>;
  readonly getJob: (jobId: string) => Promise<AgentWorkJob | undefined>;
  readonly listJobs: () => Promise<readonly AgentWorkJob[]>;
  readonly pauseScope: (
    scope: AgentWorkPauseScopeName,
    input?: { readonly actor?: string; readonly reason?: string },
  ) => Promise<AgentWorkPauseScope>;
  readonly resumeScope: (
    scope: AgentWorkPauseScopeName,
    input?: { readonly actor?: string; readonly reason?: string },
  ) => Promise<AgentWorkPauseScope>;
  readonly resumeJob: (jobId: string, actor?: string) => Promise<AgentWorkJob | undefined>;
  readonly cancelJob: (jobId: string, actor?: string) => Promise<AgentWorkJob | undefined>;
  readonly recordCheckpoint: (
    jobId: string,
    input: {
      readonly step: string;
      readonly retrySafe: boolean;
      readonly payload?: AgentWorkJsonObject;
    },
  ) => Promise<AgentWorkCheckpoint | undefined>;
  readonly recordActivity: (
    activity: Omit<AgentWorkActivityRecord, "activityId" | "occurredAt">,
  ) => Promise<void>;
  readonly scheduleWakeup: (jobId: string, wakeupAt: string) => Promise<AgentWorkJob | undefined>;
  readonly acquireLease: (jobId: string, ownerId?: string) => Promise<AgentWorkLease | undefined>;
  readonly heartbeatLease: (jobId: string, ownerId?: string) => Promise<AgentWorkLease | undefined>;
  readonly releaseLease: (jobId: string, ownerId?: string) => Promise<boolean>;
  readonly reconcileStaleJobs: () => Promise<readonly AgentWorkJob[]>;
};

export const makeAgentWorkWorkflowAdapter = (
  runtime: AgentWorkRuntime,
): AgentWorkWorkflowAdapter => ({
  acquireLease: runtime.acquireLease,
  cancelJob: runtime.cancelJob,
  getJob: runtime.getJob,
  heartbeatLease: runtime.heartbeatLease,
  listJobs: () => runtime.listJobs(),
  pauseScope: runtime.pauseScope,
  recordActivity: runtime.recordActivity,
  recordCheckpoint: runtime.recordCheckpoint,
  reconcileStaleJobs: runtime.reconcileStaleJobs,
  releaseLease: runtime.releaseLease,
  resumeJob: runtime.resumeJob,
  resumeScope: runtime.resumeScope,
  scheduleWakeup: async (jobId, wakeupAt) => {
    const job = await runtime.getJob(jobId);
    if (job === undefined) return undefined;
    return runtime.recordJobFailure(
      jobId,
      {
        code: "user-input-required",
        message: "Job is waiting for a scheduled wakeup.",
        remediation: `Wakeup scheduled for ${wakeupAt}.`,
        retrySafe: true,
      },
      { actor: "workflow", retrySafe: true },
    );
  },
  startJob: runtime.startJob,
});
