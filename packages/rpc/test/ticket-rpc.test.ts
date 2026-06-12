import { strict as assert } from "node:assert";
import {
  DatabaseService,
  DatabaseTest,
  type HistoryPage,
  type InitiativeProgress,
  type IssueTemplateDocument,
  type IssueTemplatePage,
  type LabelDefinitionDocument,
  type LabelDefinitionPage,
  type LinkedRecord,
  type RepositoryStatus,
  type SavedViewDocument,
  type SavedViewPage,
  type TicketDraftDocument,
  type TicketDocument,
  type TicketPage,
  type TicketRevisionDiff,
  type TicketSearchPage,
  type UserProfileDocument,
  type UserProfilePage,
} from "@cycle/database";
import { GitDbInMemory, Store as GitDbStore } from "@cycle/git-db";
import { UseCaseRunner, UseCaseRunnerLive, type UseCaseRunnerShape } from "@cycle/usecases";
import { Effect, Layer } from "effect";
import {
  makeTicketRpcClient,
  makeTicketRpcService,
  TicketRpcLive,
  TicketRpcService,
  type TicketRpcRequest,
} from "../src/index.ts";
import { describe, it } from "vitest";

const repository = { id: "test-repository" };

const UseCaseTestLayer = UseCaseRunnerLive.pipe(Layer.provideMerge(DatabaseTest()));
const TestLayer = TicketRpcLive.pipe(Layer.provideMerge(UseCaseTestLayer));

