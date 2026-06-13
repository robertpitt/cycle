import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strict as assert } from "node:assert";
import { RemotePushError } from "@cycle/git/errors";
import { Effect } from "effect";
import {
  Event as GitDbEvent,
  GitDbLive,
  Store,
  SyncConflictError,
  type PointerSyncResult,
  type SyncResult,
} from "../src/index.ts";
import type { StoreServiceShape } from "../src/store/Store.ts";

type Actor = "A" | "B";

type Options = {
  readonly database: string;
  readonly keep: boolean;
  readonly scenario: string;
};

type ScenarioContext = {
  readonly database: string;
  readonly remote: string;
  readonly root: string;
  readonly userA: string;
  readonly userB: string;
};

type TicketEventWrite = {
  readonly actor: Actor;
  readonly eventId: string;
  readonly message?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly seconds: number;
  readonly ticketId: string;
};

type TicketEventWriteResult = {
  readonly path: string;
  readonly snapshotId: string;
};

type ListedEvent = {
  readonly eventId: string;
  readonly path: string;
  readonly payload: unknown;
  readonly ticketId: string;
};

type ScenarioResult = {
  readonly details: ReadonlyArray<string>;
};

type Scenario = {
  readonly expected: string;
  readonly name: string;
  readonly run: (context: ScenarioContext) => Promise<ScenarioResult>;
};

type Captured<A> =
  | {
      readonly ok: true;
      readonly value: A;
    }
  | {
      readonly error: unknown;
      readonly ok: false;
    };

const ticketId = "TCK-100";

const parseOptions = (argv: ReadonlyArray<string>): Options => {
  const read = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));

    if (inline !== undefined) return inline.slice(prefix.length);

    const index = argv.indexOf(`--${name}`);

    return index >= 0 ? argv[index + 1] : undefined;
  };

  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  return {
    database: read("database") ?? "merge_scenarios",
    keep: argv.includes("--keep"),
    scenario: read("scenario") ?? "all",
  };
};

const printUsage = (): void => {
  console.log(`@cycle/git-db merge scenario runner

Usage:
  pnpm --filter @cycle/git-db test:merge-scenarios
  pnpm --filter @cycle/git-db test:merge-scenarios -- --scenario same-ticket-different-events-merge
  pnpm --filter @cycle/git-db test:merge-scenarios -- --keep

Options:
  --database <name>   GitDB database/ref namespace segment. Default: merge_scenarios
  --keep              Keep temporary bare remote and user clone directories.
  --scenario <name>   Run one scenario by exact name. Default: all
`);
};

const git = (cwd: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const createWorkspace = (name: string, database: string): ScenarioContext => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `git-db-${sanitizeName(name)}-`));
  const remote = path.join(root, "remote.git");
  const userA = path.join(root, "user-a");
  const userB = path.join(root, "user-b");

  git(root, ["init", "--bare", remote]);
  git(root, ["clone", remote, userA]);
  git(root, ["clone", remote, userB]);

  return {
    database,
    remote,
    root,
    userA,
    userB,
  };
};

const sanitizeName = (name: string): string => name.replace(/[^A-Za-z0-9._-]+/gu, "-");

const identity = (actor: Actor, seconds: number) => ({
  date: new Date(Date.UTC(2026, 0, 1, 12, 0, seconds)).toISOString(),
  email: `user-${actor.toLowerCase()}@example.invalid`,
  name: `User ${actor}`,
});

const runInStore = <A>(
  cwd: string,
  database: string,
  program: (store: StoreServiceShape) => Effect.Effect<A, unknown, never>,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* Store.StoreService;

      return yield* program(store);
    }).pipe(Effect.provide(GitDbLive({ cwd, database }))),
  );

const writeTicketEvent = (
  store: StoreServiceShape,
  input: TicketEventWrite,
): Effect.Effect<TicketEventWriteResult, unknown, never> =>
  Effect.gen(function* () {
    const tx = yield* store.begin();
    const eventPath = yield* GitDbEvent.append(tx, {
      aggregateId: input.ticketId,
      aggregateType: "ticket",
      eventId: input.eventId,
      payload: input.payload,
    });
    const snapshot = yield* tx.commit({
      author: identity(input.actor, input.seconds),
      committer: identity(input.actor, input.seconds),
      message: input.message ?? `User ${input.actor} appends ${input.ticketId}/${input.eventId}`,
    });

    return {
      path: eventPath,
      snapshotId: snapshot.id,
    };
  });

