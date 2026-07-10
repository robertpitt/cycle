import type { AgentTaskHandoff } from "@cycle/contracts/schemas/agents/agent-task-schemas";
import type { WorktreeHandoverRecord } from "@cycle/git-worktrees";

const shortBranchRef = (value: string): string =>
  value.startsWith("refs/heads/") ? value.slice("refs/heads/".length) : value;

const shellArgument = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

export const branchUrlFromRemote = (
  remoteUrl: string | undefined,
  branchName: string | undefined,
): string | undefined => {
  if (remoteUrl === undefined || branchName === undefined) return undefined;
  const normalized = remoteUrl
    .replace(/^git@([^:]+):/u, "https://$1/")
    .replace(/^ssh:\/\/git@/u, "https://")
    .replace(/\.git$/u, "")
    .replace(/\/+$/u, "");
  if (!normalized.startsWith("https://") && !normalized.startsWith("http://")) return undefined;
  const encodedBranch = branchName.split("/").map(encodeURIComponent).join("/");
  if (/gitlab/i.test(normalized)) return `${normalized}/-/tree/${encodedBranch}`;
  if (/bitbucket/i.test(normalized)) return `${normalized}/src/${encodedBranch}`;
  return `${normalized}/tree/${encodedBranch}`;
};

export const mergeCommandsForHandoff = (
  record: Pick<
    WorktreeHandoverRecord,
    "baseRef" | "branchName" | "pushStatus" | "remoteName" | "remoteRef"
  >,
): ReadonlyArray<string> => {
  if (record.branchName === undefined) return [];
  const baseBranch = shortBranchRef(record.baseRef);
  if (record.pushStatus === "pushed" && record.remoteName !== undefined) {
    const remoteBranch = shortBranchRef(record.remoteRef ?? record.branchName);
    return [
      `git fetch ${shellArgument(record.remoteName)}`,
      `git switch ${shellArgument(baseBranch)}`,
      `git merge --ff-only ${shellArgument(`${record.remoteName}/${remoteBranch}`)}`,
    ];
  }
  return [
    `git switch ${shellArgument(baseBranch)}`,
    `git merge --ff-only ${shellArgument(record.branchName)}`,
  ];
};

export const mergeHandoffProjection = (record: WorktreeHandoverRecord): AgentTaskHandoff => ({
  artifacts: record.artifacts,
  baseRef: record.baseRef,
  ...(record.branchName === undefined ? {} : { branchName: record.branchName }),
  ...(branchUrlFromRemote(record.remoteUrl, record.branchName) === undefined
    ? {}
    : { branchUrl: branchUrlFromRemote(record.remoteUrl, record.branchName) }),
  changedFiles: record.changedFiles,
  commits: record.commits,
  ...(record.lastError === undefined
    ? {}
    : {
        failure: {
          code: record.lastError.tag ?? "handoff_failed",
          message: record.lastError.message,
        },
      }),
  handoffId: record.handoverId,
  knownLimitations: record.knownLimitations,
  mergeCommands: mergeCommandsForHandoff(record),
  ...(record.pushError === undefined ? {} : { pushError: record.pushError }),
  pushStatus: record.pushStatus,
  ...(record.remoteName === undefined ? {} : { remoteName: record.remoteName }),
  ...(record.remoteRef === undefined ? {} : { remoteRef: record.remoteRef }),
  ...(record.remoteUrl === undefined ? {} : { remoteUrl: record.remoteUrl }),
  state: record.reviewState,
  ...(record.summary === undefined ? {} : { summary: record.summary }),
  tests: record.tests,
  updatedAt: record.updatedAt,
});
