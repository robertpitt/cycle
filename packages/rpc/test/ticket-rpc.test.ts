import { strict as assert } from "node:assert";
import {
  DatabaseService,
  DatabaseTest,
  type HistoryPage,
  type RepositoryStatus,
  type TicketDraftDocument,
  type TicketDocument,
  type TicketPage,
  type TicketRevisionDiff,
  type TicketSearchPage,
} from "@cycle/database";
import { GitDbInMemory, Store as GitDbStore } from "@cycle/git-db";
import { Effect, Layer } from "effect";
import {
  makeTicketRpcClient,
  TicketRpcLive,
  TicketRpcService,
  type TicketRpcRequest,
} from "../src/index.ts";
import { describe, it } from "vitest";

const repository = { id: "test-repository" };

const TestLayer = TicketRpcLive.pipe(Layer.provideMerge(DatabaseTest()));

const runRpc = <A>(effect: Effect.Effect<A, never, DatabaseService | TicketRpcService>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const store = yield* Effect.gen(function* () {
        return yield* GitDbStore.StoreService;
      }).pipe(
        Effect.provide(
          GitDbInMemory({
            database: "cycle",
          }),
        ),
      );

      yield* database.openRepository({
        pollIntervalMs: false,
        repositoryId: repository.id,
        store,
      });

      return yield* effect;
    }).pipe(Effect.provide(TestLayer)),
  );

