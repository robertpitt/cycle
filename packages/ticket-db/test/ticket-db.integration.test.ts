import { performance } from "node:perf_hooks";
import { GitDbFilesystem, GitDbInMemory, Store as GitDbStore } from "@cycle/git-db";
import { Effect, Layer } from "effect";
import {
  Actor,
  CURRENT_SCHEMA_VERSION,
  DraftSession,
  IssueDocument,
  LinkedRecord,
  TicketDbLive,
  TicketDbService,
  TicketIdentityTest,
  TicketIdGeneratorDeterministic,
  WorkflowPolicyDefault,
  makeIssueDocument,
  makeIssueFrontmatter,
  normalizeKey,
  updatedDateKey,
  type CreateDraftInput,
  type CreateIssueInput,
  type IssueQuery,
  type TicketDbServiceShape,
} from "../src/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const ISSUE_COUNT = 1_000;
const DRAFT_COUNT = 120;
const PAGE_LIMIT = 37;
const SEED_TIMESTAMP = "2026-06-09T12:00:00.000Z";
const BENCHMARK_BACKEND = process.env.TICKET_DB_BENCHMARK_BACKEND ?? "memory";
const BENCHMARK_CWD = process.env.TICKET_DB_BENCHMARK_CWD ?? process.cwd();
const BENCHMARK_GIT_DIR = process.env.TICKET_DB_BENCHMARK_GIT_DIR ?? ".git";
const BENCHMARK_DATABASE = process.env.TICKET_DB_BENCHMARK_DATABASE ?? "cycle-ticket-db-benchmark";
const BENCHMARK_POINTER =
  process.env.TICKET_DB_BENCHMARK_POINTER ?? `bench-${process.pid}-${Date.now()}`;
const TEST_TIMEOUT_MS = BENCHMARK_BACKEND === "filesystem" ? 300_000 : 120_000;

const ISSUE_INDEXES = [
  "status",
  "priority",
  "type",
  "assignee",
  "parent",
  "updatedDate",
  "labels",
  "createdBy",
  "repository",
] as const;

const RECORD_INDEXES = ["issueId", "recordType", "createdDate"] as const;
const DRAFT_INDEXES = ["status", "createdByKey", "updatedDate"] as const;

type BenchmarkTiming = {
  readonly name: string;
  readonly ms: number;
  readonly operations?: number;
  readonly unit?: string;
};

type CollectionEntryLike<T> = {
  readonly id: string;
  readonly value: T;
};

type RandomSource = {
  readonly chance: (probability: number) => boolean;
  readonly int: (maxExclusive: number) => number;
  readonly pick: <A>(values: ReadonlyArray<A>) => A;
  readonly subset: <A>(values: ReadonlyArray<A>, maxItems: number) => ReadonlyArray<A>;
};

type IndexExpectations = ReadonlyMap<string, ReadonlyArray<string>>;

type BenchmarkMetric = {
  readonly operations: number;
  readonly unit: string;
};

type BenchmarkSeed = {
  readonly documentCount: number;
  readonly extraRecordCount: number;
  readonly issues: ReadonlyArray<IssueDocument>;
  readonly recordCount: number;
};

const statuses = [
  "backlog",
  "todo",
  "ready",
  "in-progress",
  "needs-review",
  "in-review",
  "done",
  "canceled",
] as const;

const priorities = ["none", "low", "medium", "high", "urgent"] as const;
const types = ["issue", "epic"] as const;
const assignees = [
  "Robert Pitt",
  "Cycle Agent",
  "Design Tools",
  "Runtime Team",
  "QA Review",
  "Integration Owner",
] as const;
const repositories = ["cycle", "cycle-ui", "cycle-desktop", "cycle-agents"] as const;
const labels = [
  "frontend",
  "backend",
  "git-db",
  "ticket-db",
  "workflow",
  "priority",
  "import",
  "sync",
  "agent",
  "qa",
] as const;
const extraRecordTypes = ["comment", "execution", "review", "import", "conflict"] as const;

