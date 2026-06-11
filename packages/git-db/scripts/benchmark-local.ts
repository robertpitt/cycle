import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Effect } from "effect";
import { GitDbFilesystem, GitDbLive, Store } from "../src/index.ts";
import type { StoreCollection, StoreServiceShape } from "../src/store/Store.ts";

type Backend = "cli" | "filesystem";

type Options = {
  readonly append: boolean;
  readonly backend: Backend;
  readonly count: number;
  readonly database: string;
  readonly pageSize: number;
};

type Issue = {
  readonly assignee: string;
  readonly project: string;
  readonly priority: number;
  readonly status: string;
  readonly tags: ReadonlyArray<string>;
  readonly title: string;
  readonly updatedAt: string;
};

type SampleRead = {
  readonly id: string;
  readonly value: Issue | null;
};

type Timed<A> = {
  readonly durationMs: number;
  readonly result: A;
};

const statuses = ["backlog", "open", "in-progress", "review", "closed"];
const projects = ["desktop", "sync", "ui", "agent", "infra"];
const assignees = ["alex", "bea", "chen", "devon", "eli", "fatima", "grace", "hugo"];
const priorities = [1, 2, 3, 4];
const tags = ["customer", "bug", "feature", "internal", "performance", "security"];

const parseOptions = (argv: ReadonlyArray<string>): Options => {
  const read = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));

    if (inline !== undefined) return inline.slice(prefix.length);

    const index = argv.indexOf(`--${name}`);

    return index >= 0 ? argv[index + 1] : undefined;
  };
  const count = Number.parseInt(read("count") ?? "5000", 10);
  const pageSize = Number.parseInt(read("page-size") ?? "100", 10);
  const backend = read("backend") ?? "filesystem";
  const database = read("database") ?? "benchmark";

  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error(`Invalid --count: ${String(read("count"))}`);
  }

  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error(`Invalid --page-size: ${String(read("page-size"))}`);
  }

  if (backend !== "cli" && backend !== "filesystem") {
    throw new Error(`Invalid --backend: ${backend}`);
  }

  return {
    append: argv.includes("--append"),
    backend,
    count,
    database,
    pageSize,
  };
};

const gitString = (args: ReadonlyArray<string>): string =>
  execFileSync("git", [...args], {
    encoding: "utf8",
  }).trim();

const documentPath = (collection: string, id: string): string =>
  `collections/${collection}/${createHash("sha1").update(id).digest("hex").slice(0, 2)}/${id}.json`;

const issueId = (index: number): string => `issue-${String(index).padStart(6, "0")}`;

const issueAt = (index: number): Issue => ({
  assignee: assignees[index % assignees.length] ?? "alex",
  priority: priorities[index % priorities.length] ?? 1,
  project: projects[index % projects.length] ?? "desktop",
  status: statuses[index % statuses.length] ?? "open",
  tags: [tags[index % tags.length] ?? "customer", tags[(index + 2) % tags.length] ?? "feature"],
  title: `Investigate workspace sync case ${String(index).padStart(6, "0")}`,
  updatedAt: new Date(Date.UTC(2026, 0, 1, 12, 0, index % 60)).toISOString(),
});

const timeEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<Timed<A>, E, R> =>
  Effect.gen(function* () {
    const started = performance.now();
    const result = yield* effect;

    return {
      durationMs: performance.now() - started,
      result,
    };
  });

const logPhase = (message: string): void => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const collectPages = <T, E, R>(
  page: (cursor: string | undefined) => Effect.Effect<
    {
      readonly entries: ReadonlyArray<T>;
      readonly nextCursor?: string;
    },
    E,
    R
  >,
): Effect.Effect<
  {
    readonly pages: number;
    readonly rows: number;
  },
  E,
  R
> =>
  Effect.gen(function* () {
    let cursor: string | undefined;
    let pages = 0;
    let rows = 0;

    do {
      const next = yield* page(cursor);

      pages += 1;
      rows += next.entries.length;
      cursor = next.nextCursor;
    } while (cursor !== undefined);

    return { pages, rows };
  });

const seed = (store: StoreServiceShape, options: Options) =>
  Effect.gen(function* () {
    if (!options.append) {
      logPhase("resetting benchmark pointer");
      const pointer = yield* store.pointer("main");

      yield* pointer.delete().pipe(Effect.catch(() => Effect.void));
    }

    const tx = yield* store.begin();
    let writes = 0;
    const reportEvery = Math.max(1000, Math.floor(options.count / 10));

    logPhase(`staging ${options.count} issues`);

    for (let index = 0; index < options.count; index += 1) {
      const id = issueId(index);
      const value = issueAt(index);
      const path = documentPath("issues", id);

      yield* tx.put(path, value);
      writes += 1;

      if ((index + 1) % reportEvery === 0 || index + 1 === options.count) {
        logPhase(`staged ${index + 1}/${options.count} issues`);
      }
    }

    logPhase("writing GitDB snapshot");

    const snapshot = yield* tx.commit({
      message: `Seed ${options.count} benchmark issues`,
    });

    return {
      snapshotId: snapshot.id,
      writes,
    };
  });

