import { strict as assert } from "node:assert";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, it } from "vitest";
import {
  defaultAgentCapabilities,
  detectAgentProviders,
  makeUnsupportedAgentService,
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

    const providers = await Effect.runPromise(detectAgentProviders({ PATH: bin }));
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
    await writeFile(shell, `#!/bin/sh\nPATH="${bin}:$PATH"\nexec /bin/sh "$@"\n`, "utf8");
    await chmod(codex, 0o755);
    await chmod(shell, 0o755);

    const providers = await Effect.runPromise(detectAgentProviders({ PATH: "", SHELL: shell }));
    const detectedCodex = providers.find((provider) => provider.id === "codex");

    assert.equal(detectedCodex?.status, "available");
    assert.equal(detectedCodex?.executablePath, codex);
  });
});

describe("@cycle/agents runtime contracts", () => {
  it("declares Codex as the first workspace-capable provider", () => {
    const capabilities = defaultAgentCapabilities("codex");

    assert.equal(capabilities.provider, "codex");
    assert.equal(capabilities.streaming, true);
    assert.equal(capabilities.structuredOutput, true);
    assert.equal(capabilities.supports.mcp, true);
    assert.equal(capabilities.supportedJobTypes.includes("implement_issue"), true);
  });

  it("normalizes unsupported execution through AgentService", async () => {
    const service = makeUnsupportedAgentService("codex");
    const session = await service.createSession({ title: "Test" });
    const result = await service.run(session.id, { input: "hello" });
    const events: unknown[] = [];

    for await (const event of service.stream(session.id, { input: "hello" })) {
      events.push(event);
    }

    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, "unsupported_option");
    assert.deepEqual(
      events.map((event) => (event as { readonly type: string }).type),
      ["turn.started", "turn.failed"],
    );
  });
});
