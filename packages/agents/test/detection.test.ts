import { strict as assert } from "node:assert";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, it } from "vitest";
import {
  capabilitySupportsAuthorityMode,
  defaultAgentCapabilities,
  detectAgentProviders,
  makeAgentJobRequestMetadata,
  resolveExecutable,
  supportedAgentProviders,
} from "../src/index.ts";

const temporaryDirectories: Array<string> = [];

const makeTempDir = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "cycle-agents-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("@cycle/agents provider detection", () => {
  it("detects executable providers on PATH and attaches capabilities", async () => {
    const userData = await makeTempDir();
    const bin = join(userData, "bin");
    await mkdir(bin);
    const codex = join(bin, "codex");
    await writeFile(codex, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(codex, 0o755);

    const providers = await Effect.runPromise(
      detectAgentProviders({ PATH: bin }, { hydrate: false }),
    );
    const detectedCodex = providers.find((provider) => provider.id === "codex");

    assert.equal(providers.length, supportedAgentProviders.length);
    assert.equal(detectedCodex?.status, "available");
    assert.equal(detectedCodex?.executablePath, codex);
    assert.equal(detectedCodex?.capabilities?.supports.mcp, true);
  });

  it("detects providers exposed by the user shell when PATH is sparse", async () => {
    const userData = await makeTempDir();
    const bin = join(userData, "bin");
    await mkdir(bin);
    const codex = join(bin, "codex");
    const shell = join(userData, "shell");
    await writeFile(codex, "#!/bin/sh\nexit 0\n", "utf8");
    await writeFile(
      shell,
      [
        "#!/bin/sh",
        `PATH="${bin}:/usr/bin:/bin:$PATH"`,
        'if [ "$1" = "-ilc" ]; then',
        "  shift",
        '  exec /bin/sh -c "$1"',
        "fi",
        'exec /bin/sh "$@"',
        "",
      ].join("\n"),
      "utf8",
    );
    await chmod(codex, 0o755);
    await chmod(shell, 0o755);

    const providers = await Effect.runPromise(detectAgentProviders({ PATH: "", SHELL: shell }));
    const detectedCodex = providers.find((provider) => provider.id === "codex");

    assert.equal(detectedCodex?.status, "available");
    assert.equal(detectedCodex?.executablePath, codex);
  });

  it("resolves an explicit executable path without PATH lookup", async () => {
    const userData = await makeTempDir();
    const codex = join(userData, "codex");
    await writeFile(codex, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(codex, 0o755);

    const resolved = await Effect.runPromise(resolveExecutable(codex, { env: { PATH: "" } }));

    assert.equal(resolved.available, true);
    assert.equal(resolved.executablePath, codex);
  });

  it("uses Windows PATHEXT candidates when resolving on Windows", async () => {
    const userData = await makeTempDir();
    const bin = join(userData, "bin");
    await mkdir(bin);
    const codex = join(bin, "codex.CMD");
    await writeFile(codex, "@echo off\r\nexit /b 0\r\n", "utf8");

    const resolved = await Effect.runPromise(
      resolveExecutable("codex", {
        env: {
          PATH: bin,
          PATHEXT: ".CMD;.EXE",
        },
        hydrate: false,
        platform: "win32",
      }),
    );

    assert.equal(resolved.available, true);
    assert.equal(resolved.executablePath, codex);
  });
});

describe("@cycle/agents runtime contracts", () => {
  it("declares Codex as the first workspace-capable provider", () => {
    const capabilities = defaultAgentCapabilities("codex");

    assert.equal(capabilities.provider, "codex");
    assert.equal(capabilities.streaming, true);
    assert.equal(capabilities.structuredOutput, true);
    assert.equal(capabilities.supports.mcp, true);
    assert.equal(capabilities.providerFeatures?.commandExecution, true);
    assert.equal(capabilities.providerFeatures?.workspaceWriteMode, true);
    assert.equal(capabilitySupportsAuthorityMode(capabilities, "ticket-context"), true);
    assert.equal(capabilitySupportsAuthorityMode(capabilities, "disposable-worktree"), true);
    assert.equal(capabilitySupportsAuthorityMode(capabilities, "implementation-worktree"), true);
    assert.equal(capabilities.supportedJobTypes.includes("implement_issue"), true);
  });

  it("declares Claude Code as a workspace-capable provider", () => {
    const capabilities = defaultAgentCapabilities("claude-code");

    assert.equal(supportedAgentProviders.some((provider) => provider.id === "claude-code"), true);
    assert.equal(capabilities.provider, "claude-code");
    assert.equal(capabilities.streaming, true);
    assert.equal(capabilities.structuredOutput, true);
    assert.equal(capabilities.supports.mcp, true);
    assert.equal(capabilities.providerFeatures?.commandExecution, true);
    assert.equal(capabilities.providerFeatures?.workspaceWriteMode, true);
    assert.equal(capabilitySupportsAuthorityMode(capabilities, "ticket-context"), true);
    assert.equal(capabilitySupportsAuthorityMode(capabilities, "disposable-worktree"), true);
    assert.equal(capabilitySupportsAuthorityMode(capabilities, "implementation-worktree"), true);
    assert.equal(capabilities.supportedJobTypes.includes("implement_issue"), true);
  });

  it("builds provider request metadata for job-scoped turns", () => {
    assert.deepEqual(
      makeAgentJobRequestMetadata({
        agentId: "agent_local",
        authorityMode: "implementation-worktree",
        branchName: "cycle/task/CYC-123-work",
        jobId: "job_123",
        model: "gpt-test",
        providerId: "codex",
        repositoryId: "repo_123",
        ticketId: "CYC-123",
        trigger: "assignment-pickup",
        worktreePath: "/tmp/cycle/worktrees/worktree_123",
      }),
      {
        agent: {
          id: "agent_local",
          model: "gpt-test",
          providerId: "codex",
        },
        agentId: "agent_local",
        authorityMode: "implementation-worktree",
        branchName: "cycle/task/CYC-123-work",
        jobId: "job_123",
        repositoryId: "repo_123",
        ticketId: "CYC-123",
        trigger: "assignment-pickup",
        triggerType: "assignment-pickup",
        worktreePath: "/tmp/cycle/worktrees/worktree_123",
      },
    );
  });
});
