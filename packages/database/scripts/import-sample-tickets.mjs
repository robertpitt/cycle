#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GitDbFilesystem, Store as GitDbStore } from "@cycle/git-db";
import { Effect, Layer } from "effect";
import {
  DatabaseIdGenerator,
  DatabaseIdentityTest,
  DatabaseLive,
  DatabaseService,
  normalizeKey,
} from "../src/index.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "../../..");
const defaultCsv = path.join(scriptDir, "sample-tickets.csv");

const config = parseArgs(process.argv.slice(2));

if (config.help) {
  printHelp();
  process.exit(0);
}

await Effect.runPromise(importTickets(config)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function importTickets(options) {
  const actor = {
    email: options.actorEmail,
    name: options.actorName,
    type: "human",
  };
  const databaseLayer = DatabaseLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        DatabaseIdentityTest(actor),
        Layer.succeed(DatabaseIdGenerator, DatabaseIdGenerator.of(randomIdGenerator())),
      ),
    ),
  );

  return Effect.gen(function* () {
    const rows = parseTicketCsv(yield* readText(options.csv));
    const tickets = rows.map(ticketInputFromRow);

    if (options.dryRun) {
      console.log(
        JSON.stringify(
          {
            csv: options.csv,
            dryRun: true,
            labels: [...collectLabels(tickets)].sort(),
            tickets: tickets.length,
          },
          null,
          2,
        ),
      );
      return;
    }

    const store = yield* GitDbStore.StoreService;
    const database = yield* DatabaseService;
    const status = yield* database.openRepository({
      displayName: options.displayName,
      gitDir: options.gitDir,
      repositoryId: options.repositoryId,
      store,
      worktreePath: options.repoRoot,
    });
    const labels = [...collectLabels(tickets)].sort();
    const labelResults = [];
    const ticketResults = [];

    for (const label of labels) {
      const definition = yield* database.upsertLabel(options.repositoryId, {
        color: colorForLabel(label),
        description: `Imported sample label for ${titleForKey(label)} work.`,
        id: label,
        name: titleForKey(label),
      });

      labelResults.push(definition.id);
    }

    for (const ticket of tickets) {
      const created = yield* database.createTicket(options.repositoryId, {
        ...ticket,
        repository: options.repositoryId,
      });

      ticketResults.push(created.id);
      console.log(`Created ${created.id}: ${created.title}`);
    }

    const finalStatus = yield* database.repositoryStatus(options.repositoryId);

    yield* database.close();

    console.log(
      JSON.stringify(
        {
          activeSnapshotId: finalStatus.activeSnapshotId,
          csv: options.csv,
          importedLabels: labelResults.length,
          importedTickets: ticketResults.length,
          initialStatus: status.status,
          repositoryId: options.repositoryId,
          status: finalStatus.status,
          ticketIds: ticketResults,
          warningCount: finalStatus.warningCount,
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

function randomIdGenerator() {
  const makeId = (prefix) => Effect.sync(() => `${prefix}_${randomUUID().replaceAll("-", "")}`);

  return {
    draftId: makeId("drf"),
    labelId: makeId("lbl"),
    recordId: makeId("rec"),
    templateId: makeId("tpl"),
    ticketId: makeId("iss"),
    viewId: makeId("view"),
  };
}

function readText(file) {
  return Effect.tryPromise({
    catch: (cause) => cause,
    try: () => readFile(file, "utf8"),
  });
}

function parseTicketCsv(text) {
  const records = parseCsv(text);

  if (records.length === 0) throw new Error("CSV must include a header row.");

  const [headers, ...rows] = records;
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const required = ["title", "body"];

  for (const header of required) {
    if (!normalizedHeaders.includes(header))
      throw new Error(`CSV missing required "${header}" header.`);
  }

  return rows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row, index) => {
      const record = {};

      for (let column = 0; column < normalizedHeaders.length; column += 1) {
        record[normalizedHeaders[column]] = row[column] ?? "";
      }

      if (record.title.trim().length === 0) {
        throw new Error(`CSV row ${index + 2} is missing a title.`);
      }
      if (record.body.trim().length === 0) {
        throw new Error(`CSV row ${index + 2} is missing a body.`);
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

function ticketInputFromRow(row) {
  return {
    assignee: blankToUndefined(row.assignee),
    body: decodeText(row.body),
    dueDate: blankToUndefined(row.duedate),
    estimate: blankToUndefined(row.estimate),
    labels: parseList(row.labels).map((label) => normalizeKey(label)),
    priority: blankToUndefined(row.priority) ?? "medium",
    status: blankToUndefined(row.status) ?? "backlog",
    title: decodeText(row.title),
    type: blankToUndefined(row.type) ?? "issue",
  };
}

function parseList(value) {
  return value
    .split(/[;|]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function collectLabels(tickets) {
  const labels = new Set();

  for (const ticket of tickets) {
    for (const label of ticket.labels ?? []) labels.add(label);
  }

  return labels;
}

function decodeText(value) {
  return value.replaceAll("\\n", "\n").trim();
}

function blankToUndefined(value) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeHeader(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}

function titleForKey(value) {
  return value
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function colorForLabel(label) {
  switch (label) {
    case "bug":
    case "regression":
      return "red";
    case "database":
    case "gitdb":
    case "sync":
      return "blue";
    case "frontend":
    case "views":
    case "templates":
      return "green";
    case "qa":
    case "test":
      return "amber";
    default:
      return "neutral";
  }
}

function parseArgs(args) {
  const parsed = {
    actorEmail: process.env.CYCLE_SAMPLE_ACTOR_EMAIL ?? "sample-seeder@example.invalid",
    actorName: process.env.CYCLE_SAMPLE_ACTOR_NAME ?? "Cycle Sample Seeder",
    csv: process.env.CYCLE_SAMPLE_CSV ?? defaultCsv,
    database: process.env.CYCLE_SAMPLE_DATABASE ?? "cycle",
    displayName: process.env.CYCLE_SAMPLE_DISPLAY_NAME ?? "Cycle local repository",
    dryRun: false,
    gitDir: process.env.CYCLE_SAMPLE_GIT_DIR ?? ".git",
    help: false,
    pointer: process.env.CYCLE_SAMPLE_POINTER ?? "main",
    repoRoot: process.env.CYCLE_SAMPLE_REPO_ROOT ?? defaultRepoRoot,
    repositoryId: process.env.CYCLE_SAMPLE_REPOSITORY_ID ?? "cycle-local",
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
      case "--csv":
        parsed.csv = path.resolve(readArg("--csv", value()));
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
      case "--git-dir":
        parsed.gitDir = readArg("--git-dir", value());
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--pointer":
        parsed.pointer = readArg("--pointer", value());
        break;
      case "--repo-root":
        parsed.repoRoot = path.resolve(readArg("--repo-root", value()));
        break;
      case "--repository-id":
        parsed.repositoryId = readArg("--repository-id", value());
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  parsed.csv = path.resolve(parsed.csv);
  parsed.repoRoot = path.resolve(parsed.repoRoot);

  return parsed;
}

function readArg(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function printHelp() {
  console.log(`Import sample Cycle tickets from CSV.

Usage:
  pnpm --filter @cycle/database seed:sample-tickets -- --csv packages/database/scripts/sample-tickets.csv

CSV headers:
  title,body,status,priority,assignee,labels,type,dueDate,estimate

Notes:
  - labels are separated with semicolon or pipe.
  - body and title support \\n escape sequences.
  - referenced labels are upserted before tickets are created.

Options:
  --csv <path>              CSV payload path. Defaults to scripts/sample-tickets.csv.
  --repo-root <path>        Git repository root. Defaults to the workspace root.
  --git-dir <path>          Git directory. Defaults to .git.
  --database <name>         GitDB database namespace. Defaults to cycle.
  --pointer <name>          GitDB pointer. Defaults to main.
  --repository-id <id>      Projection repository id. Defaults to cycle-local.
  --display-name <name>     Repository display name.
  --actor-name <name>       Import actor name.
  --actor-email <email>     Import actor email.
  --dry-run                 Parse and summarize CSV without writing.
`);
}