const runRpc = <A>(
  effect: Effect.Effect<A, never, DatabaseService | TicketRpcService | UseCaseRunner>,
) =>
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

  it("lists issues across requested repository ids", async () => {
    const secondRepository = { id: "second-repository" };
    const result = await runRpc(
      Effect.gen(function* () {
        const database = yield* DatabaseService;
        const rpc = yield* TicketRpcService;
        const secondStore = yield* Effect.gen(function* () {
          return yield* GitDbStore.StoreService;
        }).pipe(
          Effect.provide(
            GitDbInMemory({
              database: "cycle-second",
            }),
          ),
          Effect.orDie,
        );

        yield* database
          .openRepository({
            pollIntervalMs: false,
            repositoryId: secondRepository.id,
            store: secondStore,
          })
          .pipe(Effect.orDie);

        const firstCreated = yield* rpc.handle({
          id: "create-first-repository",
          method: "ticket.issue.create",
          payload: {
            input: {
              body: "First repository body",
              repository: repository.id,
              title: "First repository issue",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const secondCreated = yield* rpc.handle({
          id: "create-second-repository",
          method: "ticket.issue.create",
          payload: {
            input: {
              body: "Second repository body",
              repository: secondRepository.id,
              title: "Second repository issue",
            },
            repository: secondRepository,
          },
        } satisfies TicketRpcRequest);
        const scopedList = yield* rpc.handle({
          id: "list-first-only",
          method: "ticket.issue.list",
          payload: {
            input: {},
            repository,
          },
        } satisfies TicketRpcRequest);
        const globalList = yield* rpc.handle({
          id: "list-all-requested",
          method: "ticket.issue.list",
          payload: {
            input: {
              repositoryIds: [repository.id, secondRepository.id],
            },
            repository,
          },
        } satisfies TicketRpcRequest);

        return { firstCreated, globalList, scopedList, secondCreated };
      }),
    );

    assert.equal(result.firstCreated.ok, true);
    assert.equal(result.secondCreated.ok, true);
    assert.equal(result.scopedList.ok, true);
    assert.equal(result.globalList.ok, true);

    const scopedPage = result.scopedList.value as TicketPage;
    const globalPage = result.globalList.value as TicketPage;

    assert.deepEqual(
      scopedPage.entries.map((issue) => issue.frontmatter.title),
      ["First repository issue"],
    );
    assert.deepEqual(globalPage.entries.map((issue) => issue.frontmatter.title).sort(), [
      "First repository issue",
      "Second repository issue",
    ]);
    assert.deepEqual(
      globalPage.entries.map((issue) => issue.repositoryId).sort(),
      [repository.id, secondRepository.id].sort(),
    );
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

  it("returns a defect failure response when execution dies", async () => {
    const rpc = makeTicketRpcService({
      run: () => Effect.die(new Error("runner defect")),
    } as UseCaseRunnerShape);

    const response = await Effect.runPromise(
      rpc.handle({
        id: "defect-list",
        method: "ticket.issue.list",
        payload: {
          input: {},
          repository,
        },
      } satisfies TicketRpcRequest),
    );

    assert.equal(response.ok, false);
    if (response.ok) return;

    assert.equal(response.id, "defect-list");
    assert.equal(response.error.code, "RPC_EXECUTION_DEFECT");
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
      (
        (result.repositoryHistory?.ok
          ? result.repositoryHistory.value
          : { entries: [] }) as HistoryPage
      ).entries.some((entry) => entry.changedTicketIds.includes(sourceIssueId)),
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

  it("handles shared metadata and initiative RPC requests", async () => {
    const result = await runRpc(
      Effect.gen(function* () {
        const rpc = yield* TicketRpcService;

        const user = yield* rpc.handle({
          id: "user-upsert",
          method: "ticket.user.upsert",
          payload: {
            input: {
              displayName: "Peer User",
              email: "peer@example.invalid",
              source: "manual",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const userList = yield* rpc.handle({
          id: "user-list",
          method: "ticket.user.list",
          payload: {
            input: {
              text: "peer",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const userGet = yield* rpc.handle({
          id: "user-get",
          method: "ticket.user.get",
          payload: {
            input: "peer@example.invalid",
            repository,
          },
        } satisfies TicketRpcRequest);
        const label = yield* rpc.handle({
          id: "label-upsert",
          method: "ticket.label.upsert",
          payload: {
            input: {
              color: "red",
              name: "Customer Bug",
            },
            repository,
          },
        } satisfies TicketRpcRequest);

        assert.equal(label.ok, true);
        if (!label.ok) return { label, user, userGet, userList };

        const labelDoc = label.value as LabelDefinitionDocument;
        const labels = yield* rpc.handle({
          id: "label-list",
          method: "ticket.label.list",
          payload: {
            input: {
              archived: false,
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const view = yield* rpc.handle({
          id: "view-create",
          method: "ticket.view.create",
          payload: {
            input: {
              groupBy: "status",
              kind: "board",
              name: "Open bugs",
              query: {
                labelIn: [labelDoc.id],
              },
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const template = yield* rpc.handle({
          id: "template-create",
          method: "ticket.template.create",
          payload: {
            input: {
              bodyTemplate: "## Expected\n\n## Actual\n",
              defaults: {
                labels: [labelDoc.id],
              },
              kind: "bug",
              name: "Bug report",
              titleTemplate: "[Bug] {{title}}",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const initiative = yield* rpc.handle({
          id: "initiative-create",
          method: "ticket.initiative.create",
          payload: {
            input: {
              title: "Linear-inspired workflow",
            },
            repository,
          },
        } satisfies TicketRpcRequest);

        assert.equal(view.ok, true);
        assert.equal(template.ok, true);
        assert.equal(initiative.ok, true);
        if (!view.ok || !template.ok || !initiative.ok)
          return { initiative, label, labels, template, user, userGet, userList, view };

        const viewDoc = view.value as SavedViewDocument;
        const templateDoc = template.value as IssueTemplateDocument;
        const initiativeIssue = initiative.value as TicketDocument;
        const viewUpdate = yield* rpc.handle({
          id: "view-update",
          method: "ticket.view.update",
          payload: {
            input: {
              id: viewDoc.id,
              patch: {
                pinned: true,
              },
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const viewList = yield* rpc.handle({
          id: "view-list",
          method: "ticket.view.list",
          payload: {
            input: {
              pinned: true,
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const templateArchive = yield* rpc.handle({
          id: "template-archive",
          method: "ticket.template.archive",
          payload: {
            input: {
              id: templateDoc.id,
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const templateList = yield* rpc.handle({
          id: "template-list",
          method: "ticket.template.list",
          payload: {
            input: {
              active: false,
              kind: "bug",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const child = yield* rpc.handle({
          id: "initiative-child",
          method: "ticket.issue.create",
          payload: {
            input: {
              estimate: 2,
              parent: initiativeIssue.id,
              status: "done",
              title: "Ship backend plumbing",
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const progress = yield* rpc.handle({
          id: "initiative-progress",
          method: "ticket.initiative.progress",
          payload: {
            input: {
              id: initiativeIssue.id,
            },
            repository,
          },
        } satisfies TicketRpcRequest);
        const initiativeUpdate = yield* rpc.handle({
          id: "initiative-update",
          method: "ticket.initiative.update.add",
          payload: {
            input: {
              id: initiativeIssue.id,
              update: {
                status: "on-track",
                summary: "Backend plumbing is in place",
              },
            },
            repository,
          },
        } satisfies TicketRpcRequest);

        return {
          child,
          initiative,
          initiativeUpdate,
          label,
          labels,
          progress,
          template,
          templateArchive,
          templateList,
          user,
          userGet,
          userList,
          view,
          viewList,
          viewUpdate,
        };
      }),
    );

    assert.equal(result.user.ok, true);
    assert.equal((result.user.value as UserProfileDocument).email, "peer@example.invalid");
    assert.equal(result.userGet.ok, true);
    assert.equal((result.userGet.value as UserProfileDocument | null)?.id, "peer@example.invalid");
    assert.equal(result.userList.ok, true);
    assert.deepStrictEqual(
      (result.userList.value as UserProfilePage).entries.map((entry) => entry.id),
      ["peer@example.invalid"],
    );
    assert.equal(result.label.ok, true);
    assert.equal(result.labels?.ok, true);
    assert.ok(
      ((result.labels?.ok ? result.labels.value : { entries: [] }) as LabelDefinitionPage).entries
        .map((entry) => entry.name)
        .includes("Customer Bug"),
    );
    assert.equal(result.viewUpdate?.ok, true);
    assert.equal(result.viewList?.ok, true);
    assert.ok(
      ((result.viewList?.ok ? result.viewList.value : { entries: [] }) as SavedViewPage).entries
        .map((entry) => entry.name)
        .includes("Open bugs"),
    );
    assert.equal(result.templateArchive?.ok, true);
    assert.equal(result.templateList?.ok, true);
    assert.deepStrictEqual(
      (
        (result.templateList?.ok ? result.templateList.value : { entries: [] }) as IssueTemplatePage
      ).entries.map((entry) => entry.active),
      [false],
    );
    assert.equal(result.child?.ok, true);
    assert.equal(result.progress?.ok, true);
    assert.deepStrictEqual(result.progress?.value as InitiativeProgress, {
      completedEstimate: 2,
      completedIssues: 1,
      estimateTotal: 2,
      issueTotal: 1,
      statusCounts: {
        done: 1,
      },
    });
    assert.equal(result.initiativeUpdate?.ok, true);
    assert.equal(
      ((result.initiativeUpdate?.ok ? result.initiativeUpdate.value : null) as LinkedRecord | null)
        ?.recordType,
      "initiative-update",
    );
  });
});