const writeInClone = (
  context: ScenarioContext,
  cwd: string,
  input: TicketEventWrite,
): Promise<TicketEventWriteResult> =>
  runInStore(cwd, context.database, (store) => writeTicketEvent(store, input));

const syncMain = (
  context: ScenarioContext,
  cwd: string,
  options: Parameters<StoreServiceShape["sync"]>[0] = {},
): Promise<SyncResult> =>
  runInStore(cwd, context.database, (store) =>
    store.sync({
      pointers: ["main"],
      remote: "origin",
      ...options,
    }),
  );

const listTicketEvents = (
  context: ScenarioContext,
  cwd: string,
): Promise<ReadonlyArray<ListedEvent>> =>
  runInStore(cwd, context.database, (store) =>
    GitDbEvent.list(store).pipe(
      Effect.map((events) =>
        events
          .filter((event) => event.aggregateType === "ticket" && event.aggregateId === ticketId)
          .map((event) => ({
            eventId: event.eventId,
            path: event.path,
            payload: event.payload,
            ticketId: event.aggregateId,
          })),
      ),
    ),
  );

const seedScenario = async (context: ScenarioContext): Promise<ReadonlyArray<string>> => {
  const seed = await writeInClone(context, context.userA, {
    actor: "A",
    eventId: "evt_0001",
    message: "Seed ticket",
    payload: {
      op: "ticket.create",
      status: "open",
      title: "Reproduce GitDB merge edge cases",
    },
    seconds: 1,
    ticketId,
  });
  const push = await syncMain(context, context.userA, { mode: "full" });
  const pull = await syncMain(context, context.userB, { mode: "full" });

  assertPointerStatus(push, "pushed");
  assertPointerStatus(pull, "fast-forwarded");

  return [
    `seed ${short(seed.snapshotId)} pushed from user A`,
    `user B pulled seed: ${formatSync(pull)}`,
  ];
};

const capture = async <A>(promise: Promise<A>): Promise<Captured<A>> => {
  try {
    return {
      ok: true,
      value: await promise,
    };
  } catch (error) {
    return {
      error,
      ok: false,
    };
  }
};

const assertPointerStatus = (
  result: SyncResult,
  status: PointerSyncResult["status"],
): PointerSyncResult => {
  const pointer = result.pointers.find((entry) => entry.pointer === "main");

  assert.ok(pointer, `sync result did not include main pointer: ${formatSync(result)}`);
  assert.strictEqual(
    pointer.status,
    status,
    `expected main to be ${status}: ${formatSync(result)}`,
  );

  return pointer;
};

const assertEventIds = (
  events: ReadonlyArray<ListedEvent>,
  expected: ReadonlyArray<string>,
): void => {
  assert.deepStrictEqual(
    events.map((event) => event.eventId),
    expected,
  );
};

const expectSyncConflict = (captured: Captured<unknown>): SyncConflictError => {
  assert.strictEqual(captured.ok, false, "expected SyncConflictError, but the operation succeeded");
  assert.ok(
    captured.error instanceof SyncConflictError,
    `expected SyncConflictError, received ${formatError(captured.error)}`,
  );

  return captured.error;
};

const expectRemotePushError = (captured: Captured<unknown>): RemotePushError => {
  assert.strictEqual(captured.ok, false, "expected RemotePushError, but the operation succeeded");
  assert.ok(
    captured.error instanceof RemotePushError,
    `expected RemotePushError, received ${formatError(captured.error)}`,
  );

  return captured.error;
};

const short = (id: string | undefined): string => (id === undefined ? "<none>" : id.slice(0, 12));

const formatPointer = (pointer: PointerSyncResult): string =>
  `${pointer.pointer}:${pointer.status} local ${short(pointer.localBefore)} -> ${short(
    pointer.localAfter,
  )}, remote ${short(pointer.remoteBefore)} -> ${short(pointer.remoteAfter)}`;

const formatSync = (result: SyncResult): string => result.pointers.map(formatPointer).join("; ");

const errorTag = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return undefined;

  const tag = (error as { readonly _tag?: unknown })._tag;

  return typeof tag === "string" ? tag : undefined;
};

const formatError = (error: unknown): string => {
  const prefix = errorTag(error);
  const message = error instanceof Error ? error.message : String(error);

  return prefix === undefined ? message : `${prefix}: ${message}`;
};