describe("@cycle/rpc", () => {
  it("handles create/get/list issue requests", async () => {
    const result = await runRpc(
      Effect.gen(function* () {
        const rpc = yield* TicketRpcService;

        const created = yield* rpc.handle({
          id: "create-1",
          method: "ticket.issue.create",
          payload: {
            input: {
              body: "Initial body",
              title: "Build the RPC package",
            },
            repository,
          },
        } satisfies TicketRpcRequest);

        assert.equal(created.ok, true);
        if (!created.ok) return created;

        const createdIssue = created.value as TicketDocument;

        const listed = yield* rpc.handle({
          id: "list-1",
          method: "ticket.issue.list",
          payload: {
            input: {},
            repository,
          },
        } satisfies TicketRpcRequest);

        const fetched = yield* rpc.handle({
          id: "get-1",
          method: "ticket.issue.get",
          payload: {
            input: { id: createdIssue.id },
            repository,
          },
        } satisfies TicketRpcRequest);

        return { created, fetched, listed };
      }),
    );

    assert.equal(result.created.ok, true);
    const createdIssue = result.created.value as TicketDocument;
    assert.equal(createdIssue.frontmatter.title, "Build the RPC package");
    assert.equal(result.listed.ok, true);
    const issuePage = result.listed.value as TicketPage;
    assert.equal(issuePage.entries.length, 1);
    assert.equal(result.fetched.ok, true);
    const fetchedIssue = result.fetched.value as TicketDocument | null;
    assert.equal(fetchedIssue?.id, createdIssue.id);
  });

  it("returns a failure response for invalid payloads", async () => {
    const response = await runRpc(
      Effect.gen(function* () {
        const rpc = yield* TicketRpcService;

        return yield* rpc.handle({
          id: "invalid-create",
          method: "ticket.issue.create",
          payload: {
            input: {
              body: "Missing required title",
            },
            repository,
          },
        });
      }),
    );

    assert.equal(response.ok, false);
    if (response.ok) return;

    assert.equal(response.id, "invalid-create");
    assert.equal(response.error.code, "INVALID_RPC_REQUEST");
  });

  it("supports durable draft create, update, and commit", async () => {
    const result = await runRpc(
      Effect.gen(function* () {
        const rpc = yield* TicketRpcService;

        const created = yield* rpc.handle({
          id: "draft-create",
          method: "ticket.draft.create",
          payload: {
            input: {
              body: "Draft body",
              title: "Draft title",
            },
            repository,
          },
        } satisfies TicketRpcRequest);

        assert.equal(created.ok, true);
        if (!created.ok) return { created };

        const draft = created.value as TicketDraftDocument;
        const updated = yield* rpc.handle({
          id: "draft-update",
          method: "ticket.draft.update",
          payload: {
            input: {
              body: "Committed body",
              draftId: draft.id,
              frontmatter: {
                title: "Committed title",
              },
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const committed = yield* rpc.handle({
          id: "draft-commit",
          method: "ticket.draft.commit",
          payload: {
            input: draft.id,
            repository,
          },
        } satisfies TicketRpcRequest);

        return { committed, created, updated };
      }),
    );

    assert.equal(result.created.ok, true);
    assert.equal(result.updated?.ok, true);
    assert.equal(result.committed?.ok, true);

    const committed = result.committed?.ok ? (result.committed.value as TicketDocument) : null;
    assert.equal(committed?.frontmatter.title, "Committed title");
    assert.equal(committed?.body, "Committed body");
  });

  it("handles repository status, search, relations, soft state, revisions, and diffs", async () => {
    const result = await runRpc(
      Effect.gen(function* () {
        const rpc = yield* TicketRpcService;

        const status = yield* rpc.handle({
          id: "status-get",
          method: "repository.status.get",
          payload: {
            input: {},
            repository,
          },
        } satisfies TicketRpcRequest);
        const statusList = yield* rpc.handle({
          id: "status-list",
          method: "repository.status.list",
          payload: {},
        } satisfies TicketRpcRequest);

        const created = yield* rpc.handle({
          id: "create-source",
          method: "ticket.issue.create",
          payload: {
            input: {
              body: "Searchable material",
              dueDate: "2026-07-01",
              estimate: 5,
              title: "Source issue",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const target = yield* rpc.handle({
          id: "create-target",
          method: "ticket.issue.create",
          payload: {
            input: {
              title: "Target issue",
            },
            repository,
          },
        } satisfies TicketRpcRequest);

        assert.equal(created.ok, true);
        assert.equal(target.ok, true);
        if (!created.ok || !target.ok) return { created, status, statusList, target };

        const sourceIssue = created.value as TicketDocument;
        const targetIssue = target.value as TicketDocument;

        const relation = yield* rpc.handle({
          id: "relation-add",
          method: "ticket.issue.relation.add",
          payload: {
            input: {
              id: sourceIssue.id,
              relation: {
                issueId: targetIssue.id,
                type: "blocking",
              },
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const search = yield* rpc.handle({
          id: "search",
          method: "ticket.issue.search",
          payload: {
            input: {
              text: "material",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const updated = yield* rpc.handle({
          id: "update-source",
          method: "ticket.issue.update",
          payload: {
            input: {
              id: sourceIssue.id,
              patch: {
                body: "Updated searchable material",
              },
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const history = yield* rpc.handle({
          id: "history",
          method: "ticket.issue.history",
          payload: {
            input: {
              id: sourceIssue.id,
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const repositoryHistory = yield* rpc.handle({
          id: "repository-history",
          method: "repository.history.list",
          payload: {
            input: {
              limit: 10,
            },
            repository,
          },
        } satisfies TicketRpcRequest);

        assert.equal(history.ok, true);
        assert.equal(repositoryHistory.ok, true);
        if (!history.ok)
          return {
            created,
            history,
            relation,
            repositoryHistory,
            search,
            sourceIssueId: sourceIssue.id,
            status,
            statusList,
            target,
            updated,
          };

        const ordered = (history.value as HistoryPage).entries
          .slice()
          .sort((a, b) => a.sequence - b.sequence);
        const diff = yield* rpc.handle({
          id: "diff",
          method: "ticket.issue.diff",
          payload: {
            input: {
              fromSnapshotId: ordered[0]?.snapshotId ?? "",
              id: sourceIssue.id,
              toSnapshotId: ordered.at(-1)?.snapshotId ?? "",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const revision = yield* rpc.handle({
          id: "revision",
          method: "ticket.issue.revision.get",
          payload: {
            input: {
              id: sourceIssue.id,
              snapshotId: ordered[0]?.snapshotId ?? "",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const archived = yield* rpc.handle({
          id: "archive",
          method: "ticket.issue.archive",
          payload: {
            input: {
              id: sourceIssue.id,
              reason: "test archive",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const restored = yield* rpc.handle({
          id: "restore",
          method: "ticket.issue.restore",
          payload: {
            input: {
              id: sourceIssue.id,
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const warnings = yield* rpc.handle({
          id: "warnings",
          method: "repository.materializationWarnings",
          payload: {
            input: {},
            repository,
          },
        } satisfies TicketRpcRequest);
        const synced = yield* rpc.handle({
          id: "sync",
          method: "repository.sync",
          payload: {
            input: {},
            repository,
          },
        } satisfies TicketRpcRequest);

        return {
          archived,
          created,
          diff,
          history,
          relation,
          repositoryHistory,
          restored,
          revision,
          search,
          sourceIssueId: sourceIssue.id,
          status,
          statusList,
          synced,
          target,
          updated,
          warnings,
        };
      }),
    );

    assert.equal(result.status.ok, true);
    assert.equal((result.status.value as RepositoryStatus).repositoryId, repository.id);
    assert.equal(result.statusList.ok, true);
    assert.equal(result.repositoryHistory?.ok, true);
    const sourceIssueId = "sourceIssueId" in result ? result.sourceIssueId : undefined;
    assert.ok(sourceIssueId);
    assert.ok(
      ((result.repositoryHistory?.ok
        ? result.repositoryHistory.value
        : { entries: [] }) as HistoryPage).entries.some((entry) =>
        entry.changedTicketIds.includes(sourceIssueId),
      ),
    );
    assert.equal(result.relation?.ok, true);
    assert.equal(result.search?.ok, true);
    assert.deepStrictEqual(
      ((result.search?.ok ? result.search.value : { entries: [] }) as TicketSearchPage).entries.map(
        (entry) => entry.matchedFields,
      ),
      [["body"]],
    );
    assert.equal(result.diff?.ok, true);
    assert.equal(
      ((result.diff?.ok ? result.diff.value : null) as TicketRevisionDiff | null)?.files[0]
        ?.newContent,
      "Updated searchable material",
    );
    assert.equal(result.revision?.ok, true);
    assert.equal(result.archived?.ok, true);
    assert.equal(result.restored?.ok, true);
    assert.equal(result.warnings?.ok, true);
    assert.equal(result.synced?.ok, true);
  });

  it("builds a typed promise client over any transport", async () => {
    const client = makeTicketRpcClient({
      invoke: (request) =>
        runRpc(
          Effect.gen(function* () {
            const rpc = yield* TicketRpcService;
            return yield* rpc.handle(request);
          }),
        ),
    });

    const created = await client.call("ticket.issue.create", {
      input: {
        title: "Use the typed client",
      },
      repository,
    });

    assert.equal(created.frontmatter.title, "Use the typed client");
  });
});
