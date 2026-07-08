import { EVENT_ROOT } from "@cycle/git-store/events";
import { Document } from "@cycle/git-store/document";
import { withTestIdentity } from "@cycle/git-store/testing";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Crypto, Effect, Layer } from "effect";
import {
  CURRENT_SCHEMA_VERSION,
  DatabaseIdGenerator,
  DatabaseIdGeneratorLive,
  DatabaseService,
  ValidationError,
  extractMentionTags,
  makeFrontmatter,
  makeTicketDocument,
  makeGitRepositoryStoreEffect,
  updatedDateKey,
  type Actor,
  type CreateTicketInput,
  type LinkedRecord,
  type RepositoryStoreShape,
  type TicketDocument,
} from "../src/index.ts";
import { DatabaseTest } from "../src/testing/index.ts";
import { Projection } from "../src/store/Projection.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const storeGitDirs = new WeakMap<RepositoryStoreShape, string>();

const makeStore = (database: string) =>
  Effect.gen(function* () {
    const cwd = yield* Effect.sync(() => {
      const directory = mkdtempSync(path.join(tmpdir(), "cycle-database-test-"));

      execFileSync("git", ["init", "--initial-branch=main"], {
        cwd: directory,
        stdio: "ignore",
      });

      return directory;
    });
    const store = yield* makeGitRepositoryStoreEffect(
      withTestIdentity({
        cwd,
        database,
      }),
    );

    storeGitDirs.set(store, path.join(cwd, ".git"));

    return store;
  });

const countEventDocumentReads = (
  store: RepositoryStoreShape,
  counter: {
    eventDocumentReads: number;
  },
): RepositoryStoreShape => ({
  ...store,
  get: (path, options) => {
    if (path.startsWith(`${EVENT_ROOT}/`)) {
      counter.eventDocumentReads += 1;
    }

    return store.get(path, options);
  },
});

const TestCrypto = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    digest: (_algorithm, data) => Effect.succeed(data),
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
  }),
);

const collectStorePaths = (
  store: RepositoryStoreShape,
  root = "",
): Effect.Effect<ReadonlyArray<string>, unknown, never> =>
  Effect.gen(function* () {
    const entries = yield* store.list(root);
    const paths: Array<string> = [];

    for (const entry of entries) {
      if (entry.type === "tree") {
        paths.push(...(yield* collectStorePaths(store, entry.path)));
      } else {
        paths.push(entry.path);
      }
    }

    return paths.sort();
  });

type TestEventDocument = {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly eventId: string;
  readonly path: string;
  readonly payload: unknown;
};

const listEvents = (
  store: RepositoryStoreShape,
): Effect.Effect<ReadonlyArray<TestEventDocument>, unknown, never> =>
  Effect.gen(function* () {
    const paths = yield* collectStorePaths(store, EVENT_ROOT);
    const events = yield* Effect.forEach(paths, (eventPath) =>
      Effect.gen(function* () {
        const parsed = store.parseEventPath(eventPath);
        if (parsed === null) return null;

        const document = yield* store.get(eventPath);
        if (document === null) return null;

        return {
          aggregateId: parsed.aggregateId,
          aggregateType: parsed.aggregateType,
          eventId: parsed.eventId,
          path: parsed.path,
          payload: document.json(),
        };
      }),
    );

    return events.filter((event): event is TestEventDocument => event !== null);
  });

const currentPointer = (store: RepositoryStoreShape, pointer = "main") =>
  store.resolveSnapshotId(pointer);

const deletePointer = (
  store: RepositoryStoreShape,
  pointer = "main",
): Effect.Effect<void, unknown, never> =>
  store.pointerRef(pointer).pipe(
    Effect.flatMap((ref) =>
      Effect.sync(() => {
        const gitDir = storeGitDirs.get(store);

        if (gitDir !== undefined) {
          rmSync(path.join(gitDir, ref), { force: true });
        }
      }),
    ),
  );

const externalActor: Actor = {
  email: "other@example.invalid",
  name: "Other User",
  type: "human",
};

const appendExternalTicket = (
  store: RepositoryStoreShape,
  input: {
    readonly eventId: string;
    readonly ticket: CreateTicketInput;
    readonly ticketId: string;
  },
) =>
  Effect.gen(function* () {
    const now = new Date().toISOString();
    const ticket = makeTicketDocument(
      makeFrontmatter(input.ticket, input.ticketId, externalActor, now),
      input.ticket.body ?? "External ticket body.",
    );
    yield* store.transaction(
      {
        author: {
          email: externalActor.email ?? "",
          name: externalActor.name,
        },
        committer: {
          email: externalActor.email ?? "",
          name: externalActor.name,
        },
        message: `External create ${input.ticketId}`,
      },
      (tx) =>
        store.appendEvent(tx, {
          aggregateId: input.ticketId,
          aggregateType: "ticket",
          eventId: input.eventId,
          payload: {
            op: "ticket.create",
            value: ticket,
          },
        }),
    );

    return ticket;
  });

const appendExternalTicketUpdate = (
  store: RepositoryStoreShape,
  input: {
    readonly eventId: string;
    readonly field: "body" | "priority" | "title" | "assignee";
    readonly ticketId: string;
    readonly value: unknown;
  },
) =>
  Effect.gen(function* () {
    yield* store.transaction(
      {
        author: {
          email: externalActor.email ?? "",
          name: externalActor.name,
        },
        committer: {
          email: externalActor.email ?? "",
          name: externalActor.name,
        },
        message: `External update ${input.ticketId}`,
      },
      (tx) =>
        store.appendEvent(tx, {
          aggregateId: input.ticketId,
          aggregateType: "ticket",
          eventId: input.eventId,
          payload: {
            field: input.field,
            op: "ticket.update",
            value: input.value,
          },
        }),
    );
  });

