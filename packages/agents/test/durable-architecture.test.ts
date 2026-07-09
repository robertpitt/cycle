import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";
import { agentMigrations } from "../src/migrations/AgentMigrations.ts";

const coreFiles = [
  "AgentCommandStore.ts",
  "AgentEventJournal.ts",
  "AgentExecutionStore.ts",
  "AgentQueueStore.ts",
  "AgentReadStore.ts",
  "AgentRuntimeService.ts",
  "AgentScheduler.ts",
  "AgentSupervisor.ts",
  "AgentThreadStore.ts",
];

describe("durable runtime architecture", () => {
  it("keeps runtime runners and Promise APIs out of the Effect core", () => {
    for (const file of coreFiles) {
      const source = readFileSync(resolve(import.meta.dirname, `../src/${file}`), "utf8");
      assert.doesNotMatch(source, /Effect\.run(?:Promise|Sync|Fork)/u, file);
      assert.doesNotMatch(source, /Promise</u, file);
      assert.doesNotMatch(source, /AsyncIterable/u, file);
    }
  });

  it("declares every required durable table in the initial migration", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/migrations/AgentMigrations.ts"),
      "utf8",
    );
    const tables = [
      "agent_threads",
      "agent_tasks",
      "agent_turns",
      "agent_messages",
      "agent_message_parts",
      "agent_runs",
      "agent_attempts",
      "agent_session_bindings",
      "agent_interactions",
      "agent_workflow_steps",
      "agent_operation_receipts",
      "agent_artifacts",
      "agent_events",
      "agent_provider_diagnostics",
      "agent_commands",
      "agent_retention_runs",
    ];
    for (const table of tables)
      assert.match(source, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "u"));
    assert.ok(Object.hasOwn(agentMigrations, "0001_durable_agent_runtime"));
    assert.ok(Object.hasOwn(agentMigrations, "0002_repair_enqueue_sequence"));
  });

  it("does not expose or retain the replaced runtime and task-store stacks", () => {
    const removed = [
      "AgentRuntime.ts",
      "AgentTaskService.ts",
      "AgentTaskStore.ts",
      "AgentTaskSqliteStore.ts",
      "orchestration.ts",
    ];
    for (const file of removed) {
      assert.equal(existsSync(resolve(import.meta.dirname, `../src/${file}`)), false, file);
    }
    const packageJson = readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8");
    assert.doesNotMatch(packageJson, /legacy|agent-task-store|agent-runtime-contracts/u);
  });
});
