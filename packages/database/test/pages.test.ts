import { PagePath, PagePathConflict, PageRevisionConflict } from "@cycle/contracts/schemas";
import { Document } from "@cycle/git-store/document";
import { withTestIdentity } from "@cycle/git-store/testing";
import { Effect, Schema } from "effect";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DatabaseService,
  makeGitRepositoryStoreEffect,
  type RepositoryStoreShape,
} from "../src/index.ts";
import { DatabaseTest } from "../src/testing/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const pagePath = Schema.decodeUnknownSync(PagePath);

const makeStore = (database: string) =>
  Effect.gen(function* () {
    const cwd = yield* Effect.sync(() => {
      const directory = mkdtempSync(path.join(tmpdir(), "cycle-pages-test-"));
      execFileSync("git", ["init", "--initial-branch=main"], {
        cwd: directory,
        stdio: "ignore",
      });
      return directory;
    });

    return yield* makeGitRepositoryStoreEffect(withTestIdentity({ cwd, database }));
  });

const collectPaths = (
  store: RepositoryStoreShape,
  root = "",
): Effect.Effect<ReadonlyArray<string>, unknown> =>
  Effect.gen(function* () {
    const paths: Array<string> = [];
    for (const entry of yield* store.list(root)) {
      if (entry.type === "tree") paths.push(...(yield* collectPaths(store, entry.path)));
      else paths.push(entry.path);
    }
    return paths.sort();
  });

