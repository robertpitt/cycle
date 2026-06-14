#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Event as GitDbEvent, GitDbFilesystem, Store as GitDbStore } from "@cycle/git-db";
import { Effect, Layer } from "effect";
import {
  CURRENT_SCHEMA_VERSION,
  DatabaseIdGeneratorDeterministic,
  DatabaseIdentityTest,
  DatabaseLiveWithOptions,
  DatabaseService,
  makeFrontmatter,
  makeTicketDocument,
  normalizeKey,
} from "../src/index.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "../../..");
const defaultCsv = path.join(defaultRepoRoot, "jira-board-export.csv");
const jiraKeyPattern = /^([A-Z0-9]{2,5})-([0-9A-Z]+)$/u;

const config = parseArgs(process.argv.slice(2));

if (config.help) {
  printHelp();
  process.exit(0);
}

await Effect.runPromise(importJiraBoardExport(config)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function importJiraBoardExport(options) {
  const importActor = {
    email: options.actorEmail,
    name: options.actorName,
    type: "import",
  };
  const databaseLayer = DatabaseLiveWithOptions({
    ...(options.projectionPath === undefined ? {} : { projectionPath: options.projectionPath }),
    logger: (event) =>
      logMetric(`database.${event.message}`, {
        ...(event.repositoryId === undefined ? {} : { repositoryId: event.repositoryId }),
        ...(event.data === undefined ? {} : event.data),
      }),
  }).pipe(
    Layer.provide(
      Layer.mergeAll(DatabaseIdentityTest(importActor), DatabaseIdGeneratorDeterministic("jira")),
    ),
  );

  return Effect.gen(function* () {
    logMetric("start", {
      batchSize: options.batchSize,
      csv: options.csv,
      database: options.database,
      pointer: options.pointer,
      repositoryId: options.repositoryId,
      sync: options.sync,
      syncOnly: options.syncOnly,
    });

    const store = yield* GitDbStore.StoreService;

    if (options.syncOnly) {
      const beforeSnapshot = yield* store.currentSnapshotForPointer(options.pointer);
      const projection = yield* syncProjection(store, options);

      console.log(
        JSON.stringify(
          {
            database: options.database,
            pointer: options.pointer,
            projection,
            repositoryId: options.repositoryId,
            snapshotId: beforeSnapshot?.id ?? null,
            syncOnly: true,
          },
          null,
          2,
        ),
      );
      return;
    }

    const csvReadStartedAt = performance.now();
    const csvText = yield* readText(options.csv);
    logMetric("csv.read", {
      bytes: Buffer.byteLength(csvText),
      ms: elapsedMs(csvReadStartedAt),
    });

    const csvParseStartedAt = performance.now();
    const rows = parseJiraCsv(csvText);
    logMetric("csv.parse", {
      ms: elapsedMs(csvParseStartedAt),
      rows: rows.length,
    });

    const transformStartedAt = performance.now();
    const selectedRows = rows.slice(
      options.offset,
      options.limit === undefined ? rows.length : options.offset + options.limit,
    );
    const importedAt = new Date().toISOString();
    const tickets = selectedRows.map((row) =>
      ticketFromJiraRow(row, {
        importActor,
        importedAt,
        repositoryId: options.repositoryId,
        rowNumber: row.rowNumber,
      }),
    );
    const labels = labelDefinitionsForTickets(tickets, importActor, importedAt);
    logMetric("tickets.transform", {
      labels: labels.length,
      ms: elapsedMs(transformStartedAt),
      offset: options.offset,
      selectedRows: selectedRows.length,
      sourceRows: rows.length,
      tickets: tickets.length,
    });

    if (options.dryRun) {
      console.log(
        JSON.stringify(
          {
            csv: options.csv,
            dryRun: true,
            duplicateTicketIds: duplicateIds(tickets.map((ticket) => ticket.id)),
            labels: labels.length,
            offset: options.offset,
            sourceRows: rows.length,
            statusCounts: countBy(tickets, (ticket) => ticket.frontmatter.jiraStatus),
            tickets: tickets.length,
            typeCounts: countBy(tickets, (ticket) => ticket.frontmatter.jiraIssueType),
          },
          null,
          2,
        ),
      );
      return;
    }

    const startedAt = performance.now();
    const beforeSnapshot = yield* store.currentSnapshotForPointer(options.pointer);
    let commitsWritten = 0;
    let labelsWritten = 0;
    let recordsWritten = 0;
    let ticketsWritten = 0;

    for (let batchStart = 0; batchStart < tickets.length; batchStart += options.batchSize) {
      const batchEnd = Math.min(batchStart + options.batchSize, tickets.length);
      const batchStartedAt = performance.now();
      let batchLabelsWritten = 0;
      let batchRecordsWritten = 0;
      let batchTicketsWritten = 0;
      const tx = yield* store.begin(options.pointer);

      if (batchStart === 0) {
        for (const label of labels) {
          yield* GitDbEvent.append(tx, {
            aggregateId: label.id,
            aggregateType: "label",
            eventId: eventId(options.eventSuffix, "label", label.id),
            payload: {
              op: "label.upsert",
              value: label,
            },
          });
          labelsWritten += 1;
          batchLabelsWritten += 1;
        }
      }

      for (const ticket of tickets.slice(batchStart, batchEnd)) {
        yield* GitDbEvent.append(tx, {
          aggregateId: ticket.id,
          aggregateType: "ticket",
          eventId: eventId(options.eventSuffix, "ticket-create"),
          payload: {
            op: "ticket.create",
            value: ticket,
          },
        });
        ticketsWritten += 1;
        batchTicketsWritten += 1;

        for (const record of recordsForTicket(ticket, importActor, importedAt)) {
          yield* GitDbEvent.append(tx, {
            aggregateId: record.id,
            aggregateType: "record",
            eventId: eventId(options.eventSuffix, "record-add"),
            payload: {
              op: "record.add",
              value: record,
            },
          });
          recordsWritten += 1;
          batchRecordsWritten += 1;
        }
      }

      const appendMs = elapsedMs(batchStartedAt);
      const commitStartedAt = performance.now();
      const snapshot = yield* tx.commit({
        author: importActor,
        committer: importActor,
        message: `Import Jira board tickets ${batchStart + 1}-${batchEnd}`,
      });

      commitsWritten += 1;
      console.log(
        `Committed batch ${commitsWritten}: tickets ${batchStart + 1}-${batchEnd} -> ${snapshot.id.slice(0, 12)} (append ${appendMs}ms, commit ${elapsedMs(commitStartedAt)}ms, total ${elapsedMs(batchStartedAt)}ms, labels ${batchLabelsWritten}, tickets ${batchTicketsWritten}, records ${batchRecordsWritten})`,
      );
    }

    const afterSnapshot = yield* store.currentSnapshotForPointer(options.pointer);
    let projection = undefined;

    if (options.sync) {
      projection = yield* syncProjection(store, options);
    }

    console.log(
      JSON.stringify(
        {
          afterSnapshotId: afterSnapshot?.id ?? null,
          beforeSnapshotId: beforeSnapshot?.id ?? null,
          commitsWritten,
          csv: options.csv,
          database: options.database,
          eventSuffix: options.eventSuffix,
          labelsWritten,
          pointer: options.pointer,
          projection,
          recordsWritten,
          repositoryId: options.repositoryId,
          ticketsWritten,
          writeMs: Number((performance.now() - startedAt).toFixed(2)),
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

function syncProjection(store, options) {
  return Effect.gen(function* () {
    const database = yield* DatabaseService;
    const syncStartedAt = performance.now();
    logMetric("sync.start", {
      repositoryId: options.repositoryId,
    });
    yield* database.openRepository({
      displayName: options.displayName,
      gitDir: options.gitDir,
      pollIntervalMs: false,
      repositoryId: options.repositoryId,
      syncOnOpen: false,
      store,
      worktreePath: options.repoRoot,
    });
    const status = yield* database.syncRepository(options.repositoryId);
    const importedTicketCount = yield* countImportedTickets(database, options.repositoryId);

    yield* database.close();
    logMetric("sync.finish", {
      importedTicketCount,
      ms: elapsedMs(syncStartedAt),
      repositoryId: options.repositoryId,
      status: status.status,
      warningCount: status.warningCount,
    });

    return {
      activeSnapshotId: status.activeSnapshotId,
      importedTicketCount,
      status: status.status,
      syncMs: elapsedMs(syncStartedAt),
      warningCount: status.warningCount,
    };
  });
}

function logMetric(phase, data = {}) {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      phase,
      ...data,
    }),
  );
}

function elapsedMs(startedAt) {
  return Number((performance.now() - startedAt).toFixed(2));
}

function readText(file) {
  return Effect.tryPromise({
    catch: (cause) => cause,
    try: () => readFile(file, "utf8"),
  });
}

function parseJiraCsv(text) {
  const records = parseCsv(text);

  if (records.length === 0) throw new Error("CSV must include a header row.");

  const [headers, ...rows] = records;
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const required = ["issuetype", "issuekey", "summary", "status", "created"];

  for (const header of required) {
    if (!normalizedHeaders.includes(header)) {
      throw new Error(`Jira CSV missing required "${header}" header.`);
    }
  }

  return rows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row, index) => {
      const record = { rowNumber: index + 2 };

      for (let column = 0; column < normalizedHeaders.length; column += 1) {
        record[normalizedHeaders[column]] = row[column] ?? "";
      }

      if (record.issuekey.trim().length === 0) {
        throw new Error(`CSV row ${record.rowNumber} is missing an issue key.`);
      }
      if (record.summary.trim().length === 0) {
        throw new Error(`CSV row ${record.rowNumber} is missing a summary.`);
      }
      if (record.status.trim().length === 0) {
        throw new Error(`CSV row ${record.rowNumber} is missing a status.`);
      }
      if (record.created.trim().length === 0) {
        throw new Error(`CSV row ${record.rowNumber} is missing a created date.`);
      }

      return record;
    });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");

  return rows;
}

function ticketFromJiraRow(row, options) {
  const id = normalizeJiraTicketId(row.issuekey, row.rowNumber);
  const jiraKey = row.issuekey.trim().toUpperCase();
  const createdAt = parseJiraDate(row.created, row.rowNumber);
  const originalType = blankToUndefined(row.issuetype) ?? "Issue";
  const originalStatus = blankToUndefined(row.status) ?? "Backlog";
  const cycleStatus = cycleStatusForJiraStatus(originalStatus);
  const cycleType = cycleTypeForJiraIssueType(originalType);
  const labels = jiraLabels(originalType, originalStatus);
  const creator = blankToUndefined(row.creator) ?? options.importActor.name;
  const creatorActor = {
    name: creator,
    provider: "jira",
    type: "import",
  };
  const input = {
    assignee: blankToUndefined(row.assignee),
    body: bodyForJiraRow(row),
    labels,
    priority: "medium",
    repository: options.repositoryId,
    status: cycleStatus,
    title: row.summary.trim(),
    type: cycleType,
  };
  const frontmatter = {
    ...makeFrontmatter(input, id, creatorActor, createdAt),
    importedAt: options.importedAt,
    importedBy: options.importActor,
    jiraAssignee: blankToUndefined(row.assignee),
    jiraAssigneeId: blankToUndefined(row.assigneeid),
    jiraCreated: row.created.trim(),
    jiraCreator: blankToUndefined(row.creator),
    jiraCreatorId: blankToUndefined(row.creatorid),
    jiraIssueId: blankToUndefined(row.issueid),
    jiraIssueType: originalType,
    jiraKey,
    jiraRowNumber: options.rowNumber,
    jiraStatus: originalStatus,
    source: "jira-board-export",
  };

  return makeTicketDocument(frontmatter, input.body);
}

function bodyForJiraRow(row) {
  const description = row.description.trim();
  const metadata = [
    ["Jira key", row.issuekey],
    ["Jira issue id", row.issueid],
    ["Jira type", row.issuetype],
    ["Jira status", row.status],
    ["Creator", row.creator],
    ["Assignee", row.assignee],
    ["Created", row.created],
  ]
    .filter(([, value]) => value.trim().length > 0)
    .map(([label, value]) => `- ${label}: ${value.trim()}`);

  return [
    description.length > 0 ? description : "_No Jira description was provided._",
    "",
    "## Jira metadata",
    "",
    ...metadata,
  ].join("\n");
}

function recordsForTicket(ticket, actor, importedAt) {
  const base = safeSegment(ticket.id);

  return [
    makeRecord({
      actor,
      createdAt: ticket.frontmatter.createdAt,
      id: `${base}_provenance_jira_import`,
      issueId: ticket.id,
      payload: {
        importedAt,
        jiraIssueId: ticket.frontmatter.jiraIssueId,
        jiraKey: ticket.frontmatter.jiraKey,
        source: "jira-board-export",
      },
      recordType: "provenance",
    }),
    makeRecord({
      actor,
      createdAt: ticket.frontmatter.createdAt,
      id: `${base}_status_change_jira_import`,
      issueId: ticket.id,
      payload: {
        from: null,
        jiraStatus: ticket.frontmatter.jiraStatus,
        to: ticket.status,
      },
      recordType: "status-change",
    }),
  ];
}

function makeRecord({ actor, createdAt, id, issueId, payload, recordType }) {
  return {
    createdAt,
    createdBy: actor,
    createdDate: createdAt.slice(0, 10),
    id,
    issueId,
    payload,
    recordType: normalizeKey(recordType),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

function labelDefinitionsForTickets(tickets, actor, now) {
  const labels = new Map();

  const add = (id, name, description) => {
    labels.set(id, {
      color: colorForLabel(id),
      createdAt: now,
      createdBy: actor,
      description,
      id,
      name,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: now,
    });
  };

  add("jira", "Jira", "Imported from Jira board export.");

  for (const ticket of tickets) {
    add(
      `jira-type-${normalizeKey(ticket.frontmatter.jiraIssueType)}`,
      `Jira Type: ${ticket.frontmatter.jiraIssueType}`,
      "Original Jira issue type.",
    );
    add(
      `jira-status-${normalizeKey(ticket.frontmatter.jiraStatus)}`,
      `Jira Status: ${ticket.frontmatter.jiraStatus}`,
      "Original Jira workflow status.",
    );
  }

  return [...labels.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function jiraLabels(issueType, status) {
  return ["jira", `jira-type-${normalizeKey(issueType)}`, `jira-status-${normalizeKey(status)}`];
}

function colorForLabel(id) {
  if (id === "jira") return "purple";
  if (id.includes("bug") || id.includes("defect")) return "red";
  if (id.includes("done") || id.includes("production") || id.includes("completed")) return "green";
  if (id.includes("progress") || id.includes("testing") || id.includes("review")) return "blue";
  if (id.includes("blocked") || id.includes("hold")) return "amber";
  if (id.includes("not-doing") || id.includes("deferred")) return "neutral";
  if (id.includes("feature") || id.includes("story") || id.includes("epic")) return "purple";

  return "neutral";
}

function cycleStatusForJiraStatus(value) {
  const normalized = normalizeKey(value);

  if (
    [
      "done",
      "feature-in-production",
      "ready-for-live-sanity",
      "ready-for-release",
      "testing-completed",
    ].includes(normalized)
  ) {
    return "done";
  }
  if (["deferred", "not-doing"].includes(normalized)) return "canceled";
  if (
    [
      "blocked",
      "in-progress",
      "in-testing",
      "on-hold",
      "peer-review",
      "peer-review-done",
      "ready-for-testing",
      "uat",
    ].includes(normalized)
  ) {
    return "in-progress";
  }
  if (["reopen", "to-do"].includes(normalized)) return "todo";

  return "backlog";
}

function cycleTypeForJiraIssueType(value) {
  return normalizeKey(value) === "epic" ? "epic" : "issue";
}

function parseJiraDate(value, rowNumber) {
  const match = value
    .trim()
    .match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)$/iu);

  if (match === null) {
    throw new Error(`CSV row ${rowNumber} has unsupported Jira created date: ${value}`);
  }

  const [, dayText, monthText, yearText, hourText, minuteText, meridiem] = match;
  const month = monthIndex(monthText);
  const day = Number.parseInt(dayText, 10);
  const yearNumber = Number.parseInt(yearText, 10);
  const year = yearText.length === 2 ? 2000 + yearNumber : yearNumber;
  let hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);

  if (meridiem.toUpperCase() === "AM" && hour === 12) hour = 0;
  if (meridiem.toUpperCase() === "PM" && hour !== 12) hour += 12;

  const date = new Date(Date.UTC(year, month, day, hour, minute, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    throw new Error(`CSV row ${rowNumber} has invalid Jira created date: ${value}`);
  }

  return date.toISOString();
}

function monthIndex(value) {
  const months = {
    apr: 3,
    aug: 7,
    dec: 11,
    feb: 1,
    jan: 0,
    jul: 6,
    jun: 5,
    mar: 2,
    may: 4,
    nov: 10,
    oct: 9,
    sep: 8,
  };
  const month = months[value.toLowerCase()];

  if (month === undefined) throw new Error(`Unsupported Jira month: ${value}`);

  return month;
}

function countImportedTickets(database, repositoryId) {
  return Effect.gen(function* () {
    let cursor = undefined;
    let count = 0;

    do {
      const page = yield* database.listTickets({
        cursor,
        label: "jira",
        limit: 500,
        repositoryIds: [repositoryId],
      });

      count += page.entries.length;
      cursor = page.nextCursor;
    } while (cursor !== undefined);

    return count;
  });
}

function normalizeJiraTicketId(value, rowNumber) {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(jiraKeyPattern);

  if (match === null) {
    throw new Error(
      `CSV row ${rowNumber} has unsupported issue key "${value}". Expected PREFIX-KEY format.`,
    );
  }

  const [, prefix, key] = match;

  return `${prefix}-${key.padStart(5, "0")}`;
}

function eventId(...parts) {
  return safeSegment(["evt", ...parts].join("_"));
}

function safeSegment(value) {
  return normalizeKey(value, "x").replaceAll("-", "_");
}

function duplicateIds(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates].sort();
}

function countBy(values, select) {
  const counts = {};

  for (const value of values) {
    const key = String(select(value) ?? "none");
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function blankToUndefined(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeHeader(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}

function parseArgs(args) {
  const parsed = {
    actorEmail: process.env.CYCLE_JIRA_ACTOR_EMAIL ?? "jira-import@example.invalid",
    actorName: process.env.CYCLE_JIRA_ACTOR_NAME ?? "Jira Board Importer",
    batchSize: readPositiveIntEnv("CYCLE_JIRA_BATCH_SIZE", 500),
    csv: process.env.CYCLE_JIRA_CSV ?? defaultCsv,
    database: process.env.CYCLE_JIRA_DATABASE ?? "cycle",
    displayName: process.env.CYCLE_JIRA_DISPLAY_NAME ?? "Cycle local repository",
    dryRun: false,
    eventSuffix: process.env.CYCLE_JIRA_EVENT_SUFFIX ?? "jira-board-export",
    gitDir: process.env.CYCLE_JIRA_GIT_DIR ?? ".git",
    help: false,
    limit: readOptionalPositiveIntEnv("CYCLE_JIRA_LIMIT"),
    offset: readOptionalNonNegativeIntEnv("CYCLE_JIRA_OFFSET") ?? 0,
    pointer: process.env.CYCLE_JIRA_POINTER ?? "main",
    projectionPath: process.env.CYCLE_JIRA_PROJECTION_PATH,
    repoRoot: process.env.CYCLE_JIRA_REPO_ROOT ?? defaultRepoRoot,
    repositoryId: process.env.CYCLE_JIRA_REPOSITORY_ID ?? "cycle-local",
    sync: process.env.CYCLE_JIRA_SYNC !== "false",
    syncOnly: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;

    const [name, inlineValue] = arg.split("=", 2);
    const value = () => inlineValue ?? args[++index];

    switch (name) {
      case "--actor-email":
        parsed.actorEmail = readArg("--actor-email", value());
        break;
      case "--actor-name":
        parsed.actorName = readArg("--actor-name", value());
        break;
      case "--batch-size":
        parsed.batchSize = readPositiveInt("--batch-size", value());
        break;
      case "--csv":
        parsed.csv = readArg("--csv", value());
        break;
      case "--database":
        parsed.database = readArg("--database", value());
        break;
      case "--display-name":
        parsed.displayName = readArg("--display-name", value());
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--event-suffix":
        parsed.eventSuffix = readArg("--event-suffix", value());
        break;
      case "--git-dir":
        parsed.gitDir = readArg("--git-dir", value());
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--limit":
        parsed.limit = readPositiveInt("--limit", value());
        break;
      case "--no-sync":
        parsed.sync = false;
        break;
      case "--offset":
        parsed.offset = readNonNegativeInt("--offset", value());
        break;
      case "--pointer":
        parsed.pointer = readArg("--pointer", value());
        break;
      case "--projection-path":
        parsed.projectionPath = readArg("--projection-path", value());
        break;
      case "--repo-root":
        parsed.repoRoot = readArg("--repo-root", value());
        break;
      case "--repository-id":
        parsed.repositoryId = readArg("--repository-id", value());
        break;
      case "--sync-only":
        parsed.syncOnly = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  parsed.repoRoot = path.resolve(parsed.repoRoot);
  parsed.csv = resolvePath(parsed.csv, parsed.repoRoot);
  parsed.eventSuffix = safeSegment(parsed.eventSuffix);
  if (parsed.projectionPath !== undefined) {
    parsed.projectionPath = path.resolve(parsed.projectionPath);
  }

  return parsed;
}

function resolvePath(value, fallbackRoot) {
  if (path.isAbsolute(value)) return value;

  const cwdPath = path.resolve(value);
  if (existsSync(cwdPath)) return cwdPath;

  return path.resolve(fallbackRoot, value);
}

function readPositiveIntEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined ? fallback : readPositiveInt(name, value);
}

function readOptionalPositiveIntEnv(name) {
  const value = process.env[name];
  return value === undefined ? undefined : readPositiveInt(name, value);
}

function readOptionalNonNegativeIntEnv(name) {
  const value = process.env[name];
  return value === undefined ? undefined : readNonNegativeInt(name, value);
}

function readPositiveInt(name, value) {
  const parsed = Number.parseInt(readArg(name, value), 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readNonNegativeInt(name, value) {
  const parsed = Number.parseInt(readArg(name, value), 10);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

function readArg(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function printHelp() {
  console.log(`Import Jira board issues into the local Cycle GitDB and SQLite projection.

Usage:
  pnpm --filter @cycle/database import:jira-board -- --csv jira-board-export.csv
  node packages/database/scripts/import-jira-board-export.mjs --csv jira-board-export.csv

Expected Jira CSV headers:
  Issue Type,Issue key,Issue id,Summary,Status,Creator,Creator Id,Assignee,Assignee Id,Created,Description

Defaults:
  - Converts Jira issue keys to Cycle ticket ids, for example PA-7208 becomes PA-07208.
  - Stores the original Jira issue key in ticket frontmatter and body metadata.
  - Maps Jira workflow statuses into Cycle board statuses.
  - Stores original Jira status/type/id/people fields in ticket frontmatter.
  - Adds Jira labels before tickets are imported.
  - Batches GitDB commits and syncs the local SQLite projection.

Options:
  --csv <path>              Jira CSV path. Defaults to ./jira-board-export.csv.
  --batch-size <number>     Tickets per GitDB commit. Default: 500.
  --limit <number>          Import only this many rows after offset.
  --offset <number>         Skip this many source rows before importing. Default: 0.
  --repo-root <path>        Git repository root. Defaults to the workspace root.
  --git-dir <path>          Git directory. Defaults to .git.
  --database <name>         GitDB database namespace. Default: cycle.
  --pointer <name>          GitDB pointer. Default: main.
  --projection-path <path>  SQLite projection path. Defaults to the current Cycle database.
  --repository-id <id>      Projection repository id. Default: cycle-local.
  --display-name <name>     Repository display name used during sync.
  --actor-name <name>       Import commit author name.
  --actor-email <email>     Import commit author email.
  --event-suffix <value>    Event id suffix. Change this if deliberately re-importing.
  --no-sync                 Write GitDB events without hydrating the SQLite projection.
  --sync-only               Hydrate SQLite from the current GitDB ref without importing CSV rows.
  --dry-run                 Parse and summarize CSV without writing.
  --help                    Show this help.
`);
}