describe("@cycle/ticket-db integration", () => {
  it.effect(
    "generates 1000 seeded random tickets, validates GitDB indexes, and records benchmark timings",
    () =>
      Effect.gen(function* () {
        const timings: Array<BenchmarkTiming> = [];
        const rng = makeRandomSource(0xc1c1e);
        const ticketDb = yield* TicketDbService;
        const store = yield* GitDbStore.StoreService;

        const seed = yield* timed(
          timings,
          "bulk seed 1000 issues, records, and drafts",
          () => seedTicketDbDataset(store, rng),
          (result) => ({
            operations: result.documentCount,
            unit: "documents written",
          }),
        );

        yield* timed(
          timings,
          "validate public issue queries",
          () => validateTicketDbIssueQueries(ticketDb, seed.issues),
          (operations) => ({
            operations,
            unit: "issue results read",
          }),
        );

        yield* timed(
          timings,
          "validate raw issue indexes",
          () =>
            Effect.gen(function* () {
              const issues = yield* store.collection<IssueDocument>("issues", {
                indexes: [...ISSUE_INDEXES],
              });
              const entries = yield* issues.list();

              assert.strictEqual(entries.length, ISSUE_COUNT);
              const indexEntries = yield* validateCollectionIndexes(issues, ISSUE_INDEXES, entries);

              return entries.length + indexEntries;
            }),
          (operations) => ({
            operations,
            unit: "documents/index entries verified",
          }),
        );

        yield* timed(
          timings,
          "validate raw record indexes",
          () =>
            Effect.gen(function* () {
              const records = yield* store.collection<LinkedRecord>("records", {
                indexes: [...RECORD_INDEXES],
              });
              const entries = yield* records.list();

              assert.strictEqual(entries.length, ISSUE_COUNT * 2 + seed.extraRecordCount);
              const indexEntries = yield* validateCollectionIndexes(
                records,
                RECORD_INDEXES,
                entries,
              );
              const sampledRecords = yield* validateRecordsForIssueSamples(
                ticketDb,
                entries,
                seed.issues,
              );

              return entries.length + indexEntries + sampledRecords;
            }),
          (operations) => ({
            operations,
            unit: "documents/index entries verified",
          }),
        );

        yield* timed(
          timings,
          "validate raw draft indexes",
          () =>
            Effect.gen(function* () {
              const drafts = yield* store.collection<DraftSession>("drafts", {
                indexes: [...DRAFT_INDEXES],
              });
              const entries = yield* drafts.list();

              assert.strictEqual(entries.length, DRAFT_COUNT);
              const indexEntries = yield* validateCollectionIndexes(drafts, DRAFT_INDEXES, entries);

              return entries.length + indexEntries;
            }),
          (operations) => ({
            operations,
            unit: "documents/index entries verified",
          }),
        );

        reportBenchmark(timings, {
          backend: BENCHMARK_BACKEND,
          database: store.config.database,
          drafts: DRAFT_COUNT,
          extraRecords: seed.extraRecordCount,
          gitDir: store.config.gitDir,
          issues: ISSUE_COUNT,
          pointer: store.config.defaultPointer,
          recordCount: seed.recordCount,
          refPrefix: store.refPrefix,
        });
      }).pipe(Effect.provide(IntegrationLayer)),
    TEST_TIMEOUT_MS,
  );
});

const IntegrationLayer = TicketDbLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      makeBenchmarkGitDbLayer(),
      TicketIdentityTest(),
      TicketIdGeneratorDeterministic("bulk"),
      WorkflowPolicyDefault,
    ),
  ),
);

