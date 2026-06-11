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
  useCaseFromAlias,
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

  it.effect("rejects invalid aliased payloads with typed failures", () =>
    Effect.gen(function* () {
      const result = yield* useCaseFromAlias(
        "ticket.issue.create",
        {
          input: {
            body: "missing title",
          },
          repository,
        },
        { requestId: "invalid-alias", source: "test" },
      ).pipe(Effect.result);

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "InvalidInputFailure");
        assert.equal(result.failure.requestId, "invalid-alias");
      }
    }),
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