const appendExternalComment = (
  store: RepositoryStoreShape,
  input: {
    readonly body: string;
    readonly eventId: string;
    readonly recordId: string;
    readonly ticketId: string;
  },
) =>
  Effect.gen(function* () {
    const now = new Date().toISOString();
    const record: LinkedRecord = {
      createdAt: now,
      createdBy: externalActor,
      createdDate: updatedDateKey(now),
      id: input.recordId,
      issueId: input.ticketId,
      payload: {
        body: input.body,
      },
      recordType: "comment",
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
    yield* store.transaction(
      {
        author: {
          email: externalActor.email ?? "",
          name: externalActor.name,
        },
        committer: {
          email: externalActor.email ?? "",
          name: externalActor.name,
        },
        message: `External comment ${input.ticketId}`,
      },
      (tx) =>
        store.appendEvent(tx, {
          aggregateId: record.id,
          aggregateType: "record",
          eventId: input.eventId,
          payload: {
            op: "record.add",
            value: record,
          },
        }),
    );
  });

describe("@cycle/database", () => {
  it("schema-validates persisted projection document JSON during hydration", () => {
    const projection = new Projection(":memory:");
    const now = "2026-06-20T00:00:00.000Z";

    try {
      projection.db
        .prepare(
          `INSERT INTO users (
            repository_id, user_id, snapshot_id, email, display_name, source,
            created_at, updated_at, profile_json, schema_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "projection-schema-repo",
          "user-1",
          "snapshot-1",
          "user@example.invalid",
          "User One",
          "manual",
          now,
          now,
          JSON.stringify({
            createdAt: now,
            displayName: "User One",
            id: "user-1",
            schemaVersion: 1,
            source: "manual",
            updatedAt: now,
          }),
          1,
        );

      assert.throws(() => projection.getUser("projection-schema-repo", "user-1"), /email/u);
    } finally {
      projection.close();
    }
  });

  it("normalizes hydrated projection frontmatter statuses", () => {
    const projection = new Projection(":memory:");
    const now = "2026-06-20T00:00:00.000Z";
    const ticket = {
      body: "Legacy projected ticket body.",
      bodyFormat: "markdown",
      createdBy: "User One",
      frontmatter: {
        assignee: {
          email: "user@example.invalid",
          name: "User One",
          type: "human",
        },
        createdAt: now,
        createdBy: {
          name: "User One",
          type: "human",
        },
        id: "UKN-00001",
        priority: "none",
        status: "in progress",
        title: "Legacy projected ticket",
        type: "task",
        updatedAt: now,
      },
      id: "UKN-00001",
      parent: "none",
      priority: "none",
      schemaVersion: 1,
      status: "in progress",
      title: "Legacy projected ticket",
      type: "task",
      updatedDate: "2026-06-20",
    } as unknown as TicketDocument;

    try {
      projection.upsertTicket({
        path: "tickets/UKN-00001.md",
        repositoryId: "projection-status-repo",
        snapshotId: "snapshot-1",
        ticket,
      });

      const hydrated = projection.getTicket("projection-status-repo", "UKN-00001");

      assert.strictEqual(hydrated?.status, "in-progress");
      assert.strictEqual(hydrated?.assignee, "user-example.invalid");
      assert.strictEqual(hydrated?.frontmatter.status, "in-progress");
      assert.strictEqual(hydrated?.frontmatter.assignee, "user@example.invalid");
    } finally {
      projection.close();
    }
  });

  it.effect(
    "writes tickets to GitDB, resyncs SQLite before returning, and queries multiple repositories",
    () =>
      Effect.gen(function* () {
        const database = yield* DatabaseService;
        const storeA = yield* makeStore("repo-a");
        const storeB = yield* makeStore("repo-b");

        yield* database.openRepository({
          displayName: "Repository A",
          repositoryId: "repo-a",
          store: storeA,
        });
        yield* database.openRepository({
          displayName: "Repository B",
          repositoryId: "repo-b",
          store: storeB,
        });

        const ticketA = yield* database.createTicket("repo-a", {
          body: "Need a searchable SQLite projection for repository tickets.",
          labels: ["database", "sqlite"],
          priority: "high",
          title: "Build database package",
          type: "task",
        });
        const ticketB = yield* database.createTicket("repo-b", {
          labels: ["frontend"],
          priority: "medium",
          title: "Polish issue sidebar",
          type: "task",
        });
        const fetchedA = yield* database.getTicket("repo-a", ticketA.id);
        const repoAHigh = yield* database.listTickets({
          priority: "high",
          repositoryIds: ["repo-a"],
        });
        const allBacklog = yield* database.listTickets({
          status: "backlog",
        });

        assert.strictEqual(ticketA.id, "UKN-00001");
        assert.strictEqual(ticketB.id, "UKN-00002");
        assert.deepStrictEqual(fetchedA?.id, ticketA.id);
        assert.deepStrictEqual(
          repoAHigh.entries.map((ticket) => ticket.id),
          [ticketA.id],
        );
        assert.deepStrictEqual(
          allBacklog.entries.map((ticket) => ticket.id).sort(),
          [ticketA.id, ticketB.id].sort(),
        );
      }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("does not initialize Cycle repository metadata when opening an empty repository", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("default-prefix-repo");

      const status = yield* database.openRepository({
        repositoryId: "default-prefix-repo",
        store,
        syncOnOpen: false,
      });
      const events = yield* listEvents(store);
      const current = yield* currentPointer(store);

      assert.strictEqual(status.activeSnapshotId, null);
      assert.strictEqual(status.cycleMetadata, undefined);
      assert.deepStrictEqual(events, []);
      assert.strictEqual(current, null);
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("creates Cycle metadata and the actor user in the first explicit write", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("first-write-repo");

      yield* database.openRepository({
        repositoryId: "first-write-repo",
        store,
      });

      const ticket = yield* database.createTicket("first-write-repo", {
        title: "First write ticket",
        type: "task",
      });
      const events = yield* listEvents(store);
      const sourceProfile = yield* database.getUser("first-write-repo", "test@example.invalid");
      const status = yield* database.repositoryStatus("first-write-repo");
      const history = yield* store.history("main");

      assert.strictEqual(ticket.id, "UKN-00001");
      assert.ok(events.some((event) => event.aggregateType === "repository"));
      assert.strictEqual(sourceProfile?.id, "test@example.invalid");
      assert.strictEqual(status.cycleMetadata?.ticketPrefix, "UKN");
      assert.strictEqual(history.length, 1);
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("uses UUIDv7-shaped live event ids for globally unique event file names", () =>
    Effect.gen(function* () {
      const ids = yield* DatabaseIdGenerator;
      const first = yield* ids.eventId;
      const second = yield* ids.eventId;

      assert.notStrictEqual(first, second);
      assert.match(first, /^evt_[0-9a-f]{12}7[0-9a-f]{19}$/u);
      assert.match(second, /^evt_[0-9a-f]{12}7[0-9a-f]{19}$/u);
    }).pipe(Effect.provide(DatabaseIdGeneratorLive.pipe(Layer.provide(TestCrypto)))),
  );

  it.effect("commits only event files and rebuilds materialized ticket state from events", () =>
    Effect.gen(function* () {
      const repositoryId = "event-log-invariants-repo";
      const database = yield* DatabaseService;
      const store = yield* makeStore(repositoryId);

      yield* database.openRepository({
        repositoryId,
        store,
      });

      const ticket = yield* database.createTicket(repositoryId, {
        priority: "low",
        status: "todo",
        title: "Event log invariant ticket",
        type: "task",
      });
      yield* database.updateTicket(repositoryId, ticket.id, {
        frontmatter: {
          priority: "high",
          status: "in-progress",
        },
      });

      const beforeDeleteStatus = yield* database.repositoryStatus(repositoryId);

      yield* database.deleteTicket(repositoryId, ticket.id, {
        reason: "verify deletes are events",
      });

      const afterDeleteStatus = yield* database.repositoryStatus(repositoryId);
      const beforeDeleteSnapshot = beforeDeleteStatus.activeSnapshotId;
      const afterDeleteSnapshot = afterDeleteStatus.activeSnapshotId;

      assert.ok(beforeDeleteSnapshot);
      assert.ok(afterDeleteSnapshot);

      const deleteDiff = yield* store.diff(beforeDeleteSnapshot, afterDeleteSnapshot);
      const deletePayloads = yield* Effect.forEach(deleteDiff.added, (change) =>
        store.get(change.path).pipe(Effect.map((document) => document?.json())),
      );
      const allPaths = yield* collectStorePaths(store);
      const events = yield* listEvents(store);
      const activeBeforeRebuild = yield* database.listTickets({
        repositoryIds: [repositoryId],
      });
      const deletedBeforeRebuild = yield* database.listTickets({
        deleted: true,
        repositoryIds: [repositoryId],
      });
      const rebuilt = yield* Effect.gen(function* () {
        const freshDatabase = yield* DatabaseService;

        yield* freshDatabase.openRepository({
          repositoryId,
          store,
        });

        const active = yield* freshDatabase.listTickets({
          repositoryIds: [repositoryId],
        });
        const deleted = yield* freshDatabase.listTickets({
          deleted: true,
          repositoryIds: [repositoryId],
        });
        const status = yield* freshDatabase.repositoryStatus(repositoryId);

        return { active, deleted, status };
      }).pipe(Effect.provide(DatabaseTest("event-log-rebuild")));

      assert.deepStrictEqual(deleteDiff.deleted, []);
      assert.ok(deleteDiff.added.every((change) => change.path.startsWith("collections/events/")));
      assert.ok(
        deletePayloads.some(
          (payload) =>
            payload !== null &&
            typeof payload === "object" &&
            !Array.isArray(payload) &&
            "op" in payload &&
            payload.op === "ticket.delete",
        ),
      );
      assert.ok(allPaths.every((path) => path.startsWith("collections/events/")));
      assert.ok(
        allPaths.some((path) =>
          path.startsWith(
            `${store.aggregatePath({
              aggregateId: ticket.id,
              aggregateType: "ticket",
            })}/`,
          ),
        ),
      );
      assert.ok(!allPaths.some((path) => /(^|\/)(index|projection)s?(\/|\.|$)/u.test(path)));
      assert.strictEqual(new Set(allPaths).size, allPaths.length);
      assert.strictEqual(new Set(events.map((event) => event.path)).size, events.length);
      assert.ok(
        events.every(
          (event) =>
            event.payload !== null &&
            typeof event.payload === "object" &&
            !Array.isArray(event.payload),
        ),
      );
      assert.deepStrictEqual(
        activeBeforeRebuild.entries.map((entry) => entry.id),
        [],
      );
      assert.deepStrictEqual(
        deletedBeforeRebuild.entries.map((entry) => entry.id),
        [ticket.id],
      );
      assert.deepStrictEqual(
        rebuilt.active.entries.map((entry) => entry.id),
        [],
      );
      assert.deepStrictEqual(
        rebuilt.deleted.entries.map((entry) => entry.id),
        [ticket.id],
      );
      assert.strictEqual(rebuilt.status.activeSnapshotId, afterDeleteStatus.activeSnapshotId);
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("commits drafts with repository-prefixed ticket ids", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("draft-ticket-id-repo");

      yield* database.openRepository({
        repositoryId: "draft-ticket-id-repo",
        store,
      });

      const draft = yield* database.createDraft("draft-ticket-id-repo", {
        title: "Draft ticket id",
        type: "task",
      });
      const ticket = yield* database.commitDraft("draft-ticket-id-repo", draft.id);

      assert.strictEqual(ticket.id, "UKN-00001");
      assert.strictEqual(ticket.frontmatter.id, "UKN-00001");
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("indexes title, body, and comments for ticket-oriented full-text search", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("search-repo");

      yield* database.openRepository({
        repositoryId: "search-repo",
        store,
      });

      const ticket = yield* database.createTicket("search-repo", {
        body: "The body mentions materialized views.",
        title: "Projection search",
        type: "task",
      });
      const comment = yield* database.addComment("search-repo", ticket.id, {
        body: "Comment mentions sync visibility for the frontend.",
      });
      const bodyResults = yield* database.searchTickets({
        repositoryIds: ["search-repo"],
        text: "materialized",
      });
      const commentResults = yield* database.searchTickets({
        repositoryIds: ["search-repo"],
        text: "visibility",
      });
      const comments = yield* database.ticketComments("search-repo", ticket.id);

      assert.strictEqual(comment.recordType, "comment");
      assert.deepStrictEqual(
        bodyResults.entries.map((entry) => ({
          fields: entry.matchedFields,
          id: entry.ticket.id,
        })),
        [{ fields: ["body"], id: ticket.id }],
      );
      assert.deepStrictEqual(
        commentResults.entries.map((entry) => ({
          fields: entry.matchedFields,
          id: entry.ticket.id,
        })),
        [{ fields: ["comment"], id: ticket.id }],
      );
      assert.deepStrictEqual(
        comments.entries.map((entry) => entry.id),
        [comment.id],
      );

      const emptyComment = yield* Effect.flip(
        database.addComment("search-repo", ticket.id, {
          body: "   ",
        }),
      );

      assert.ok(emptyComment instanceof ValidationError);
      assert.match(emptyComment.message, /comment body must not be empty/u);
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("parses mentions while ignoring markdown code spans and fenced blocks", () =>
    Effect.sync(() => {
      const mentions = extractMentionTags(
        [
          "Please ask @reviewer and @user@example.invalid.",
          "",
          "`@inline` should not count.",
          "",
          "```ts",
          "const owner = '@fenced';",
          "```",
          "",
          "@reviewer should only appear once.",
        ].join("\n"),
      );

      assert.deepStrictEqual(
        mentions.map((mention) => mention.normalized),
        ["reviewer", "user@example.invalid"],
      );
    }),
  );

  it.effect(
    "derives inbox items from mentions, comments, and assignment without GitDB inbox writes",
    () =>
      Effect.gen(function* () {
        const repositoryId = "inbox-derived-repo";
        const userId = "mentioned@example.invalid";
        const database = yield* DatabaseService;
        const store = yield* makeStore(repositoryId);

        yield* database.openRepository({
          repositoryId,
          store,
        });
        yield* database.upsertUser(repositoryId, {
          aliases: ["reviewer"],
          displayName: "Mentioned User",
          email: userId,
        });

        const mentionedTicket = yield* appendExternalTicket(store, {
          eventId: "evt_inbox_mention",
          ticket: {
            body: "Please review this, @reviewer.",
            title: "Mentioned ticket",
            type: "task",
          },
          ticketId: "EXT-00001",
        });
        yield* database.syncRepository(repositoryId);

        const afterMention = yield* database.listInbox({
          repositoryIds: [repositoryId],
          userId,
        });

        yield* appendExternalTicketUpdate(store, {
          eventId: "evt_inbox_unrelated_update",
          field: "priority",
          ticketId: mentionedTicket.id,
          value: "high",
        });
        yield* appendExternalTicketUpdate(store, {
          eventId: "evt_inbox_assigned_update",
          field: "assignee",
          ticketId: mentionedTicket.id,
          value: "reviewer",
        });
        yield* appendExternalComment(store, {
          body: "New detail for @reviewer.",
          eventId: "evt_inbox_comment",
          recordId: "EXT-00001_comment_rec_0001",
          ticketId: mentionedTicket.id,
        });
        yield* database.syncRepository(repositoryId);

        const page = yield* database.listInbox({
          repositoryIds: [repositoryId],
          status: "all",
          userId,
        });
        const summary = yield* database.inboxSummary({
          repositoryIds: [repositoryId],
          userId,
        });
        const storePathsBeforeLocalState = yield* collectStorePaths(store);
        const firstItemId = page.entries[0]?.itemId;

        assert.ok(firstItemId);

        const read = yield* database.markInboxRead({
          itemIds: [firstItemId],
          userId,
        });
        const readAgain = yield* database.markInboxRead({
          itemIds: [firstItemId],
          userId,
        });
        const archive = yield* database.archiveInboxItems({
          itemIds: [firstItemId],
          userId,
        });
        const archiveAgain = yield* database.archiveInboxItems({
          itemIds: [firstItemId],
          userId,
        });
        const storePathsAfterLocalState = yield* collectStorePaths(store);
        const archived = yield* database.listInbox({
          repositoryIds: [repositoryId],
          status: "archived",
          userId,
        });
        const rebuilt = yield* Effect.gen(function* () {
          const freshDatabase = yield* DatabaseService;

          yield* freshDatabase.openRepository({
            repositoryId,
            store,
          });

          return yield* freshDatabase.listInbox({
            repositoryIds: [repositoryId],
            status: "all",
            userId,
          });
        }).pipe(Effect.provide(DatabaseTest("inbox-rebuild")));

        assert.deepStrictEqual(
          afterMention.entries.map((entry) => entry.reason),
          ["mention"],
        );
        assert.strictEqual(page.entries.length, 4);
        assert.deepStrictEqual(
          page.entries.map((entry) => entry.reason).sort(),
          ["assigned", "comment_assigned", "mention", "mention"].sort(),
        );
        assert.strictEqual(summary.unreadCount, 4);
        assert.strictEqual(summary.byReason.mention, 2);
        assert.strictEqual(summary.byReason.assigned, 1);
        assert.strictEqual(summary.byReason.comment_assigned, 1);
        assert.strictEqual(read.matchedCount, 1);
        assert.strictEqual(readAgain.matchedCount, 1);
        assert.strictEqual(archive.matchedCount, 1);
        assert.strictEqual(archiveAgain.matchedCount, 1);
        assert.deepStrictEqual(storePathsAfterLocalState, storePathsBeforeLocalState);
        assert.deepStrictEqual(
          archived.entries.map((entry) => entry.itemId),
          [firstItemId],
        );
        assert.strictEqual(
          new Set(page.entries.map((entry) => entry.itemId)).size,
          page.entries.length,
        );
        assert.deepStrictEqual(
          rebuilt.entries.map((entry) => entry.itemId).sort(),
          page.entries.map((entry) => entry.itemId).sort(),
        );
      }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect(
    "suppresses self-authored inbox items and skips unknown mentions without blocking sync",
    () =>
      Effect.gen(function* () {
        const repositoryId = "inbox-self-and-unknown-repo";
        const userId = "mentioned@example.invalid";
        const database = yield* DatabaseService;
        const store = yield* makeStore(repositoryId);

        yield* database.openRepository({
          repositoryId,
          store,
        });
        yield* database.upsertUser(repositoryId, {
          aliases: ["reviewer"],
          displayName: "Mentioned User",
          email: userId,
        });

        const now = new Date().toISOString();
        const selfTicket = makeTicketDocument(
          makeFrontmatter(
            {
              body: "Self-authored @reviewer mention.",
              title: "Self mention",
              type: "task",
            },
            "EXT-00003",
            {
              email: userId,
              name: "Mentioned User",
              type: "human",
            },
            now,
          ),
          "Self-authored @reviewer mention.",
        );
        yield* store.transaction(
          {
            author: {
              email: userId,
              name: "Mentioned User",
            },
            committer: {
              email: userId,
              name: "Mentioned User",
            },
            message: "Add self, unknown, and invalid inbox sources",
          },
          (tx) =>
            Effect.gen(function* () {
              yield* store.appendEvent(tx, {
                aggregateId: selfTicket.id,
                aggregateType: "ticket",
                eventId: "evt_inbox_self_mention",
                payload: {
                  op: "ticket.create",
                  value: selfTicket,
                },
              });
              yield* store.appendEvent(tx, {
                aggregateId: "EXT-00004",
                aggregateType: "ticket",
                eventId: "evt_inbox_unknown_mention",
                payload: {
                  op: "ticket.create",
                  value: makeTicketDocument(
                    makeFrontmatter(
                      {
                        body: "Unknown @missing-user mention.",
                        title: "Unknown mention",
                        type: "task",
                      },
                      "EXT-00004",
                      externalActor,
                      now,
                    ),
                    "Unknown @missing-user mention.",
                  ),
                },
              });
              yield* tx.put(
                "collections/events/ticket/broken-inbox/evt_broken_inbox.json",
                Document.json({
                  op: "ticket.not-supported",
                }),
              );
            }),
        );

        const status = yield* database.syncRepository(repositoryId);
        const page = yield* database.listInbox({
          repositoryIds: [repositoryId],
          status: "all",
          userId,
        });
        const warnings = yield* database.materializationWarnings(repositoryId);

        assert.strictEqual(status.status, "degraded");
        assert.deepStrictEqual(page.entries, []);
        assert.ok(warnings.some((warning) => warning.objectId === "broken-inbox"));
      }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("allows human issue property edits to move directly between visible UI states", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("manual-property-edit-repo");

      yield* database.openRepository({
        repositoryId: "manual-property-edit-repo",
        store,
      });

      const ticket = yield* database.createTicket("manual-property-edit-repo", {
        priority: "low",
        status: "todo",
        title: "Manual property edit ticket",
        type: "task",
      });
      const updated = yield* database.updateTicket("manual-property-edit-repo", ticket.id, {
        frontmatter: {
          priority: "high",
          status: "in-progress",
        },
      });

      assert.strictEqual(updated.status, "in-progress");
      assert.strictEqual(updated.priority, "high");
      assert.strictEqual(updated.frontmatter.status, "in-progress");
      assert.strictEqual(updated.frontmatter.priority, "high");
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("normalizes display-label issue statuses in durable frontmatter", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("display-label-status-repo");

      yield* database.openRepository({
        repositoryId: "display-label-status-repo",
        store,
      });

      const created = yield* database.createTicket("display-label-status-repo", {
        status: "In Progress",
        title: "Display label status ticket",
        type: "task",
      });
      const updated = yield* database.updateTicket("display-label-status-repo", created.id, {
        frontmatter: {
          status: "in progress",
        },
      });
      const listed = yield* database.listTickets({
        repositoryIds: ["display-label-status-repo"],
      });

      assert.strictEqual(created.status, "in-progress");
      assert.strictEqual(created.frontmatter.status, "in-progress");
      assert.strictEqual(updated.status, "in-progress");
      assert.strictEqual(updated.frontmatter.status, "in-progress");
      assert.strictEqual(listed.entries[0]?.frontmatter.status, "in-progress");
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("materializes issue metadata, relations, and soft-state filters", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("metadata-repo");

      yield* database.openRepository({
        repositoryId: "metadata-repo",
        store,
      });

      const source = yield* database.createTicket("metadata-repo", {
        body: "Metadata body",
        dueDate: "2026-06-30",
        estimate: 3,
        title: "Metadata ticket",
        type: "task",
      });
      const target = yield* database.createTicket("metadata-repo", {
        title: "Dependency ticket",
        type: "task",
      });
      const related = yield* database.addIssueRelation("metadata-repo", source.id, {
        issueId: target.id,
        type: "blocking",
      });
      const targetAfterRelation = yield* database.getTicket("metadata-repo", target.id);
      const dueBefore = yield* database.listTickets({
        dueBefore: "2026-07-01",
        estimate: 3,
        hasDueDate: true,
        repositoryIds: ["metadata-repo"],
      });
      const blocking = yield* database.listTickets({
        relation: {
          issueId: target.id,
          type: "blocking",
        },
        repositoryIds: ["metadata-repo"],
      });

      assert.strictEqual(source.frontmatter.dueDate, "2026-06-30");
      assert.strictEqual(source.frontmatter.estimate, 3);
      assert.deepStrictEqual(related.frontmatter.relations, [
        {
          issueId: target.id,
          type: "blocking",
        },
      ]);
      assert.deepStrictEqual(targetAfterRelation?.frontmatter.relations, [
        {
          issueId: source.id,
          type: "blocked-by",
        },
      ]);
      assert.deepStrictEqual(
        dueBefore.entries.map((ticket) => ticket.id),
        [source.id],
      );
      assert.deepStrictEqual(
        blocking.entries.map((ticket) => ticket.id),
        [source.id],
      );

      yield* database.archiveTicket("metadata-repo", source.id, {
        reason: "done for now",
      });
      const activeAfterArchive = yield* database.listTickets({
        repositoryIds: ["metadata-repo"],
      });
      const archived = yield* database.listTickets({
        archived: true,
        repositoryIds: ["metadata-repo"],
      });

      assert.deepStrictEqual(
        activeAfterArchive.entries.map((ticket) => ticket.id),
        [target.id],
      );
      assert.deepStrictEqual(
        archived.entries.map((ticket) => ticket.id),
        [source.id],
      );

      yield* database.restoreTicket("metadata-repo", source.id);
      yield* database.deleteTicket("metadata-repo", source.id, {
        reason: "remove from active work",
      });

      const activeAfterDelete = yield* database.listTickets({
        repositoryIds: ["metadata-repo"],
      });
      const deleted = yield* database.listTickets({
        deleted: true,
        repositoryIds: ["metadata-repo"],
      });

      assert.deepStrictEqual(
        activeAfterDelete.entries.map((ticket) => ticket.id),
        [target.id],
      );
      assert.deepStrictEqual(
        deleted.entries.map((ticket) => ticket.id),
        [source.id],
      );

      const restored = yield* database.restoreTicket("metadata-repo", source.id);

      assert.strictEqual(restored.frontmatter.deletedAt, undefined);
      assert.strictEqual(restored.frontmatter.archivedAt, undefined);
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("reads ticket revisions and returns body plus metadata diffs", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("revision-repo");

      yield* database.openRepository({
        repositoryId: "revision-repo",
        store,
      });

      const ticket = yield* database.createTicket("revision-repo", {
        body: "Old body",
        priority: "low",
        title: "Revision ticket",
        type: "task",
      });
      yield* database.updateTicket("revision-repo", ticket.id, {
        body: "New body",
        frontmatter: {
          priority: "high",
        },
      });

      const history = yield* database.ticketHistory("revision-repo", ticket.id);
      const ordered = history.entries.slice().sort((a, b) => a.sequence - b.sequence);
      const fromSnapshotId = ordered[0]?.snapshotId;
      const toSnapshotId = ordered.at(-1)?.snapshotId;

      assert.ok(fromSnapshotId);
      assert.ok(toSnapshotId);

      const revision = yield* database.ticketRevision("revision-repo", ticket.id, fromSnapshotId);
      const diff = yield* database.ticketDiff(
        "revision-repo",
        ticket.id,
        fromSnapshotId,
        toSnapshotId,
      );

      assert.strictEqual(revision?.body, "Old body");
      assert.strictEqual(diff.files[0]?.oldContent, "Old body");
      assert.strictEqual(diff.files[0]?.newContent, "New body");
      assert.ok(
        diff.metadataChanges.some(
          (change) =>
            change.field === "priority" && change.before === "low" && change.after === "high",
        ),
      );
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("materializes repository and ticket history from GitDB commits", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("history-repo");

      yield* database.openRepository({
        repositoryId: "history-repo",
        store,
      });

      const ticket = yield* database.createTicket("history-repo", {
        title: "History ticket",
        type: "task",
      });
      yield* database.addComment("history-repo", ticket.id, {
        body: "Record this in history.",
      });
      yield* database.transitionTicket("history-repo", ticket.id, {
        status: "todo",
      });

      const repositoryHistory = yield* database.repositoryHistory("history-repo");
      const ticketHistory = yield* database.ticketHistory("history-repo", ticket.id);

      assert.ok(repositoryHistory.entries.length >= 3);
      assert.ok(ticketHistory.entries.length >= 3);
      assert.ok(
        repositoryHistory.entries.some((entry) => entry.changedTicketIds.includes(ticket.id)),
      );
      assert.ok(ticketHistory.entries.every((entry) => entry.changedTicketIds.includes(ticket.id)));
      assert.ok(
        repositoryHistory.entries.some(
          (entry) => entry.message === 'Test User created "History ticket" ticket',
        ),
      );
      assert.ok(
        repositoryHistory.entries.some(
          (entry) => entry.message === 'Test User commented on "History ticket" ticket',
        ),
      );
      assert.ok(
        repositoryHistory.entries.some(
          (entry) => entry.message === 'Test User updated the status of "History ticket" to Todo',
        ),
      );
      assert.ok(repositoryHistory.entries.every((entry) => !entry.message?.includes(ticket.id)));
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("incrementally replays commits added after the active snapshot", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const baseStore = yield* makeStore("incremental-replay-repo");
      const counter = { eventDocumentReads: 0 };
      const store = countEventDocumentReads(baseStore, counter);

      yield* database.openRepository({
        repositoryId: "incremental-replay-repo",
        store,
      });

      let firstTicketId = "";
      for (let index = 0; index < 5; index += 1) {
        const ticket = yield* database.createTicket("incremental-replay-repo", {
          title: `Incremental replay ticket ${index + 1}`,
          type: "task",
        });

        if (index === 0) {
          firstTicketId = ticket.id;
        }
      }

      counter.eventDocumentReads = 0;
      yield* appendExternalTicketUpdate(store, {
        eventId: "evt_external_priority",
        field: "priority",
        ticketId: firstTicketId,
        value: "high",
      });

      const status = yield* database.syncRepository("incremental-replay-repo");
      const updated = yield* database.getTicket("incremental-replay-repo", firstTicketId);
      const history = yield* database.repositoryHistory("incremental-replay-repo");

      assert.strictEqual(status.status, "ready");
      assert.strictEqual(updated?.frontmatter.priority, "high");
      assert.strictEqual(counter.eventDocumentReads, 1);
      assert.ok(history.entries.length >= 6);
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("materializes ticket writes from the committed snapshot delta", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const baseStore = yield* makeStore("write-delta-repo");
      const counter = { eventDocumentReads: 0 };
      const store = countEventDocumentReads(baseStore, counter);

      yield* database.openRepository({
        repositoryId: "write-delta-repo",
        store,
      });

      yield* database.createTicket("write-delta-repo", {
        title: "Initial ticket seeds defaults",
        type: "task",
      });

      counter.eventDocumentReads = 0;
      const ticket = yield* database.createTicket("write-delta-repo", {
        title: "Delta materialized ticket",
        type: "task",
      });
      const projected = yield* database.getTicket("write-delta-repo", ticket.id);

      assert.strictEqual(projected?.id, ticket.id);
      assert.strictEqual(counter.eventDocumentReads, 3);
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect(
    "skips invalid source objects with warnings while keeping valid tickets queryable",
    () =>
      Effect.gen(function* () {
        const database = yield* DatabaseService;
        const store = yield* makeStore("warning-repo");

        yield* database.openRepository({
          repositoryId: "warning-repo",
          store,
        });

        const valid = yield* database.createTicket("warning-repo", {
          labels: ["valid"],
          title: "Valid ticket",
          type: "task",
        });
        yield* store.transaction(
          {
            message: "Add broken issue document",
          },
          (tx) =>
            tx.put(
              "collections/events/ticket/broken-ticket/evt_broken.json",
              Document.json({
                op: "ticket.not-supported",
              }),
            ),
        );

        const status = yield* database.syncRepository("warning-repo");
        const warnings = yield* database.materializationWarnings("warning-repo");
        const listed = yield* database.listTickets({
          repositoryIds: ["warning-repo"],
        });

        assert.strictEqual(status.status, "degraded");
        assert.strictEqual(status.warningCount, 1);
        assert.strictEqual(warnings[0]?.objectId, "broken-ticket");
        assert.deepStrictEqual(
          listed.entries.map((ticket) => ticket.id),
          [valid.id],
        );
      }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("clears the repository projection when the GitDB pointer is removed", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("removed-pointer-repo");

      yield* database.openRepository({
        repositoryId: "removed-pointer-repo",
        store,
      });

      const ticket = yield* database.createTicket("removed-pointer-repo", {
        body: "This ticket should disappear when the GitDB ref is removed.",
        title: "Pointer removal ticket",
        type: "task",
      });
      const beforeRemoval = yield* database.listTickets({
        repositoryIds: ["removed-pointer-repo"],
      });
      yield* deletePointer(store);

      const status = yield* database.syncRepository("removed-pointer-repo");
      const afterRemoval = yield* database.listTickets({
        repositoryIds: ["removed-pointer-repo"],
      });
      const search = yield* database.searchTickets({
        repositoryIds: ["removed-pointer-repo"],
        text: "disappear",
      });
      const history = yield* database.repositoryHistory("removed-pointer-repo");
      const repositoryStatus = yield* database.repositoryStatus("removed-pointer-repo");
      const fetched = yield* database.getTicket("removed-pointer-repo", ticket.id);

      assert.deepStrictEqual(
        beforeRemoval.entries.map((entry) => entry.id),
        [ticket.id],
      );
      assert.strictEqual(status.status, "empty");
      assert.strictEqual(status.activeSnapshotId, null);
      assert.strictEqual(status.cycleMetadata, undefined);
      assert.strictEqual(repositoryStatus.cycleMetadata, undefined);
      assert.deepStrictEqual(afterRemoval.entries, []);
      assert.deepStrictEqual(search.entries, []);
      assert.deepStrictEqual(history.entries, []);
      assert.strictEqual(fetched, null);
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("does not recreate the GitDB pointer when reopening after pointer removal", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("reopened-removed-pointer-repo");

      yield* database.openRepository({
        repositoryId: "reopened-removed-pointer-repo",
        store,
      });

      const ticket = yield* database.createTicket("reopened-removed-pointer-repo", {
        title: "Reopened pointer removal ticket",
        type: "task",
      });
      yield* deletePointer(store);
      yield* database.syncRepository("reopened-removed-pointer-repo");

      const reopened = yield* database.openRepository({
        repositoryId: "reopened-removed-pointer-repo",
        store,
      });
      const current = yield* currentPointer(store);
      const events = yield* listEvents(store);
      const listed = yield* database.listTickets({
        repositoryIds: ["reopened-removed-pointer-repo"],
      });
      const fetched = yield* database.getTicket("reopened-removed-pointer-repo", ticket.id);

      assert.strictEqual(reopened.status, "empty");
      assert.strictEqual(reopened.activeSnapshotId, null);
      assert.strictEqual(reopened.cycleMetadata, undefined);
      assert.strictEqual(current, null);
      assert.deepStrictEqual(events, []);
      assert.deepStrictEqual(listed.entries, []);
      assert.strictEqual(fetched, null);
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("commits actor user profiles alongside first shared writes", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("users-repo");

      yield* database.openRepository({
        repositoryId: "users-repo",
        store,
      });

      yield* database.createTicket("users-repo", {
        title: "First shared ticket",
        type: "task",
      });

      const events = yield* listEvents(store);
      const userEvent = events.find(
        (event) => event.aggregateType === "user" && event.aggregateId === "test@example.invalid",
      );
      const projectedProfile = yield* database.getUser("users-repo", "test@example.invalid");
      const userList = yield* database.listUsers("users-repo", {
        text: "test",
      });

      assert.ok(userEvent !== undefined);
      assert.strictEqual(projectedProfile?.email, "test@example.invalid");
      assert.strictEqual(projectedProfile?.displayName, "Test User");
      assert.deepStrictEqual(
        userList.entries.map((user) => user.id),
        ["test@example.invalid"],
      );
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("stores and projects labels, saved views, templates, and initiative updates", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("linear-metadata-repo");

      yield* database.openRepository({
        repositoryId: "linear-metadata-repo",
        store,
      });

      const label = yield* database.upsertLabel("linear-metadata-repo", {
        color: "red",
        description: "Customer-facing defects",
        name: "Customer Bug",
      });
      const updatedLabel = yield* database.upsertLabel("linear-metadata-repo", {
        color: "orange",
        id: label.id,
        name: "Customer Bug",
      });
      const view = yield* database.createView("linear-metadata-repo", {
        groupBy: "status",
        kind: "board",
        name: "Open customer bugs",
        query: {
          labelIn: ["customer-bug"],
          statusIn: ["backlog", "todo"],
        },
      });
      const updatedView = yield* database.updateView("linear-metadata-repo", view.id, {
        pinned: true,
      });
      const template = yield* database.createTemplate("linear-metadata-repo", {
        bodyTemplate: "## Expected\n\n## Actual\n",
        defaults: {
          labels: ["customer-bug"],
          priority: "high",
        },
        kind: "bug",
        name: "Customer bug",
        titleTemplate: "[Bug] {{title}}",
      });
      const archivedTemplate = yield* database.archiveTemplate("linear-metadata-repo", template.id);
      const initiative = yield* database.createInitiative("linear-metadata-repo", {
        title: "Improve issue workflow",
        type: "epic",
      });
      const doneChild = yield* database.createTicket("linear-metadata-repo", {
        estimate: 3,
        parent: initiative.id,
        status: "done",
        title: "Finish shared metadata",
        type: "task",
      });
      yield* database.createTicket("linear-metadata-repo", {
        estimate: 2,
        parent: initiative.id,
        status: "todo",
        title: "Add desktop metadata controls",
        type: "task",
      });
      const initiativeUpdate = yield* database.addInitiativeUpdate(
        "linear-metadata-repo",
        initiative.id,
        {
          nextSteps: ["Wire desktop controls"],
          progressNote: "Backend projection is in place.",
          status: "on-track",
          summary: "Shared metadata landed",
        },
      );
      const progress = yield* database.initiativeProgress("linear-metadata-repo", initiative.id);
      const labels = yield* database.listLabels("linear-metadata-repo", {
        archived: false,
      });
      const firstLabelPage = yield* database.listLabels("linear-metadata-repo", {
        limit: 1,
      });
      const invalidCursorLabelPage = yield* database.listLabels("linear-metadata-repo", {
        cursor: Buffer.from(JSON.stringify({ offset: -1 }), "utf8").toString("base64url"),
        limit: 1,
      });
      const views = yield* database.listViews("linear-metadata-repo", {
        pinned: true,
      });
      const archivedTemplates = yield* database.listTemplates("linear-metadata-repo", {
        active: false,
        kind: "bug",
      });
      const records = yield* database.ticketRecords("linear-metadata-repo", initiative.id, {
        recordType: "initiative-update",
      });
      const events = yield* listEvents(store);

      assert.strictEqual(updatedLabel.color, "orange");
      assert.strictEqual(updatedView.pinned, true);
      assert.strictEqual(archivedTemplate.active, false);
      assert.strictEqual(initiative.type, "epic");
      assert.strictEqual(doneChild.parent, initiative.id);
      assert.strictEqual(initiativeUpdate.recordType, "initiative-update");
      assert.ok(labels.entries.some((entry) => entry.id === label.id));
      assert.ok(labels.entries.some((entry) => entry.id === "bug"));
      assert.deepStrictEqual(
        invalidCursorLabelPage.entries.map((entry) => entry.id),
        firstLabelPage.entries.map((entry) => entry.id),
      );
      assert.ok(views.entries.some((entry) => entry.id === view.id));
      assert.ok(views.entries.some((entry) => entry.id === "triage"));
      assert.deepStrictEqual(
        archivedTemplates.entries.map((entry) => entry.id),
        [template.id],
      );
      assert.deepStrictEqual(progress, {
        completedEstimate: 3,
        completedIssues: 1,
        estimateTotal: 5,
        issueTotal: 2,
        statusCounts: {
          done: 1,
          todo: 1,
        },
      });
      assert.deepStrictEqual(
        records.entries.map((record) => record.id),
        [initiativeUpdate.id],
      );
      assert.ok(
        events.some((event) => event.aggregateType === "label" && event.aggregateId === label.id),
      );
      assert.ok(
        events.some((event) => event.aggregateType === "view" && event.aggregateId === view.id),
      );
      assert.ok(
        events.some(
          (event) => event.aggregateType === "template" && event.aggregateId === template.id,
        ),
      );
    }).pipe(Effect.provide(DatabaseTest())),
  );

  it.effect("rejects unsafe secret-bearing write payloads before committing", () =>
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* makeStore("validation-repo");

      yield* database.openRepository({
        repositoryId: "validation-repo",
        store,
      });

      const ticket = yield* database.createTicket("validation-repo", {
        title: "Safe ticket",
        type: "task",
      });
      const failure = yield* Effect.flip(
        database.addRecord("validation-repo", ticket.id, {
          payload: {
            token: "do-not-store",
          },
          recordType: "comment",
        }),
      );

      assert.ok(failure instanceof ValidationError);
      assert.match(failure.message, /unsafe secret-bearing field/u);
    }).pipe(Effect.provide(DatabaseTest())),
  );
});
