import { strict as assert } from "node:assert";
import type { AgentTaskHandoff } from "@cycle/contracts/schemas/agents";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import {
  MergeHandoffCard,
  mergeHandoffState,
} from "../src/renderer/components/MergeHandoffCard.tsx";

const handoff: AgentTaskHandoff = {
  artifacts: ["artifacts/screenshot.png"],
  baseRef: "main",
  branchName: "cycle/task/CYC-1-work",
  changedFiles: [{ path: "src/index.ts", status: "M" }],
  commits: ["abcdefabcdefabcdefabcdefabcdefabcdefabcd"],
  handoffId: "worktree_handover_task_1",
  knownLimitations: ["Manual browser validation remains."],
  mergeCommands: ["git fetch 'origin'", "git merge --ff-only 'origin/cycle/task/CYC-1-work'"],
  pushStatus: "pushed",
  remoteName: "origin",
  state: "merge_ready",
  tests: [{ command: "pnpm test", result: "12 passed", status: "passed" }],
  updatedAt: "2026-01-01T00:01:00.000Z",
};

describe("MergeHandoffCard", () => {
  it("renders branch, commits, evidence, limitations, and copyable commands", () => {
    const html = renderToStaticMarkup(createElement(MergeHandoffCard, { handoff }));

    assert.match(html, /Merge ready/u);
    assert.match(html, /cycle\/task\/CYC-1-work/u);
    assert.match(html, /src\/index.ts/u);
    assert.match(html, /pnpm test/u);
    assert.match(html, /artifacts\/screenshot.png/u);
    assert.match(html, /Manual browser validation remains/u);
    assert.match(html, /Copy commands/u);
  });

  it("uses distinct labels for every final handoff state", () => {
    assert.deepEqual(
      ["merge_ready", "needs_user_input", "failed", "abandoned"].map(
        (state) => mergeHandoffState(state as AgentTaskHandoff["state"]).label,
      ),
      ["Merge ready", "Needs user input", "Failed", "Abandoned"],
    );
  });
});
