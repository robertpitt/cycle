#!/usr/bin/env node
import { createHash } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { GitDbFilesystem, Store as GitDbStore } from "@cycle/git-db";
import { Effect, Layer } from "effect";
import {
  DatabaseIdGeneratorDeterministic,
  DatabaseIdentityTest,
  DatabaseLive,
  DatabaseService,
  makeFrontmatter,
  makeTicketDocument,
  serializeIssueMarkdown,
} from "../src/index.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "../../..");

const actor = {
  email: "seed@example.invalid",
  name: "Cycle Performance Seeder",
  type: "import",
};

const priorities = ["urgent", "high", "medium", "low"];
const assignees = ["Robert Pitt", "Cycle Agent", "Runtime Team", "Design Tools", "QA"];
const repositories = ["cycle", "cycle-desktop", "cycle-rpc", "cycle-database"];
const statuses = ["backlog", "todo", "in-progress", "review", "done"];
const labelGroups = [
  ["performance", "sqlite"],
  ["gitdb", "sync"],
  ["frontend", "search"],
  ["history", "comments"],
  ["benchmark", "pagination"],
];

const config = parseArgs(process.argv.slice(2));

if (config.help) {
  printHelp();
  process.exit(0);
}

await Effect.runPromise(seed(config)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function seed(options) {
  const databaseLayer = DatabaseLive.pipe(
    Layer.provide(
      Layer.mergeAll(DatabaseIdentityTest(actor), DatabaseIdGeneratorDeterministic("seed")),
    ),
  );

  return Effect.gen(function* () {
    const store = yield* GitDbStore.StoreService;
    const database = yield* DatabaseService;
    const beforeSnapshot = yield* store.currentSnapshotForPointer(options.pointer);
    const startedAt = performance.now();
    let ticketsWritten = 0;
    let commentsWritten = 0;
    let commitsWritten = 0;

    for (let batchStart = 0; batchStart < options.tickets; batchStart += options.batchSize) {
      const batchEnd = Math.min(batchStart + options.batchSize, options.tickets);
      const tx = yield* store.begin(options.pointer);

      for (let index = batchStart; index < batchEnd; index += 1) {
        const ticket = makeSeedTicket(index, options);

        yield* tx.put(issueStorePath(ticket.id), serializeIssueMarkdown(ticket));
        ticketsWritten += 1;

        for (const record of makeSeedRecords(ticket, index, options)) {
          yield* tx.put(recordStorePath(record.id), record);
          if (record.recordType === "comment") commentsWritten += 1;
        }
      }

      const snapshot = yield* tx.commit({
        author: actor,
        committer: actor,
        message: `Seed ${options.prefix} tickets ${batchStart + 1}-${batchEnd}`,
      });

      commitsWritten += 1;
      console.log(
        `Committed batch ${commitsWritten}: tickets ${batchStart + 1}-${batchEnd} -> ${snapshot.id.slice(0, 12)}`,
      );
    }

    const writeMs = performance.now() - startedAt;
    const afterSnapshot = yield* store.currentSnapshotForPointer(options.pointer);
    let verification = undefined;

    if (options.verify) {
      verification = yield* verifyProjection(database, store, options);
    }

    yield* database.close();

    console.log(
      JSON.stringify(
        {
          afterSnapshotId: afterSnapshot?.id ?? null,
          beforeSnapshotId: beforeSnapshot?.id ?? null,
          commentsWritten,
          commitsWritten,
          database: options.database,
          pointer: options.pointer,
          prefix: options.prefix,
          repositoryId: options.repositoryId,
          ticketsWritten,
          verification,
          writeMs: Number(writeMs.toFixed(2)),
        },
        null,
        2,
      ),
    );
  }).pipe(
    Effect.provide(databaseLayer),
    Effect.provide(
      GitDbFilesystem({
        cwd: options.repoRoot,
        database: options.database,
        defaultPointer: options.pointer,
        gitDir: options.gitDir,
      }),
    ),
  );
}

function makeSeedTicket(index, options) {
  const number = index + 1;
  const id = `iss_${options.prefix}_${String(number).padStart(4, "0")}`;
  const createdAt = isoFor(index);
  const labels = [
    ...labelGroups[index % labelGroups.length],
    `seed-${String(index % 10).padStart(2, "0")}`,
  ];
  const body = bodyFor(number, labels);

  return makeTicketDocument(
    makeFrontmatter(
      {
        assignee: assignees[index % assignees.length],
        labels,
        priority: priorities[index % priorities.length],
        repository: repositories[index % repositories.length],
        status: statuses[index % statuses.length],
        title: `Performance seed ticket ${String(number).padStart(4, "0")}`,
        type: index % 25 === 0 ? "epic" : "issue",
      },
      id,
      actor,
      createdAt,
    ),
    body,
  );
}

function makeSeedRecords(ticket, index, options) {
  const number = index + 1;
  const createdAt = isoFor(index);
  const records = [
    makeRecord({
      createdAt,
      id: `${ticket.id}_provenance_rec_${options.prefix}_${String(number).padStart(4, "0")}`,
      issueId: ticket.id,
      payload: {
        importBatch: Math.floor(index / options.batchSize) + 1,
        source: "performance-seed",
      },
      recordType: "provenance",
    }),
    makeRecord({
      createdAt,
      id: `${ticket.id}_status-change_rec_${options.prefix}_${String(number).padStart(4, "0")}`,
      issueId: ticket.id,
      payload: {
        from: null,
        to: ticket.status,
      },
      recordType: "status-change",
    }),
  ];

  for (let commentIndex = 0; commentIndex < options.commentsPerTicket; commentIndex += 1) {
    const commentNumber = commentIndex + 1;

    records.push(
      makeRecord({
        createdAt: isoFor(index, commentNumber * 1000),
        id: `${ticket.id}_comment_rec_${options.prefix}_${String(commentNumber).padStart(2, "0")}`,
        issueId: ticket.id,
        payload: {
          body: `Performance comment ${commentNumber} for ticket ${number}; searchable sqlite gitdb sync timeline dashboard pagination latency throughput.`,
        },
        recordType: "comment",
      }),
    );
  }

  return records;
}

function makeRecord({ createdAt, id, issueId, payload, recordType }) {
  return {
    createdAt,
    createdBy: actor,
    createdDate: createdAt.slice(0, 10),
    id,
    issueId,
    payload,
    recordType: normalizeKey(recordType),
    schemaVersion: 1,
  };
}

function verifyProjection(database, store, options) {
  return Effect.gen(function* () {
    const hydrateStartedAt = performance.now();
    const status = yield* database.openRepository({
      displayName: "Cycle local repository",
      pollIntervalMs: false,
      repositoryId: options.repositoryId,
      store,
      worktreePath: options.repoRoot,
    });
    const hydrateMs = performance.now() - hydrateStartedAt;
    const listStartedAt = performance.now();
    const seededTickets = yield* countSeededTickets(database, options);
    const listMs = performance.now() - listStartedAt;
    const searchStartedAt = performance.now();
    const searchPage = yield* database.searchTickets({
      limit: Math.min(options.tickets, 1000),
      repositoryIds: [options.repositoryId],
      text: "throughput",
    });
    const searchMs = performance.now() - searchStartedAt;

    return {
      hydrateMs: Number(hydrateMs.toFixed(2)),
      listSeededTicketsMs: Number(listMs.toFixed(2)),
      repositoryStatus: status.status,
      searchMs: Number(searchMs.toFixed(2)),
      searchThroughputCount: searchPage.entries.length,
      seededTickets,
      warningCount: status.warningCount,
    };
  });
}

function countSeededTickets(database, options) {
  return Effect.gen(function* () {
    let cursor = undefined;
    let count = 0;

    do {
      const page = yield* database.listTickets({
        cursor,
        limit: 500,
        orderBy: "title",
        orderDirection: "asc",
        repositoryIds: [options.repositoryId],
      });

      for (const ticket of page.entries) {
        if (ticket.id.startsWith(`iss_${options.prefix}_`)) count += 1;
      }

      cursor = page.nextCursor;
    } while (cursor !== undefined);

    return count;
  });
}

function parseArgs(args) {
  const parsed = {
    batchSize: readIntEnv("CYCLE_SEED_BATCH_SIZE", 100),
    commentsPerTicket: readIntEnv("CYCLE_SEED_COMMENTS_PER_TICKET", 1),
    database: process.env.CYCLE_SEED_DATABASE ?? "cycle",
    gitDir: process.env.CYCLE_SEED_GIT_DIR ?? ".git",
    help: false,
    pointer: process.env.CYCLE_SEED_POINTER ?? "main",
    prefix: process.env.CYCLE_SEED_PREFIX ?? "perf_seed",
    repoRoot: process.env.CYCLE_SEED_REPO_ROOT ?? defaultRepoRoot,
    repositoryId: process.env.CYCLE_SEED_REPOSITORY_ID ?? "cycle-local",
    tickets: readIntEnv("CYCLE_SEED_TICKETS", 1000),
    verify: process.env.CYCLE_SEED_VERIFY !== "false",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [name, inlineValue] = arg.split("=", 2);
    const value = () => inlineValue ?? args[++index];

    switch (name) {
      case "--":
        break;
      case "--batch-size":
        parsed.batchSize = readPositiveInt("--batch-size", value());
        break;
      case "--comments-per-ticket":
        parsed.commentsPerTicket = readNonNegativeInt("--comments-per-ticket", value());
        break;
      case "--database":
        parsed.database = readString("--database", value());
        break;
      case "--git-dir":
        parsed.gitDir = readString("--git-dir", value());
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--no-verify":
        parsed.verify = false;
        break;
      case "--pointer":
        parsed.pointer = readString("--pointer", value());
        break;
      case "--prefix":
        parsed.prefix = normalizeKey(readString("--prefix", value()), "perf-seed").replaceAll(
          "-",
          "_",
        );
        break;
      case "--repo-root":
        parsed.repoRoot = path.resolve(readString("--repo-root", value()));
        break;
      case "--repository-id":
        parsed.repositoryId = readString("--repository-id", value());
        break;
      case "--tickets":
        parsed.tickets = readPositiveInt("--tickets", value());
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  parsed.repoRoot = path.resolve(parsed.repoRoot);

  if (parsed.batchSize > parsed.tickets) parsed.batchSize = parsed.tickets;

  return parsed;
}

function readIntEnv(name, fallback) {
  const value = process.env[name];

  return value === undefined ? fallback : readPositiveInt(name, value);
}

function readPositiveInt(name, value) {
  const parsed = Number.parseInt(readString(name, value), 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readNonNegativeInt(name, value) {
  const parsed = Number.parseInt(readString(name, value), 10);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

function readString(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function issueStorePath(id) {
  return `collections/issues/${shaPrefix(id)}/${id}.md`;
}

function recordStorePath(id) {
  return `collections/records/${shaPrefix(id)}/${id}.json`;
}

function shaPrefix(id) {
  return createHash("sha1").update(id).digest("hex").slice(0, 2);
}

function isoFor(index, offsetMs = 0) {
  return new Date(Date.UTC(2026, 5, 10, 8, 0, 0) + index * 60_000 + offsetMs).toISOString();
}

function bodyFor(number, labels) {
  return [
    "## Problem",
    "",
    `Performance seed ticket ${number} exercises the materialized SQLite read model for repository queries, search, filtering, pagination, and history.`,
    "",
    "## Context",
    "",
    `This ticket includes searchable terms: ${labels.join(" ")}, sqlite, gitdb, sync, dashboard, timeline.`,
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] Ticket appears in list queries without reopening the repository.",
    "- [ ] Full text search can match title, body, and comments.",
    "- [ ] Repository and ticket history remain available from the commit graph.",
    "",
    "## Implementation Plan",
    "",
    "- Load GitDB snapshot into SQLite.",
    "- Query tickets through the relational projection.",
    "- Sync after commit changes are detected.",
  ].join("\n");
}

function normalizeKey(value, fallback = "none") {
  if (value === null || value === undefined) return fallback;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^[._-]+/u, "")
    .replace(/[._-]+$/u, "");

  return normalized.length === 0 ? fallback : normalized;
}

function printHelp() {
  console.log(`Seed the Cycle GitDB ticket database.

Usage:
  pnpm --filter @cycle/database seed:cycle -- [options]
  node packages/database/scripts/seed-cycle-database.mjs [options]

Options:
  --tickets <number>              Number of tickets to upsert. Default: 1000
  --comments-per-ticket <number>  Visible comments per ticket. Default: 1
  --batch-size <number>           Tickets per GitDB commit. Default: 100
  --prefix <value>                Stable ID prefix. Default: perf_seed
  --database <name>               GitDB database name. Default: cycle
  --pointer <name>                GitDB pointer name. Default: main
  --repo-root <path>              Repository root containing .git. Default: workspace root
  --git-dir <path>                Git directory path. Default: .git
  --repository-id <id>            Projection repository id for verification. Default: cycle-local
  --no-verify                     Skip SQLite hydrate/read/search verification
  --help                          Show this help

Environment variables with the CYCLE_SEED_* prefix are also supported.
Rerunning with the same prefix updates the same stable ticket IDs.`);
}
