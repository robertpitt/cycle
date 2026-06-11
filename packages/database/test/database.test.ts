import { GitDbInMemory, Store as GitDbStore } from "@cycle/git-db";
import { Effect } from "effect";
import { DatabaseService, DatabaseTest, ValidationError } from "../src/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const makeStore = (database: string) =>
  Effect.gen(function* () {
    return yield* GitDbStore.StoreService;
  }).pipe(Effect.provide(GitDbInMemory({ database })));

describe("@cycle/database", () => {
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
        });
        const ticketB = yield* database.createTicket("repo-b", {
          labels: ["frontend"],
          priority: "medium",
          title: "Polish issue sidebar",
        });
        const fetchedA = yield* database.getTicket("repo-a", ticketA.id);
        const repoAHigh = yield* database.listTickets({
          priority: "high",
          repositoryIds: ["repo-a"],
        });
        const allBacklog = yield* database.listTickets({
          status: "backlog",
        });

        assert.strictEqual(ticketA.id, "iss_test_0001");
        assert.strictEqual(ticketB.id, "iss_test_0002");
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
      });
      const target = yield* database.createTicket("metadata-repo", {
        title: "Dependency ticket",
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
          (entry) =>
            entry.message === 'Test User updated the status of "History ticket" to Todo',
        ),
      );
      assert.ok(repositoryHistory.entries.every((entry) => !entry.message?.includes(ticket.id)));
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
        });
        const tx = yield* store.begin();

        yield* tx.put("collections/issues/aa/broken-ticket.md", "this is not issue markdown");
        yield* tx.commit({
          message: "Add broken issue document",
        });

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
      });
      const beforeRemoval = yield* database.listTickets({
        repositoryIds: ["removed-pointer-repo"],
      });
      const pointer = yield* store.pointer("main");

      yield* pointer.delete();

      const status = yield* database.syncRepository("removed-pointer-repo");
      const afterRemoval = yield* database.listTickets({
        repositoryIds: ["removed-pointer-repo"],
      });
      const search = yield* database.searchTickets({
        repositoryIds: ["removed-pointer-repo"],
        text: "disappear",
      });
      const history = yield* database.repositoryHistory("removed-pointer-repo");
      const fetched = yield* database.getTicket("removed-pointer-repo", ticket.id);

      assert.deepStrictEqual(
        beforeRemoval.entries.map((entry) => entry.id),
        [ticket.id],
      );
      assert.strictEqual(status.status, "empty");
      assert.strictEqual(status.activeSnapshotId, null);
      assert.deepStrictEqual(afterRemoval.entries, []);
      assert.deepStrictEqual(search.entries, []);
      assert.deepStrictEqual(history.entries, []);
      assert.strictEqual(fetched, null);
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