const benchmark = (store: StoreServiceShape, options: Options) =>
  Effect.gen(function* () {
    const issues = yield* store.collection<Issue>("issues");

    logPhase("benchmarking cold first collection page");

    const coldFirstPage: Timed<ReadonlyArray<string>> = yield* timeEffect(
      issues
        .page({ limit: options.pageSize })
        .pipe(Effect.map((page) => page.entries.map((entry) => entry.id))),
    );

    logPhase("benchmarking warm first collection page");

    const warmFirstPage: Timed<ReadonlyArray<string>> = yield* timeEffect(
      issues
        .page({ limit: options.pageSize })
        .pipe(Effect.map((page) => page.entries.map((entry) => entry.id))),
    );

    logPhase("benchmarking cached collection page navigation");

    const pageNavigation: Timed<{ readonly pages: number; readonly rows: number }> =
      yield* timeEffect(collectPages((cursor) => issues.page({ cursor, limit: options.pageSize })));

    logPhase("benchmarking sample point reads");

    const randomReads: Timed<ReadonlyArray<SampleRead>> = yield* timeEffect(
      readSamples(issues, options.count),
    );

    logPhase("benchmarking full collection list with cached structure");

    const fullCollectionList: Timed<number> = yield* timeEffect(
      issues.list().pipe(Effect.map((entries) => entries.length)),
    );

    return {
      coldFirstPage,
      fullCollectionList,
      pageNavigation,
      randomReads,
      warmFirstPage,
    };
  });

const readSamples = (collection: StoreCollection<Issue>, count: number) =>
  Effect.gen(function* () {
    const positions = [
      0,
      Math.floor(count * 0.25),
      Math.floor(count * 0.5),
      Math.floor(count * 0.75),
      count - 1,
    ];
    const output: Array<SampleRead> = [];

    for (const position of positions) {
      const id = issueId(Math.max(0, Math.min(count - 1, position)));

      output.push({
        id,
        value: yield* collection.get(id),
      });
    }

    return output;
  });

const formatMs = (value: number): string => `${value.toFixed(2)}ms`;

const printTimed = <A>(label: string, timed: Timed<A>, result: string): void => {
  console.log(`${label.padEnd(28)} ${formatMs(timed.durationMs).padStart(12)}  ${result}`);
};

const printMemory = (): void => {
  const memory = process.memoryUsage();
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

  console.log(`memory`.padEnd(28), `${mb(memory.rss)} rss, ${mb(memory.heapUsed)} heap used`);
};

const options = parseOptions(process.argv.slice(2));
const cwd = gitString(["rev-parse", "--show-toplevel"]);
const gitDir = gitString(["rev-parse", "--absolute-git-dir"]);
const makeLayer = () =>
  options.backend === "filesystem"
    ? GitDbFilesystem({ cwd, database: options.database, gitDir })
    : GitDbLive({ cwd, database: options.database, gitDir });

const program = Effect.gen(function* () {
  const store = yield* Store.StoreService;

  console.log("@cycle/git-db local benchmark");
  console.log(`repo`.padEnd(28), cwd);
  console.log(`gitDir`.padEnd(28), gitDir);
  console.log(`backend`.padEnd(28), options.backend);
  console.log(`database`.padEnd(28), options.database);
  console.log(`count`.padEnd(28), String(options.count));
  console.log(`pageSize`.padEnd(28), String(options.pageSize));
  console.log(`mode`.padEnd(28), options.append ? "append" : "reset pointer before seed");
  console.log("");

  if (options.backend === "cli" && options.count >= 1000) {
    console.log(
      "note".padEnd(28),
      "CLI backend shells out heavily; use --backend filesystem for local performance runs.",
    );
    console.log("");
  }

  const seeded = yield* timeEffect(seed(store, options));
  const results = yield* benchmark(store, options);

  printTimed(
    "seed transaction",
    seeded,
    `${seeded.result.writes} documents, snapshot ${seeded.result.snapshotId}`,
  );
  printTimed(
    "cold collection page",
    results.coldFirstPage,
    `${results.coldFirstPage.result.length} ids: ${results.coldFirstPage.result.slice(0, 5).join(", ")}`,
  );
  printTimed(
    "warm collection page",
    results.warmFirstPage,
    `${results.warmFirstPage.result.length} ids: ${results.warmFirstPage.result.slice(0, 5).join(", ")}`,
  );
  printTimed(
    "cached collection pages",
    results.pageNavigation,
    `${results.pageNavigation.result.rows} rows over ${results.pageNavigation.result.pages} pages`,
  );
  printTimed(
    "sample point reads",
    results.randomReads,
    results.randomReads.result
      .map((sample) => `${sample.id}:${sample.value?.status ?? "missing"}`)
      .join(", "),
  );
  printTimed(
    "full collection list",
    results.fullCollectionList,
    `${results.fullCollectionList.result} rows`,
  );
  printMemory();
});

Effect.runPromise(program.pipe(Effect.provide(makeLayer()))).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
