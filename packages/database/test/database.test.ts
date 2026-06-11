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
          (entry) => entry.message === 'Test User updated the status of "History ticket" to Todo',
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
      });

      const users = yield* store.collection<{
        readonly displayName: string;
        readonly email: string;
        readonly id: string;
      }>("users");
      const sourceProfile = yield* users.get("test@example.invalid");
      const projectedProfile = yield* database.getUser("users-repo", "test@example.invalid");
      const userList = yield* database.listUsers("users-repo", {
        text: "test",
      });

      assert.strictEqual(sourceProfile?.id, "test@example.invalid");
      assert.strictEqual(sourceProfile?.displayName, "Test User");
      assert.strictEqual(projectedProfile?.email, "test@example.invalid");
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
      });
      const doneChild = yield* database.createTicket("linear-metadata-repo", {
        estimate: 3,
        parent: initiative.id,
        status: "done",
        title: "Finish shared metadata",
      });
      yield* database.createTicket("linear-metadata-repo", {
        estimate: 2,
        parent: initiative.id,
        status: "todo",
        title: "Add desktop metadata controls",
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
      const sourceLabels = yield* store.collection<{
        readonly color: string;
        readonly name: string;
      }>("labels");
      const sourceViews = yield* store.collection<{
        readonly name: string;
        readonly pinned: boolean;
      }>("views");
      const sourceTemplates = yield* store.collection<{
        readonly active: boolean;
        readonly name: string;
      }>("templates");

      assert.strictEqual(updatedLabel.color, "orange");
      assert.strictEqual(updatedView.pinned, true);
      assert.strictEqual(archivedTemplate.active, false);
      assert.strictEqual(initiative.type, "initiative");
      assert.strictEqual(doneChild.parent, initiative.id);
      assert.strictEqual(initiativeUpdate.recordType, "initiative-update");
      assert.ok(labels.entries.some((entry) => entry.id === label.id));
      assert.ok(labels.entries.some((entry) => entry.id === "bug"));
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
      assert.strictEqual((yield* sourceLabels.get(label.id))?.color, "orange");
      assert.strictEqual((yield* sourceViews.get(view.id))?.pinned, true);
      assert.strictEqual((yield* sourceTemplates.get(template.id))?.active, false);
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
