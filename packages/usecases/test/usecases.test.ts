import { DatabaseService, DatabaseTest } from "@cycle/database";
import { GitDbInMemory, Store as GitDbStore } from "@cycle/git-db";
import { Effect, Layer, Result } from "effect";
import {
  AutomationEvaluateQuery,
  IssueCreate,
  IssueList,
  IssueRelationAdd,
  IssueTransition,
  UseCaseRunner,
  UseCaseRunnerLive,
  makeUseCase,
  useCaseNameForAlias,
} from "../src/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const repository = { id: "usecase-repository" };
const TestLayer = UseCaseRunnerLive.pipe(Layer.provideMerge(DatabaseTest()));

const withOpenRepository = <A>(
  effect: Effect.Effect<A, unknown, DatabaseService | UseCaseRunner>,
) =>
  Effect.gen(function* () {
    const database = yield* DatabaseService;
    const store = yield* Effect.gen(function* () {
      return yield* GitDbStore.StoreService;
    }).pipe(
      Effect.provide(
        GitDbInMemory({
          database: "cycle-usecases",
        }),
      ),
    );

    yield* database.openRepository({
      pollIntervalMs: false,
      repositoryId: repository.id,
      store,
    });

    return yield* effect;
  }).pipe(Effect.provide(TestLayer));

describe("@cycle/usecases", () => {
  it.effect("creates and lists issues through the runner", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;

      const created = yield* runner.run(
        IssueCreate({
          input: {
            body: "Usecase body",
            title: "Build the usecase layer",
          },
          repository,
        }),
      );

      const listed = yield* runner.run(
        IssueList({
          input: {},
          repository,
        }),
      );

      assert.equal(created.title, "Build the usecase layer");
      assert.deepEqual(
        listed.entries.map((ticket) => ticket.id),
        [created.id],
      );
    }).pipe(withOpenRepository),
  );

  it.effect("rejects invalid usecase payloads with typed failures", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const result = yield* runner
        .run(
          IssueCreate(
            {
              input: {
                body: "missing title",
              } as never,
              repository,
            },
            { requestId: "invalid-input", source: "test" },
          ),
        )
        .pipe(Effect.result);

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "InvalidInputFailure");
        assert.equal(result.failure.requestId, "invalid-input");
      }
    }).pipe(withOpenRepository),
  );

  it.effect("maps compatibility aliases to canonical usecases", () =>
    Effect.sync(() => {
      const name = useCaseNameForAlias("ticket.issue.create");
      if (name === null) throw new Error("ticket.issue.create alias is missing.");

      const created = makeUseCase(
        name,
        {
          input: {
            body: "Alias-compatible body",
            title: "Alias-compatible issue",
          },
          repository,
        } as never,
        { requestId: "alias-contract", source: "test" },
      );

      assert.equal(created.name, "IssueCreate");
      assert.equal(created.meta?.requestId, "alias-contract");
    }),
  );

  it.effect("rejects unsupported idempotency keys on write usecases", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const result = yield* runner
        .run(
          IssueCreate(
            {
              input: {
                title: "Idempotency requires a store",
              },
              repository,
            },
            {
              idempotencyKey: "issue-create-1",
              requestId: "write-idempotency",
              source: "test",
            },
          ),
        )
        .pipe(Effect.result);

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "InvalidInputFailure");
        assert.equal(result.failure.field, "meta.idempotencyKey");
        assert.equal(result.failure.requestId, "write-idempotency");
      }
    }).pipe(withOpenRepository),
  );

  it.effect("accepts idempotency keys on read-only usecases", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const listed = yield* runner.run(
        IssueList(
          {
            input: {},
            repository,
          },
          {
            idempotencyKey: "issue-list-1",
            requestId: "read-idempotency",
            source: "test",
          },
        ),
      );

      assert.deepEqual(listed.entries, []);
    }).pipe(withOpenRepository),
  );

  it.effect("rejects non-human done transitions before storage", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const created = yield* runner.run(
        IssueCreate({
          input: {
            planningNotRequired: true,
            status: "in-review",
            title: "Needs approval",
          },
          repository,
        }),
      );

      const result = yield* runner
        .run(
          IssueTransition(
            {
              input: {
                id: created.id,
                status: "done",
              },
              repository,
            },
            {
              actor: {
                name: "Automation",
                type: "agent",
              },
              requestId: "agent-done",
              source: "test",
            },
          ),
        )
        .pipe(Effect.result);

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "PolicyViolationFailure");
        assert.equal(result.failure.code, "HUMAN_APPROVAL_REQUIRED");
      }
    }).pipe(withOpenRepository),
  );

  it.effect("rejects self-relations in usecase policy", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const created = yield* runner.run(
        IssueCreate({
          input: {
            title: "Relate safely",
          },
          repository,
        }),
      );

      const result = yield* runner
        .run(
          IssueRelationAdd({
            input: {
              id: created.id,
              relation: {
                issueId: created.id,
                type: "related",
              },
            },
            repository,
          }),
        )
        .pipe(Effect.result);

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "PolicyViolationFailure");
        assert.equal(result.failure.code, "SELF_RELATION");
      }
    }).pipe(withOpenRepository),
  );

  it.effect("evaluates query automation reports deterministically", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const created = yield* runner.run(
        IssueCreate({
          input: {
            status: "ready",
            title: "Ready without plan",
          },
          repository,
        }),
      );

      const report = yield* runner.run(
        AutomationEvaluateQuery({
          query: {
            status: "ready",
          },
          repository,
        }),
      );

      assert.equal(report.status, "fail");
      assert.deepEqual(report.checkedTicketIds, [created.id]);
      assert.equal(report.checkedAt, "1970-01-01T00:00:00.000Z");
      assert.equal(report.violations[0]?.code, "PLAN_REQUIRED");
    }).pipe(withOpenRepository),
  );
});