describe("@cycle/database Pages", () => {
  it.effect("persists Page lifecycle, hierarchy, revisions, and generic comments through events", () =>
    Effect.gen(function* () {
      const repositoryId = "pages-lifecycle";
      const database = yield* DatabaseService;
      const store = yield* makeStore(repositoryId);
      yield* database.openRepository({ repositoryId, store });

      const root = yield* database.createPage(repositoryId, {
        body: "# Home\n",
        frontmatterExtensions: { audience: "team" },
        path: pagePath("index.md"),
        title: "Home",
      });
      const cover = yield* database.createPage(repositoryId, {
        body: "# Payments\n",
        path: pagePath("payments/index.md"),
        title: "Payments",
      });
      const child = yield* database.createPage(repositoryId, {
        body: "Old body",
        path: pagePath("payments/refunds.md"),
        title: "Refunds",
      });
      const originalRevision = child.revisionId;
      const updated = yield* database.updatePage(repositoryId, child.id, {
        body: "New body",
        expectedRevisionId: child.revisionId,
        frontmatterExtensionPatch: { owner: "platform" },
        pageId: child.id,
        path: pagePath("payments/providers/stripe.md"),
        title: "Stripe",
      });

      assert.notStrictEqual(updated.revisionId, originalRevision);
      assert.strictEqual(updated.frontmatter.audience, undefined);
      assert.strictEqual(updated.frontmatter.owner, "platform");

      const conflict = yield* Effect.flip(
        database.updatePage(repositoryId, child.id, {
          body: "stale",
          expectedRevisionId: originalRevision,
          pageId: child.id,
        }),
      );
      assert.ok(conflict instanceof PageRevisionConflict);

      const beforeCommentRevision = updated.revisionId;
      const target = {
        repositoryId,
        resourceId: child.id,
        resourceKind: "page" as const,
      };
      const comment = yield* database.addComment(target, {
        body: "Looks good.",
        target,
      });
      const afterComment = yield* database.getPage(repositoryId, child.id);
      const comments = yield* database.listComments(target);

      assert.strictEqual(afterComment.revisionId, beforeCommentRevision);
      assert.deepStrictEqual(comments.entries.map((entry) => entry.id), [comment.id]);

      const hierarchy = yield* database.listPageHierarchy(repositoryId);
      const payments = hierarchy.root.directories.find((directory) => directory.name === "payments");
      const providers = payments?.directories.find((directory) => directory.name === "providers");
      assert.strictEqual(hierarchy.root.cover?.id, root.id);
      assert.strictEqual(payments?.cover?.id, cover.id);
      assert.deepStrictEqual(providers?.pages.map((page) => page.id), [child.id]);

      const revision = yield* database.pageRevision(repositoryId, child.id, originalRevision);
      const history = yield* database.pageHistory(repositoryId, child.id, {
        pageId: child.id,
      });
      assert.strictEqual(revision.body, "Old body");
      assert.deepStrictEqual(
        history.entries.map((entry) => entry.operation).sort(),
        ["page.create", "page.replace"].sort(),
      );

      const archived = yield* database.archivePage(repositoryId, child.id, {
        expectedRevisionId: updated.revisionId,
        pageId: child.id,
      });
      assert.ok(archived.frontmatter.archivedAt);
      assert.deepStrictEqual((yield* database.listPages(repositoryId, { recursive: true })).entries.map((page) => page.id).sort(), [cover.id, root.id].sort());
      yield* database.addComment(target, { body: "Archived note", target });

      const pathConflict = yield* Effect.flip(
        database.createPage(repositoryId, {
          body: "",
          path: archived.path,
          title: "Cannot reuse",
        }),
      );
      assert.ok(pathConflict instanceof PagePathConflict);

      const restored = yield* database.restorePage(repositoryId, child.id, {
        expectedRevisionId: archived.revisionId,
        pageId: child.id,
      });
      assert.strictEqual(restored.frontmatter.archivedAt, undefined);

      const paths = yield* collectPaths(store);
      assert.ok(
        paths.some((eventPath) =>
          new RegExp(`^collections/events/page/[0-9a-f]{2}/${child.id}/evt_`).test(eventPath),
        ),
      );
      assert.ok(paths.every((eventPath) => eventPath.startsWith("collections/events/")));
    }).pipe(Effect.provide(DatabaseTest("pages-lifecycle"))),
  );

  it.effect("materializes legacy and canonical ticket comments through one generic read model", () =>
    Effect.gen(function* () {
      const repositoryId = "generic-ticket-comments";
      const database = yield* DatabaseService;
      const store = yield* makeStore(repositoryId);
      yield* database.openRepository({ repositoryId, store });
      const ticket = yield* database.createTicket(repositoryId, {
        title: "Commentable",
        type: "task",
      });
      const legacy = yield* database.addTicketComment(repositoryId, ticket.id, {
        body: "Legacy comment",
      });
      const target = {
        repositoryId,
        resourceId: ticket.id,
        resourceKind: "ticket" as const,
      };
      const canonical = yield* database.addComment(target, {
        body: "Canonical comment",
        target,
      });
      const comments = yield* database.listComments(target);
      const legacyRecords = yield* database.ticketComments(repositoryId, ticket.id);

      assert.deepStrictEqual(comments.entries.map((entry) => entry.id), [legacy.id, canonical.id]);
      assert.deepStrictEqual(legacyRecords.entries.map((entry) => entry.id), [legacy.id]);
    }).pipe(Effect.provide(DatabaseTest("generic-ticket-comments"))),
  );

  it.effect("warns on modified Page events while retaining the last valid Page state", () =>
    Effect.gen(function* () {
      const repositoryId = "page-append-only";
      const database = yield* DatabaseService;
      const store = yield* makeStore(repositoryId);
      yield* database.openRepository({ repositoryId, store });
      const page = yield* database.createPage(repositoryId, {
        body: "Valid body",
        path: pagePath("valid.md"),
        title: "Valid",
      });
      const pageEventPath = (yield* collectPaths(store)).find((eventPath) =>
        eventPath.includes(`/page/`) && eventPath.includes(`/${page.id}/`),
      );
      assert.ok(pageEventPath);

      yield* store.transaction({ message: "Tamper with Page event" }, (tx) =>
        tx.put(pageEventPath, Document.json({ op: "page.invalid" })),
      );
      const status = yield* database.syncRepository(repositoryId);
      const warnings = yield* database.materializationWarnings(repositoryId);
      const retained = yield* database.getPage(repositoryId, page.id);

      assert.strictEqual(status.status, "degraded");
      assert.ok(warnings.some((warning) => warning.reason === "event-modified"));
      assert.strictEqual(retained.body, "Valid body");
    }).pipe(Effect.provide(DatabaseTest("page-append-only"))),
  );
});