function makeBenchmarkGitDbLayer() {
  const options = {
    cwd: BENCHMARK_CWD,
    database: BENCHMARK_DATABASE,
    defaultPointer: BENCHMARK_POINTER,
    gitDir: BENCHMARK_GIT_DIR,
  };

  if (BENCHMARK_BACKEND === "filesystem") return GitDbFilesystem(options);

  return GitDbInMemory({
    database: "cycle",
  });
}

const timed = <A>(
  timings: Array<BenchmarkTiming>,
  name: string,
  effect: () => Effect.Effect<A, unknown, never>,
  metric?: (result: A) => BenchmarkMetric,
): Effect.Effect<A, unknown, never> =>
  Effect.gen(function* () {
    const start = performance.now();
    const result = yield* effect();
    const measured = metric?.(result);

    timings.push({
      ms: performance.now() - start,
      name,
      operations: measured?.operations,
      unit: measured?.unit,
    });

    return result;
  });

const seedTicketDbDataset = (
  store: GitDbStore.StoreServiceShape,
  rng: RandomSource,
): Effect.Effect<BenchmarkSeed, unknown, never> =>
  Effect.gen(function* () {
    const actor = new Actor({
      email: "benchmark@example.invalid",
      name: "Benchmark User",
      type: "human",
    });
    const issues: Array<IssueDocument> = [];
    let recordSequence = 0;
    let extraRecordCount = 0;
    const tx = yield* store.begin();
    const issueCollection = yield* tx.collection<IssueDocument>("issues", {
      indexes: [...ISSUE_INDEXES],
    });
    const recordCollection = yield* tx.collection<LinkedRecord>("records", {
      indexes: [...RECORD_INDEXES],
    });
    const draftCollection = yield* tx.collection<DraftSession>("drafts", {
      indexes: [...DRAFT_INDEXES],
    });

    for (let index = 0; index < ISSUE_COUNT; index += 1) {
      const input = makeRandomIssueInput(index, rng, issues);
      const issue = makeSeededIssueDocument(
        `iss_bulk_${String(index + 1).padStart(4, "0")}`,
        input,
        actor,
      );

      issues.push(issue);
      yield* issueCollection.put(issue.id, issue);
      const provenanceId = makeRecordDocumentId(
        issue.id,
        "provenance",
        nextRecordId(++recordSequence),
      );

      yield* recordCollection.put(
        provenanceId,
        makeSeededRecord(issue.id, "provenance", provenanceId, actor, {
          actor,
          timestamp: SEED_TIMESTAMP,
        }),
      );
      const statusChangeId = makeRecordDocumentId(
        issue.id,
        "status-change",
        nextRecordId(++recordSequence),
      );

      yield* recordCollection.put(
        statusChangeId,
        makeSeededRecord(issue.id, "status-change", statusChangeId, actor, {
          from: null,
          to: issue.status,
        }),
      );

      if (index % 4 === 0) {
        const recordType = extraRecordTypes[(index / 4) % extraRecordTypes.length];
        const recordId = makeRecordDocumentId(issue.id, recordType, nextRecordId(++recordSequence));

        yield* recordCollection.put(
          recordId,
          makeSeededRecord(issue.id, recordType, recordId, actor, {
            body: `Seeded ${recordType} payload for ${issue.id}`,
            sequence: index,
          }),
        );
        extraRecordCount += 1;
      }
    }

    for (let index = 0; index < DRAFT_COUNT; index += 1) {
      const draftStatus = index % 3 === 0 ? "open" : index % 3 === 1 ? "ready" : "abandoned";
      const draftId = `drf_bulk_${String(index + 1).padStart(4, "0")}`;

      yield* draftCollection.put(
        draftId,
        makeSeededDraftSession(
          draftId,
          `iss_bulk_draft_${String(index + 1).padStart(4, "0")}`,
          makeRandomDraftInput(index, rng),
          actor,
          draftStatus,
        ),
      );
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
      message: `Seed ${ISSUE_COUNT} TicketDB benchmark issues`,
    });

    return {
      documentCount: issues.length + recordSequence + DRAFT_COUNT,
      extraRecordCount,
      issues,
      recordCount: recordSequence,
    };
  });