const firstUsefulStderrLine = (stderr: string | undefined): string => {
  if (stderr === undefined || stderr.trim().length === 0) return "<no stderr>";

  const rejected = /\[rejected\][^(]+\(fetch first\)/u.exec(stderr);

  if (rejected !== null) return rejected[0].replace(/\s+/gu, " ").trim();

  return (
    stderr
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.includes("[rejected]")) ??
    stderr
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ??
    "<no stderr>"
  );
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const resolveTicketStatus = (events: ReadonlyArray<ListedEvent>): string | undefined => {
  let status: string | undefined;

  for (const event of events) {
    if (!isRecord(event.payload)) continue;

    if (event.payload.op === "ticket.create" && typeof event.payload.status === "string") {
      status = event.payload.status;
    } else if (
      event.payload.op === "ticket.update" &&
      event.payload.field === "status" &&
      typeof event.payload.value === "string"
    ) {
      status = event.payload.value;
    }
  }

  return status;
};

const sameTicketDifferentEventsMerge: Scenario = {
  expected:
    "A and B append different event files for the same ticket; merge mode creates a merge commit.",
  name: "same-ticket-different-events-merge",
  run: async (context) => {
    const details = [...(await seedScenario(context))];
    const aWrite = await writeInClone(context, context.userA, {
      actor: "A",
      eventId: "evt_0002",
      payload: {
        field: "status",
        op: "ticket.update",
        value: "in-progress",
      },
      seconds: 2,
      ticketId,
    });
    const bWrite = await writeInClone(context, context.userB, {
      actor: "B",
      eventId: "evt_0003",
      payload: {
        field: "assignee",
        op: "ticket.update",
        value: "user-b",
      },
      seconds: 3,
      ticketId,
    });
    const bPush = await syncMain(context, context.userB, { mode: "full" });
    const aMerge = await syncMain(context, context.userA, {
      mode: "full",
      onDiverged: "merge",
    });
    const bPull = await syncMain(context, context.userB, {
      mode: "full",
      onDiverged: "merge",
    });
    const events = await listTicketEvents(context, context.userB);

    assertPointerStatus(bPush, "pushed");
    assertPointerStatus(aMerge, "merged");
    assertPointerStatus(bPull, "fast-forwarded");
    assertEventIds(events, ["evt_0001", "evt_0002", "evt_0003"]);

    details.push(`user A wrote ${aWrite.path} at ${short(aWrite.snapshotId)}`);
    details.push(`user B wrote ${bWrite.path} at ${short(bWrite.snapshotId)}`);
    details.push(`user B pushed: ${formatSync(bPush)}`);
    details.push(`user A merged and pushed: ${formatSync(aMerge)}`);
    details.push(`final events: ${events.map((event) => event.eventId).join(", ")}`);

    return { details };
  },
};

const sameTicketCompetingStatusUpdatesResolveAfterMerge: Scenario = {
  expected:
    "A and B update the same ticket status with different event files; GitDB merges and projection order decides final state.",
  name: "same-ticket-competing-status-updates-resolve-after-merge",
  run: async (context) => {
    const details = [...(await seedScenario(context))];

    await writeInClone(context, context.userA, {
      actor: "A",
      eventId: "evt_0002",
      payload: {
        field: "status",
        op: "ticket.update",
        value: "in-progress",
      },
      seconds: 12,
      ticketId,
    });
    await writeInClone(context, context.userB, {
      actor: "B",
      eventId: "evt_0003",
      payload: {
        field: "status",
        op: "ticket.update",
        value: "blocked",
      },
      seconds: 13,
      ticketId,
    });

    const bPush = await syncMain(context, context.userB, { mode: "full" });
    const aMerge = await syncMain(context, context.userA, {
      mode: "full",
      onDiverged: "merge",
    });
    const bPull = await syncMain(context, context.userB, {
      mode: "full",
      onDiverged: "merge",
    });
    const events = await listTicketEvents(context, context.userB);
    const projectedStatus = resolveTicketStatus(events);

    assertPointerStatus(bPush, "pushed");
    assertPointerStatus(aMerge, "merged");
    assertPointerStatus(bPull, "fast-forwarded");
    assertEventIds(events, ["evt_0001", "evt_0002", "evt_0003"]);
    assert.strictEqual(projectedStatus, "blocked");

    details.push(`user B pushed competing status update: ${formatSync(bPush)}`);
    details.push(`user A merged and pushed competing status update: ${formatSync(aMerge)}`);
    details.push(`projection resolved final status from ordered events: ${projectedStatus}`);

    return { details };
  },
};

const differentEventsWithoutMergeStrategyRejects: Scenario = {
  expected:
    "A and B append different event files, but default divergence handling rejects until merge mode is used.",
  name: "different-events-without-merge-strategy-rejects",
  run: async (context) => {
    const details = [...(await seedScenario(context))];

    await writeInClone(context, context.userA, {
      actor: "A",
      eventId: "evt_0002",
      payload: {
        field: "status",
        op: "ticket.update",
        value: "review",
      },
      seconds: 4,
      ticketId,
    });
    await writeInClone(context, context.userB, {
      actor: "B",
      eventId: "evt_0003",
      payload: {
        body: "Can reproduce on the latest build.",
        op: "ticket.comment",
      },
      seconds: 5,
      ticketId,
    });

    const bPush = await syncMain(context, context.userB, { mode: "full" });
    const rejected = await capture(syncMain(context, context.userA, { mode: "full" }));
    const conflict = expectSyncConflict(rejected);
    const aMerge = await syncMain(context, context.userA, {
      mode: "full",
      onDiverged: "merge",
    });
    const events = await listTicketEvents(context, context.userA);

    assertPointerStatus(bPush, "pushed");
    assertPointerStatus(aMerge, "merged");
    assertEventIds(events, ["evt_0001", "evt_0002", "evt_0003"]);

    details.push(
      `default full sync rejected divergence at merge base ${short(conflict.mergeBase)}`,
    );
    details.push(`user A retried with merge mode: ${formatSync(aMerge)}`);

    return { details };
  },
};

const sameTicketSameEventSamePayloadMerges: Scenario = {
  expected:
    "A and B append the same event path with identical canonical JSON; GitDB treats it as non-conflicting.",
  name: "same-ticket-same-event-same-payload-merges",
  run: async (context) => {
    const details = [...(await seedScenario(context))];
    const payload = {
      body: "Confirmed by support.",
      op: "ticket.comment",
    };

    await writeInClone(context, context.userA, {
      actor: "A",
      eventId: "evt_0002",
      payload,
      seconds: 6,
      ticketId,
    });
    await writeInClone(context, context.userB, {
      actor: "B",
      eventId: "evt_0002",
      payload,
      seconds: 7,
      ticketId,
    });

    const bPush = await syncMain(context, context.userB, { mode: "full" });
    const aMerge = await syncMain(context, context.userA, {
      mode: "full",
      onDiverged: "merge",
    });
    const events = await listTicketEvents(context, context.userA);

    assertPointerStatus(bPush, "pushed");
    assertPointerStatus(aMerge, "merged");
    assertEventIds(events, ["evt_0001", "evt_0002"]);

    details.push(`same path and same payload merged: ${formatSync(aMerge)}`);
    details.push(`final event path is present once: ${events.at(-1)?.path ?? "<missing>"}`);

    return { details };
  },
};

const sameTicketSameEventDifferentPayloadConflicts: Scenario = {
  expected:
    "A and B append the same event path with different JSON; merge mode raises SyncConflictError.",
  name: "same-ticket-same-event-different-payload-conflicts",
  run: async (context) => {
    const details = [...(await seedScenario(context))];

    await writeInClone(context, context.userA, {
      actor: "A",
      eventId: "evt_0002",
      payload: {
        field: "status",
        op: "ticket.update",
        value: "review",
      },
      seconds: 8,
      ticketId,
    });
    await writeInClone(context, context.userB, {
      actor: "B",
      eventId: "evt_0002",
      payload: {
        field: "status",
        op: "ticket.update",
        value: "blocked",
      },
      seconds: 9,
      ticketId,
    });

    const bPush = await syncMain(context, context.userB, { mode: "full" });
    const conflictResult = await capture(
      syncMain(context, context.userA, {
        mode: "full",
        onDiverged: "merge",
      }),
    );
    const conflict = expectSyncConflict(conflictResult);

    assertPointerStatus(bPush, "pushed");
    assert.ok(conflict.mergeBase, "expected conflict to include merge base");

    details.push(`user B pushed conflicting event path: ${formatSync(bPush)}`);
    details.push(
      `user A merge failed: local ${short(conflict.localSnapshot)}, remote ${short(
        conflict.remoteSnapshot,
      )}, base ${short(conflict.mergeBase)}`,
    );

    return { details };
  },
};

const stalePushRejectedBeforeMerge: Scenario = {
  expected:
    "A pushes without fetching after B has pushed a sibling event; Git rejects the stale push, then merge mode resolves.",
  name: "stale-direct-push-rejected-before-merge",
  run: async (context) => {
    const details = [...(await seedScenario(context))];

    await writeInClone(context, context.userA, {
      actor: "A",
      eventId: "evt_0002",
      payload: {
        field: "priority",
        op: "ticket.update",
        value: "high",
      },
      seconds: 10,
      ticketId,
    });
    await writeInClone(context, context.userB, {
      actor: "B",
      eventId: "evt_0003",
      payload: {
        field: "labels",
        op: "ticket.update",
        value: ["customer"],
      },
      seconds: 11,
      ticketId,
    });

    const bPush = await syncMain(context, context.userB, { mode: "full" });
    const stalePush = await capture(syncMain(context, context.userA, { mode: "push" }));
    const pushError = expectRemotePushError(stalePush);
    const aMerge = await syncMain(context, context.userA, {
      mode: "full",
      onDiverged: "merge",
    });
    const events = await listTicketEvents(context, context.userA);

    assertPointerStatus(bPush, "pushed");
    assertPointerStatus(aMerge, "merged");
    assertEventIds(events, ["evt_0001", "evt_0002", "evt_0003"]);

    details.push(`user B pushed first: ${formatSync(bPush)}`);
    details.push(`user A stale push rejected: ${firstUsefulStderrLine(pushError.stderr)}`);
    details.push(`user A fetched, merged, and pushed: ${formatSync(aMerge)}`);

    return { details };
  },
};

const scenarios: ReadonlyArray<Scenario> = [
  sameTicketDifferentEventsMerge,
  sameTicketCompetingStatusUpdatesResolveAfterMerge,
  differentEventsWithoutMergeStrategyRejects,
  sameTicketSameEventSamePayloadMerges,
  sameTicketSameEventDifferentPayloadConflicts,
  stalePushRejectedBeforeMerge,
];

const selectScenarios = (name: string): ReadonlyArray<Scenario> => {
  if (name === "all") return scenarios;

  const selected = scenarios.filter((scenario) => scenario.name === name);

  if (selected.length === 0) {
    throw new Error(
      `Unknown scenario "${name}". Available: ${scenarios.map((scenario) => scenario.name).join(", ")}`,
    );
  }

  return selected;
};

const runScenario = async (
  scenario: Scenario,
  options: Options,
): Promise<
  | {
      readonly context: ScenarioContext;
      readonly details: ReadonlyArray<string>;
      readonly ok: true;
      readonly removed: boolean;
    }
  | {
      readonly context: ScenarioContext;
      readonly error: unknown;
      readonly ok: false;
    }
> => {
  const context = createWorkspace(scenario.name, options.database);

  try {
    const result = await scenario.run(context);

    if (!options.keep) {
      fs.rmSync(context.root, { force: true, recursive: true });
    }

    return {
      context,
      details: result.details,
      ok: true,
      removed: !options.keep,
    };
  } catch (error) {
    return {
      context,
      error,
      ok: false,
    };
  }
};

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const selected = selectScenarios(options.scenario);
  let failures = 0;

  console.log("@cycle/git-db merge scenarios");
  console.log(`database`.padEnd(16), options.database);
  console.log(`scenarios`.padEnd(16), selected.length);
  console.log(`keep workspaces`.padEnd(16), String(options.keep));
  console.log("");

  for (const scenario of selected) {
    console.log(`[run] ${scenario.name}`);
    console.log(`      expected: ${scenario.expected}`);

    const result = await runScenario(scenario, options);

    if (result.ok) {
      console.log(`[pass] ${scenario.name}`);

      for (const detail of result.details) {
        console.log(`      ${detail}`);
      }

      console.log(`      workspace: ${result.removed ? "removed" : result.context.root}`);
      console.log("");
      continue;
    }

    failures += 1;
    console.log(`[fail] ${scenario.name}`);
    console.log(`      ${formatError(result.error)}`);
    console.log(`      workspace kept for inspection: ${result.context.root}`);
    console.log(`      remote: ${result.context.remote}`);
    console.log("");
  }

  console.log(`${selected.length - failures}/${selected.length} scenarios passed`);

  if (failures > 0) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
