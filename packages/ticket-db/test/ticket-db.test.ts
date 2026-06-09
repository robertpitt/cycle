import { Effect, Layer } from "effect";
import { GitDbInMemory, PointerConflictError, Store as GitDbStore } from "@cycle/git-db";
import {
  PlanImmutabilityError,
  StorageConflictError,
  TicketDbInMemory,
  TicketDbLive,
  TicketDbService,
  TicketIdentityTest,
  TicketIdGeneratorDeterministic,
  ValidationError,
  WorkflowError,
  WorkflowPolicyDefault,
  storageConflict,
} from "../src/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

describe("@cycle/ticket-db", () => {
  it.effect("creates issues with required frontmatter, linked records, and indexes", () =>
    Effect.gen(function* () {
      const ticketDb = yield* TicketDbService;

      const issue = yield* ticketDb.createIssue({
        assignee: "Robert Pitt",
        labels: ["Bug", "CLI"],
        priority: "high",
        title: "Fix parser drift",
      });
      const fetched = yield* ticketDb.getIssue(issue.id);
      const open = yield* ticketDb.listIssues({ status: "backlog" });
      const label = yield* ticketDb.listIssues({ label: "cli" });
      const records = yield* ticketDb.recordsForIssue(issue.id);

      assert.strictEqual(issue.id, "iss_test_0001");
      assert.strictEqual(issue.frontmatter.title, "Fix parser drift");
      assert.strictEqual(issue.status, "backlog");
      assert.strictEqual(issue.priority, "high");
      assert.strictEqual(issue.assignee, "robert-pitt");
      assert.deepStrictEqual(issue.labels, ["bug", "cli"]);
      assert.deepStrictEqual(fetched, issue);
      assert.deepStrictEqual(
        open.entries.map((entry) => entry.id),
        [issue.id],
      );
      assert.deepStrictEqual(
        label.entries.map((entry) => entry.id),
        [issue.id],
      );
      assert.deepStrictEqual(records.map((record) => record.recordType).sort(), [
        "provenance",
        "status-change",
      ]);
    }).pipe(Effect.provide(TicketDbInMemory())),
  );

  it.effect("updates issues while preserving unknown frontmatter fields", () =>
    Effect.gen(function* () {
      const ticketDb = yield* TicketDbService;
      const issue = yield* ticketDb.createIssue({
        title: "Preserve extension fields",
      });

      const updated = yield* ticketDb.updateIssue(issue.id, {
        frontmatter: {
          customField: {
            owner: "tools",
          },
          title: "Updated title",
        },
      });

      assert.strictEqual(updated.frontmatter.title, "Updated title");
      assert.deepStrictEqual(updated.frontmatter.customField, {
        owner: "tools",
      });
      assert.strictEqual(updated.frontmatter.id, issue.id);
      assert.strictEqual(updated.frontmatter.createdAt, issue.frontmatter.createdAt);
    }).pipe(Effect.provide(TicketDbInMemory())),
  );

  it.effect("enforces default workflow transitions and human final approval", () =>
    Effect.gen(function* () {
      const humanDb = yield* TicketDbService;
      const issue = yield* humanDb.createIssue({
        title: "Implement workflow",
      });
      const ready = yield* humanDb.transitionIssue({
        id: issue.id,
        status: "ready",
      });
      const progress = yield* humanDb.transitionIssue({
        id: issue.id,
        status: "in-progress",
      });
      const review = yield* humanDb.transitionIssue({
        id: issue.id,
        status: "in-review",
      });
      const done = yield* humanDb.transitionIssue({
        id: issue.id,
        status: "done",
      });

      assert.strictEqual(ready.status, "ready");
      assert.strictEqual(progress.status, "in-progress");
      assert.strictEqual(review.status, "in-review");
      assert.strictEqual(done.status, "done");
    }).pipe(Effect.provide(TicketDbInMemory())),
  );

  it.effect("rejects non-human final approval", () =>
    Effect.gen(function* () {
      const ticketDb = yield* TicketDbService;
      const issue = yield* ticketDb.createIssue({
        title: "Agent cannot approve done",
      });
      yield* ticketDb.transitionIssue({ id: issue.id, status: "ready" });
      yield* ticketDb.transitionIssue({ id: issue.id, status: "in-progress" });
      yield* ticketDb.transitionIssue({ id: issue.id, status: "in-review" });

      const failure = yield* Effect.flip(
        ticketDb.transitionIssue({ id: issue.id, status: "done" }),
      );

      assert.ok(failure instanceof WorkflowError);
      assert.match(failure.message, /Only a human actor/u);
    }).pipe(
      Effect.provide(
        TicketDbLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              GitDbInMemory({
                database: "cycle",
              }),
              TicketIdentityTest({
                email: "agent@example.invalid",
                name: "Test Agent",
                provider: "codex",
                type: "agent",
              }),
              TicketIdGeneratorDeterministic(),
              WorkflowPolicyDefault,
            ),
          ),
        ),
      ),
    ),
  );

  it.effect("rejects protected plan edits during active implementation", () =>
    Effect.gen(function* () {
      const ticketDb = yield* TicketDbService;
      const issue = yield* ticketDb.createIssue({
        title: "Protect plan",
      });
      yield* ticketDb.transitionIssue({ id: issue.id, status: "ready" });
      yield* ticketDb.transitionIssue({ id: issue.id, status: "in-progress" });

      const failure = yield* Effect.flip(
        ticketDb.updateIssue(issue.id, {
          body: issue.body.replace(
            "- Outline the implementation steps.",
            "- Do something completely different.",
          ),
        }),
      );

      assert.ok(failure instanceof PlanImmutabilityError);
      assert.deepStrictEqual(failure.sections, ["Implementation Plan"]);
    }).pipe(Effect.provide(TicketDbInMemory())),
  );

  it.effect("creates, updates, and commits durable draft sessions", () =>
    Effect.gen(function* () {
      const ticketDb = yield* TicketDbService;

      const draft = yield* ticketDb.createDraft({
        source: {
          request: "capture a failing report",
        },
        title: "Draft issue",
      });
      const updated = yield* ticketDb.updateDraft({
        draftId: draft.id,
        frontmatter: {
          title: "Committed issue",
        },
        status: "ready",
      });
      const issue = yield* ticketDb.commitDraft(draft.id);
      const fetched = yield* ticketDb.getIssue(issue.id);

      assert.strictEqual(draft.id, "drf_test_0001");
      assert.strictEqual(updated.status, "ready");
      assert.strictEqual(issue.frontmatter.title, "Committed issue");
      assert.deepStrictEqual(fetched, issue);
    }).pipe(Effect.provide(TicketDbInMemory())),
  );

  it.effect("adds linked records and updates issue activity timestamp", () =>
    Effect.gen(function* () {
      const ticketDb = yield* TicketDbService;
      const issue = yield* ticketDb.createIssue({
        title: "Record activity",
      });

      const comment = yield* ticketDb.addRecord({
        issueId: issue.id,
        payload: {
          body: "Looks good",
        },
        recordType: "comment",
      });
      const records = yield* ticketDb.recordsForIssue(issue.id, {
        recordType: "comment",
      });
      const updated = yield* ticketDb.getIssue(issue.id);

      assert.strictEqual(comment.id, `${issue.id}_comment_rec_test_0003`);
      assert.deepStrictEqual(records, [comment]);
      assert.ok(updated !== null);
      assert.ok(updated.frontmatter.updatedAt >= issue.frontmatter.updatedAt);
    }).pipe(Effect.provide(TicketDbInMemory())),
  );

  it.effect("exposes issue history from GitDB snapshots", () =>
    Effect.gen(function* () {
      const ticketDb = yield* TicketDbService;
      const issue = yield* ticketDb.createIssue({
        title: "Track history",
      });
      yield* ticketDb.updateIssue(issue.id, {
        frontmatter: {
          title: "Track edited history",
        },
      });

      const history = yield* ticketDb.issueHistory(issue.id);

      assert.strictEqual(history.issueId, issue.id);
      assert.ok(history.entries.length >= 2);
      assert.strictEqual(history.entries[0]?.issue?.frontmatter.title, "Track edited history");
      assert.strictEqual(history.entries[1]?.issue?.frontmatter.title, "Track history");
    }).pipe(Effect.provide(TicketDbInMemory())),
  );

  it.effect("maps GitDB pointer conflicts into TicketDB storage conflicts", () =>
    Effect.gen(function* () {
      const store = yield* GitDbStore.StoreService;
      const first = yield* store.begin();
      const second = yield* store.begin();
      const firstIssues = yield* first.collection("issues");
      const secondIssues = yield* second.collection("issues");

      yield* firstIssues.put("iss_conflict_0001", { status: "backlog" });
      yield* secondIssues.put("iss_conflict_0002", { status: "backlog" });
      yield* first.commit({ message: "first" });

      const raw = yield* Effect.flip(second.commit({ message: "second" }));
      const mapped =
        raw instanceof PointerConflictError
          ? storageConflict({
              actual: raw.actual,
              cause: raw,
              expected: raw.expected,
              operation: "test",
              pointer: raw.pointer,
            })
          : raw;

      assert.ok(mapped instanceof StorageConflictError);
      assert.strictEqual(mapped.pointer, "main");
      assert.strictEqual(mapped.expected, null);
      assert.ok(mapped.actual !== null);
    }).pipe(
      Effect.provide(
        GitDbInMemory({
          database: "cycle",
        }),
      ),
    ),
  );

  it.effect("rejects unsafe secret-bearing payload keys", () =>
    Effect.gen(function* () {
      const ticketDb = yield* TicketDbService;

      const failure = yield* Effect.flip(
        ticketDb.createIssue({
          title: "Unsafe issue",
          // This models structured agent provenance accidentally carrying a secret.
          agentToken: "should-not-persist",
        } as never),
      );

      assert.ok(failure instanceof ValidationError);
      assert.match(failure.message, /unsafe secret-bearing field/u);
    }).pipe(Effect.provide(TicketDbInMemory())),
  );
});