const makeRandomSource = (seed: number): RandomSource => {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;

    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const source: RandomSource = {
    chance: (probability) => next() < probability,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick: (values) => values[source.int(values.length)] as never,
    subset: (values, maxItems) => {
      const count = source.int(maxItems + 1);
      const selected = new Set<number>();

      while (selected.size < count && selected.size < values.length) {
        selected.add(source.int(values.length));
      }

      return [...selected].map((index) => values[index] as never);
    },
  };

  return source;
};

const makeRandomIssueInput = (
  index: number,
  rng: RandomSource,
  createdIssues: ReadonlyArray<IssueDocument>,
): CreateIssueInput => ({
  assignee: rng.chance(0.18) ? null : rng.pick(assignees),
  labels: rng.subset(labels, 3),
  parent:
    createdIssues.length > 0 && rng.chance(0.16)
      ? rng.pick(createdIssues).id
      : rng.chance(0.08)
        ? null
        : undefined,
  priority: rng.pick(priorities),
  repository: rng.chance(0.72) ? rng.pick(repositories) : undefined,
  status: rng.pick(statuses),
  title: `Seeded issue ${String(index + 1).padStart(4, "0")}`,
  type: rng.pick(types),
});

const makeRandomDraftInput = (index: number, rng: RandomSource): CreateDraftInput => ({
  assignee: rng.chance(0.2) ? null : rng.pick(assignees),
  labels: rng.subset(labels, 2),
  priority: rng.pick(priorities),
  repository: rng.chance(0.6) ? rng.pick(repositories) : undefined,
  source: {
    benchmark: true,
    index,
  },
  status: rng.pick(statuses),
  title: `Seeded draft ${String(index + 1).padStart(3, "0")}`,
  type: rng.pick(types),
});

const makeSeededIssueDocument = (
  id: string,
  input: CreateIssueInput,
  actor: Actor,
): IssueDocument =>
  makeIssueDocument(
    makeIssueFrontmatter({
      assignee: input.assignee,
      createdAt: SEED_TIMESTAMP,
      createdBy: actor,
      externalLinks: input.externalLinks,
      id,
      labels: input.labels,
      parent: input.parent,
      planningNotRequired: input.planningNotRequired,
      priority: input.priority ?? "none",
      repository: input.repository,
      status: input.status ?? "backlog",
      title: input.title,
      type: input.type ?? "issue",
      updatedAt: SEED_TIMESTAMP,
    }),
    benchmarkIssueBody(input.title),
  );

const benchmarkIssueBody = (title: string): string => `## Summary

Seeded benchmark ticket for ${title}.

## Acceptance Criteria

- Index queries return this ticket when its normalized metadata matches.

## Implementation Plan

- Seed deterministic data.
- Validate TicketDB query indexes against raw GitDB index entries.
`;

