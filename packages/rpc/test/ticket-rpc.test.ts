import { strict as assert } from "node:assert";
import {
  TicketDbInMemory,
  type IssueDocument,
  type IssuePage,
  type TicketDbService,
} from "@cycle/ticket-db";
import { Effect, Layer } from "effect";
import {
  makeTicketRpcClient,
  TicketRpcLive,
  TicketRpcService,
  type TicketRpcRequest,
} from "../src/index.ts";
import { describe, it } from "vitest";

const TestLayer = Layer.mergeAll(TicketRpcLive, TicketDbInMemory());

const repository = { id: "test-repository" };

const runRpc = <A>(effect: Effect.Effect<A, never, TicketDbService | TicketRpcService>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

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

        const createdIssue = created.value as IssueDocument;

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
    const createdIssue = result.created.value as IssueDocument;
    assert.equal(createdIssue.frontmatter.title, "Build the RPC package");
    assert.equal(result.listed.ok, true);
    const issuePage = result.listed.value as IssuePage;
    assert.equal(issuePage.entries.length, 1);
    assert.equal(result.fetched.ok, true);
    const fetchedIssue = result.fetched.value as IssueDocument | null;
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

  it("serializes TicketDB failures", async () => {
    const response = await runRpc(
      Effect.gen(function* () {
        const rpc = yield* TicketRpcService;

        return yield* rpc.handle({
          id: "missing-draft",
          method: "ticket.draft.commit",
          payload: {
            input: "missing-draft-id",
            repository,
          },
        } satisfies TicketRpcRequest);
      }),
    );

    assert.equal(response.ok, false);
    if (response.ok) return;

    assert.equal(response.id, "missing-draft");
    assert.equal(response.error.sourceTag, "DraftNotFoundError");
    assert.equal(response.error.details?.["draftId"], "missing-draft-id");
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
