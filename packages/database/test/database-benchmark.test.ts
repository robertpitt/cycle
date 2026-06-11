import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { GitDbFilesystem, Store as GitDbStore } from "@cycle/git-db";
import { Effect } from "effect";
import {
  DatabaseService,
  DatabaseTest,
  makeFrontmatter,
  makeTicketDocument,
  serializeIssueMarkdown,
  type Actor,
} from "../src/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

type BenchmarkTiming = {
  readonly ms: number;
  readonly name: string;
  readonly operations?: number;
  readonly unit?: string;
};

type BenchmarkMetric = {
  readonly operations: number;
  readonly unit: string;
};

const TICKET_COUNT = Number.parseInt(process.env.DATABASE_BENCHMARK_TICKETS ?? "250", 10);
const COMMENT_COUNT = Number.parseInt(process.env.DATABASE_BENCHMARK_COMMENTS ?? "50", 10);
const EXTERNAL_BATCH_COUNT = Number.parseInt(
  process.env.DATABASE_BENCHMARK_EXTERNAL_TICKETS ?? "75",
  10,
);
const TEST_TIMEOUT_MS = 300_000;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const benchmarkDatabaseName = () =>
  `cycle-database-benchmark-${process.pid}-${Date.now()}`.toLowerCase();

describe("@cycle/database benchmark", () => {
  it.effect(
    "benchmarks real .git writes, reads, and explicit sync",
    () =>
      Effect.gen(function* () {
        const timings: Array<BenchmarkTiming> = [];
        const database = yield* DatabaseService;
        const store = yield* makeFilesystemStore(benchmarkDatabaseName());

        const opened = yield* timed(timings, "open repository + initial hydrate", () =>
          database.openRepository({
            displayName: "Cycle benchmark repository",
            pollIntervalMs: false,
            repositoryId: "cycle-local",
            store,
            worktreePath: REPO_ROOT,
          }),
        );

        assert.strictEqual(opened.status, "empty");

        const createdTickets: Array<string> = [];

        yield* timed(
          timings,
          `create ${TICKET_COUNT} tickets through DatabaseService`,
          () =>
            Effect.gen(function* () {
              for (let index = 0; index < TICKET_COUNT; index += 1) {
                const ticket = yield* database.createTicket("cycle-local", {
                  assignee: assigneeFor(index),
                  body: bodyFor(index),
                  labels: labelsFor(index),
                  priority: priorityFor(index),
                  repository: repositoryKeyFor(index),
                  title: `Benchmark ticket ${String(index + 1).padStart(4, "0")}`,
                  type: index % 20 === 0 ? "epic" : "issue",
                });

                createdTickets.push(ticket.id);
              }

              return createdTickets.length;
            }),
          (count) => ({
            operations: count,
            unit: "ticket write+sync",
          }),
        );

        yield* timed(
          timings,
          `add ${COMMENT_COUNT} comments through DatabaseService`,
          () =>
            Effect.gen(function* () {
              for (
                let index = 0;
                index < Math.min(COMMENT_COUNT, createdTickets.length);
                index += 1
              ) {
                yield* database.addComment("cycle-local", createdTickets[index]!, {
                  body: `Benchmark comment ${index + 1} mentioning sqlite sync and frontend visibility.`,
                });
              }

              return Math.min(COMMENT_COUNT, createdTickets.length);
            }),
          (count) => ({
            operations: count,
            unit: "comment write+sync",
          }),
        );

        yield* timed(
          timings,
          "read filtered first page",
          () =>
            database.listTickets({
              label: "sqlite",
              limit: 50,
              priority: "high",
              repositoryIds: ["cycle-local"],
            }),
          (page) => ({
            operations: page.entries.length,
            unit: "tickets read",
          }),
        );

        yield* timed(
          timings,
          "full-text search title/body/comments",
          () =>
            database.searchTickets({
              limit: 50,
              repositoryIds: ["cycle-local"],
              text: "sqlite sync",
            }),
          (page) => ({
            operations: page.entries.length,
            unit: "search results",
          }),
        );

        yield* timed(
          timings,
          "repository history first page",
          () =>
            database.repositoryHistory("cycle-local", {
              limit: 50,
            }),
          (page) => ({
            operations: page.entries.length,
            unit: "commits read",
          }),
        );

        yield* timed(
          timings,
          `write external GitDB batch of ${EXTERNAL_BATCH_COUNT} tickets`,
          () => writeExternalTicketBatch(store, EXTERNAL_BATCH_COUNT),
          (count) => ({
            operations: count,
            unit: "gitdb documents",
          }),
        );

        yield* timed(timings, "explicit sync external GitDB batch into SQLite", () =>
          database.syncRepository("cycle-local"),
        );

        const afterExternalSync = yield* timed(
          timings,
          "read externally synced tickets",
          () =>
            database.listTickets({
              label: "external",
              limit: EXTERNAL_BATCH_COUNT + 10,
              repositoryIds: ["cycle-local"],
            }),
          (page) => ({
            operations: page.entries.length,
            unit: "tickets read",
          }),
        );

        assert.strictEqual(afterExternalSync.entries.length, EXTERNAL_BATCH_COUNT);
        reportBenchmark(timings);
        yield* cleanupBenchmarkRef(store);
        yield* database.close();
      }).pipe(Effect.provide(DatabaseTest("bench"))),
    TEST_TIMEOUT_MS,
  );
});