const makeSeededRecord = (
  issueId: string,
  recordType: string,
  id: string,
  actor: Actor,
  payload: unknown,
): LinkedRecord =>
  new LinkedRecord({
    createdAt: SEED_TIMESTAMP,
    createdBy: actor,
    createdDate: updatedDateKey(SEED_TIMESTAMP),
    id,
    issueId,
    payload,
    recordType,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

const makeSeededDraftSession = (
  draftId: string,
  issueId: string,
  input: CreateDraftInput,
  actor: Actor,
  status: "abandoned" | "open" | "ready",
): DraftSession =>
  new DraftSession({
    createdAt: SEED_TIMESTAMP,
    createdBy: actor,
    createdByKey: normalizeKey(actor.email ?? actor.name),
    id: draftId,
    issue: makeSeededIssueDocument(issueId, input, actor),
    records: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    source: input.source,
    status,
    updatedAt: SEED_TIMESTAMP,
    updatedDate: updatedDateKey(SEED_TIMESTAMP),
  });

const nextRecordId = (sequence: number): string => `rec_bulk_${String(sequence).padStart(5, "0")}`;

const makeRecordDocumentId = (issueId: string, recordType: string, recordId: string): string =>
  `${issueId}_${normalizeKey(recordType)}_${recordId}`;

const validateTicketDbIssueQueries = (
  ticketDb: TicketDbServiceShape,
  issues: ReadonlyArray<IssueDocument>,
): Effect.Effect<number, unknown, never> =>
  Effect.gen(function* () {
    const expectations = issueIndexExpectations(issues);
    const allIssues = yield* listAllIssues(ticketDb, {});
    let resultsRead = allIssues.length;

    assert.strictEqual(allIssues.length, issues.length);

    resultsRead += yield* validateTicketDbIndex(ticketDb, expectations.get("status")!, (key) => ({
      status: key,
    }));
    resultsRead += yield* validateTicketDbIndex(ticketDb, expectations.get("priority")!, (key) => ({
      priority: key,
    }));
    resultsRead += yield* validateTicketDbIndex(ticketDb, expectations.get("type")!, (key) => ({
      type: key,
    }));
    resultsRead += yield* validateTicketDbIndex(ticketDb, expectations.get("assignee")!, (key) => ({
      assignee: key === "none" ? null : key,
    }));
    resultsRead += yield* validateTicketDbIndex(ticketDb, expectations.get("parent")!, (key) => ({
      parent: key === "none" ? null : key,
    }));
    resultsRead += yield* validateTicketDbIndex(ticketDb, expectations.get("labels")!, (key) => ({
      label: key,
    }));

    return resultsRead;
  });

const validateTicketDbIndex = (
  ticketDb: TicketDbServiceShape,
  expected: IndexExpectations,
  query: (key: string) => IssueQuery,
): Effect.Effect<number, unknown, never> =>
  Effect.gen(function* () {
    let resultsRead = 0;

    for (const [key, expectedIds] of expected) {
      const actual = yield* listAllIssues(ticketDb, query(key));
      resultsRead += actual.length;

      assert.deepStrictEqual(
        sortedIds(actual),
        sortedStrings(expectedIds),
        `TicketDb listIssues mismatch for ${JSON.stringify(query(key))}`,
      );
    }

    return resultsRead;
  });

const listAllIssues = (
  ticketDb: TicketDbServiceShape,
  query: IssueQuery,
): Effect.Effect<ReadonlyArray<IssueDocument>, unknown, never> =>
  Effect.gen(function* () {
    const entries: Array<IssueDocument> = [];
    let cursor: string | undefined;

    do {
      const page = yield* ticketDb.listIssues({
        ...query,
        cursor,
        limit: PAGE_LIMIT,
      });

      entries.push(...page.entries);
      cursor = page.nextCursor;
    } while (cursor !== undefined);

    return entries;
  });

const validateRecordsForIssueSamples = (
  ticketDb: TicketDbServiceShape,
  recordEntries: ReadonlyArray<CollectionEntryLike<LinkedRecord>>,
  issues: ReadonlyArray<IssueDocument>,
): Effect.Effect<number, unknown, never> =>
  Effect.gen(function* () {
    const expectedByIssue = groupEntries(recordEntries, (entry) => [entry.value.issueId]);
    const sampleIds = new Set<string>();
    let recordsRead = 0;

    for (let index = 0; index < issues.length; index += 97) {
      sampleIds.add(issues[index].id);
    }
    sampleIds.add(issues[issues.length - 1].id);

    for (const issueId of sampleIds) {
      const actual = yield* ticketDb.recordsForIssue(issueId);
      recordsRead += actual.length;

      assert.deepStrictEqual(
        sortedIds(actual),
        sortedStrings(expectedByIssue.get(issueId) ?? []),
        `TicketDb recordsForIssue mismatch for ${issueId}`,
      );
    }

    return recordsRead;
  });

const validateCollectionIndexes = <T extends object>(
  collection: GitDbStore.StoreCollection<T>,
  indexes: ReadonlyArray<keyof T & string>,
  entries: ReadonlyArray<CollectionEntryLike<T>>,
): Effect.Effect<number, unknown, never> =>
  Effect.gen(function* () {
    let validatedEntries = 0;

    for (const name of indexes) {
      const expected = groupEntries(entries, (entry) => valuesForIndex(entry.value[name]));
      const index = yield* collection.index<T>(name);

      for (const [key, expectedIds] of expected) {
        const actual = yield* index.get(key);
        validatedEntries += actual.length;

        assert.deepStrictEqual(
          sortedIds(actual),
          sortedStrings(expectedIds),
          `${collection.name}.${name} index mismatch for key ${key}`,
        );
      }
    }

    return validatedEntries;
  });

const issueIndexExpectations = (
  issues: ReadonlyArray<IssueDocument>,
): ReadonlyMap<string, IndexExpectations> => {
  const entries = issues.map((issue) => ({
    id: issue.id,
    value: issue,
  }));

  return new Map(
    ISSUE_INDEXES.map((name) => [
      name,
      groupEntries(entries, (entry) => valuesForIndex(entry.value[name])),
    ]),
  );
};

const groupEntries = <T>(
  entries: ReadonlyArray<{
    readonly id: string;
    readonly value: T;
  }>,
  values: (entry: { readonly id: string; readonly value: T }) => ReadonlyArray<string>,
): IndexExpectations => {
  const grouped = new Map<string, Array<string>>();

  for (const entry of entries) {
    for (const value of values(entry)) {
      const existing = grouped.get(value);

      if (existing === undefined) {
        grouped.set(value, [entry.id]);
      } else {
        existing.push(entry.id);
      }
    }
  }

  return grouped;
};

const valuesForIndex = (value: unknown): ReadonlyArray<string> => {
  if (value === undefined) return [];

  const values = Array.isArray(value) ? value : [value];

  return values.map((entry) => normalizeKey(entry));
};

const sortedIds = (entries: ReadonlyArray<{ readonly id: string }>): ReadonlyArray<string> =>
  sortedStrings(entries.map((entry) => entry.id));

const sortedStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...values].sort((left, right) => left.localeCompare(right));

const reportBenchmark = (
  timings: ReadonlyArray<BenchmarkTiming>,
  counts: {
    readonly backend: string;
    readonly database: string;
    readonly drafts: number;
    readonly extraRecords: number;
    readonly gitDir: string;
    readonly issues: number;
    readonly pointer: string;
    readonly recordCount: number;
    readonly refPrefix: string;
  },
): void => {
  const totalMs = timings.reduce((total, timing) => total + timing.ms, 0);
  const sortedTimings = [...timings].sort((left, right) => right.ms - left.ms);
  const timingSummary = sortedTimings
    .map((timing) => {
      const rate =
        timing.operations === undefined || timing.unit === undefined
          ? ""
          : `, ${formatRate(timing.operations, timing.ms)} ${timing.unit}/s`;

      return `${timing.name}: ${timing.ms.toFixed(1)}ms${rate}`;
    })
    .join("; ");

  console.info(
    `TicketDB integration benchmark (${counts.backend}): ${counts.issues} issues, ${
      counts.recordCount
    } records (${counts.extraRecords} extra), ${counts.drafts} drafts in ${totalMs.toFixed(
      1,
    )}ms. Store: ${counts.refPrefix}/${counts.pointer} at ${counts.gitDir}. Database: ${
      counts.database
    }. Rates: ${timingSummary}`,
  );
};

const formatRate = (operations: number, ms: number): string =>
  `${(operations / Math.max(ms / 1_000, 0.001)).toFixed(1)}`;