const makeFilesystemStore = (database: string) =>
  Effect.gen(function* () {
    return yield* GitDbStore.StoreService;
  }).pipe(
    Effect.provide(
      GitDbFilesystem({
        cwd: REPO_ROOT,
        database,
        defaultPointer: "main",
        gitDir: ".git",
      }),
    ),
  );

const timed = <A>(
  timings: Array<BenchmarkTiming>,
  name: string,
  effect: () => Effect.Effect<A, unknown, never>,
  metric?: (result: A) => BenchmarkMetric,
): Effect.Effect<A, unknown, never> =>
  Effect.gen(function* () {
    const start = performance.now();
    const result = yield* effect();
    const elapsed = performance.now() - start;
    const measured = metric?.(result);

    timings.push({
      ms: elapsed,
      name,
      operations: measured?.operations,
      unit: measured?.unit,
    });

    return result;
  });

const writeExternalTicketBatch = (
  store: GitDbStore.StoreServiceShape,
  count: number,
): Effect.Effect<number, unknown, never> =>
  Effect.gen(function* () {
    const tx = yield* store.begin();
    const actor: Actor = {
      email: "benchmark@example.invalid",
      name: "Benchmark External Writer",
      type: "human",
    };
    const now = new Date().toISOString();

    for (let index = 0; index < count; index += 1) {
      const id = `iss_external_${String(index + 1).padStart(4, "0")}`;
      const ticket = makeTicketDocument(
        makeFrontmatter(
          {
            assignee: assigneeFor(index),
            body: externalBodyFor(index),
            labels: ["external", index % 2 === 0 ? "sqlite" : "sync"],
            priority: priorityFor(index),
            repository: repositoryKeyFor(index),
            title: `External benchmark ticket ${String(index + 1).padStart(4, "0")}`,
          },
          id,
          actor,
          now,
        ),
        externalBodyFor(index),
      );

      yield* tx.put(issueStorePath(id), serializeIssueMarkdown(ticket));
    }

    yield* tx.commit({
      author: {
        email: actor.email,
        name: actor.name,
      },
      committer: {
        email: actor.email,
        name: actor.name,
      },
      message: `Benchmark external batch: ${count} tickets`,
    });

    return count;
  });

const cleanupBenchmarkRef = (
  store: GitDbStore.StoreServiceShape,
): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    const pointer = yield* store.pointer("main");

    yield* pointer.delete();
  }).pipe(Effect.orElseSucceed(() => undefined));

const issueStorePath = (id: string): string =>
  `collections/issues/${createHash("sha1").update(id).digest("hex").slice(0, 2)}/${id}.md`;

const bodyFor = (index: number): string =>
  [
    "## Problem",
    "",
    `Benchmark problem ${index + 1} for sqlite materialized reads.`,
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] Database read path remains queryable after each write.",
    "",
    "## Implementation Plan",
    "",
    "- Measure GitDB write throughput.",
    "- Measure SQLite sync and search throughput.",
  ].join("\n");

const externalBodyFor = (index: number): string =>
  `External GitDB batch ticket ${index + 1} for explicit sync benchmarking.`;

const labelsFor = (index: number): ReadonlyArray<string> => [
  index % 2 === 0 ? "sqlite" : "gitdb",
  index % 5 === 0 ? "sync" : "benchmark",
];

const priorityFor = (index: number): string =>
  index % 7 === 0 ? "urgent" : index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low";

const assigneeFor = (index: number): string =>
  ["Robert Pitt", "Cycle Agent", "Runtime Team", "Design Tools"][index % 4]!;

const repositoryKeyFor = (index: number): string =>
  ["cycle", "cycle-ui", "cycle-desktop"][index % 3]!;

const reportBenchmark = (timings: ReadonlyArray<BenchmarkTiming>): void => {
  const rows = timings.map((timing) => {
    const perOperation =
      timing.operations === undefined || timing.operations === 0
        ? undefined
        : timing.ms / timing.operations;

    return {
      "ms/op": perOperation === undefined ? "" : perOperation.toFixed(2),
      ms: timing.ms.toFixed(2),
      name: timing.name,
      operations: timing.operations ?? "",
      unit: timing.unit ?? "",
    };
  });

  console.log("\n@cycle/database benchmark");
  console.table(rows);
};
