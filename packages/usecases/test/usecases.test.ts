import { DatabaseService, DatabaseTest, type DatabaseServiceShape } from "@cycle/database";
import { GitDbInMemory, Store as GitDbStore } from "@cycle/git-db";
import {
  UseCaseAliasList,
  UseCaseContracts,
  UseCaseFailure,
  UseCasePayloadSchemasByAlias,
  UseCaseSuccessSchemasByAlias,
  contractForAlias,
  type UseCaseAlias,
} from "@cycle/contracts/contracts";
import { Effect, Layer, Result, Schema } from "effect";
import type { Span } from "effect/Tracer";
import {
  AutomationEvaluateQuery,
  IssueCreate,
  IssueList,
  IssueRelationAdd,
  RepositoryStatusGet,
  IssueTransition,
  UseCaseRunner,
  UseCaseRunnerLive,
  makeUseCaseRunner,
  makeUseCase,
  useCaseNameForAlias,
} from "../src/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const repository = { id: "usecase-repository" };
const TestLayer = UseCaseRunnerLive.pipe(Layer.provideMerge(DatabaseTest()));
const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const databaseStub = (overrides: Partial<DatabaseServiceShape>): DatabaseServiceShape =>
  new Proxy(overrides, {
    get: (target, property) => {
      if (property in target) return target[property as keyof DatabaseServiceShape];

      return () => Effect.die(new Error(`Unexpected database call: ${String(property)}`));
    },
  }) as DatabaseServiceShape;

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
  it.effect("exposes schema-backed contracts for every canonical usecase alias", () =>
    Effect.sync(() => {
      const observedAliases = new Set<string>();

      for (const [name, contract] of Object.entries(UseCaseContracts)) {
        assert.equal(contract.name, name);
        assert.equal(contract.failureSchema, UseCaseFailure);
        assert.doesNotThrow(() =>
          Schema.decodeUnknownSync(
            contract.failureSchema,
            StrictDecodeOptions,
          )({
            _tag: "InvalidInputFailure",
            details: {
              reason: "registry-conformance",
            },
            message: "Invalid input.",
            requestId: "registry-conformance",
            retryable: false,
            useCase: contract.name,
          }),
        );

        for (const alias of contract.aliases) {
          const typedAlias = alias as UseCaseAlias;
          assert.equal(observedAliases.has(alias), false);
          observedAliases.add(alias);
          assert.equal(contractForAlias(typedAlias).name, contract.name);
          assert.equal(UseCasePayloadSchemasByAlias[typedAlias], contract.inputSchema);
          assert.equal(UseCaseSuccessSchemasByAlias[typedAlias], contract.successSchema);
        }
      }

      assert.deepEqual([...UseCaseAliasList].sort(), [...observedAliases].sort());
    }),
  );

  it.effect("creates trace spans around usecase execution", () =>
    Effect.gen(function* () {
      let observedSpan: Span | undefined;
      const runner = makeUseCaseRunner(
        databaseStub({
          repositoryStatus: (repositoryId) =>
            Effect.gen(function* () {
              observedSpan = yield* Effect.currentSpan.pipe(Effect.orDie);

              return {
                activeGeneration: 0,
                activeSnapshotId: null,
                repositoryId,
                status: "empty" as const,
                warningCount: 0,
              };
            }),
        }),
      );

      const status = yield* runner.run(
        RepositoryStatusGet(
          {
            input: {},
            repository,
          },
          {
            requestId: "trace-usecase",
            source: "test",
          },
        ),
      );

      assert.equal(status.repositoryId, repository.id);
      assert.ok(observedSpan);
      assert.equal(observedSpan.name, "test.usecase.RepositoryStatusGet.execute");
      assert.equal(observedSpan.attributes.get("requestId"), "trace-usecase");
      assert.equal(observedSpan.attributes.get("stage"), "execute");

      const parent = observedSpan.parent._tag === "Some" ? observedSpan.parent.value : undefined;
      assert.equal(parent?._tag, "Span");
      if (parent?._tag === "Span") {
        assert.equal(parent.name, "test.usecase.RepositoryStatusGet");
        assert.equal(parent.attributes.get("useCase"), "RepositoryStatusGet");
      }
    }),
  );

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

  it.effect("rejects undeclared usecase input fields with typed failures", () =>
    Effect.gen(function* () {
      const runner = makeUseCaseRunner(databaseStub({}));
      const result = yield* runner
        .run(
          IssueCreate(
            {
              input: {
                debug: true,
                title: "Strict contract input",
              },
              repository,
            } as never,
            { requestId: "strict-input", source: "test" },
          ),
        )
        .pipe(Effect.result);

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "InvalidInputFailure");
        assert.equal(result.failure.requestId, "strict-input");
      }
    }),
  );

  it.effect("rejects invalid usecase success values with typed failures", () =>
    Effect.gen(function* () {
      const runner = makeUseCaseRunner(
        databaseStub({
          repositoryStatus: (repositoryId) =>
            Effect.succeed({
              activeSnapshotId: null,
              repositoryId,
              status: "empty" as const,
            } as never),
        }),
      );

      const result = yield* runner
        .run(
          RepositoryStatusGet(
            {
              input: {},
              repository,
            },
            { requestId: "invalid-success", source: "test" },
          ),
        )
        .pipe(Effect.result);

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "UnexpectedDefectFailure");
        assert.equal(result.failure.code, "INVALID_USECASE_SUCCESS");
        assert.equal(result.failure.requestId, "invalid-success");
      }
    }),
  );

  it.effect("rejects undeclared usecase success fields with typed failures", () =>
    Effect.gen(function* () {
      const runner = makeUseCaseRunner(
        databaseStub({
          repositoryStatus: (repositoryId) =>
            Effect.succeed({
              activeGeneration: 0,
              activeSnapshotId: null,
              debug: true,
              repositoryId,
              status: "empty" as const,
              warningCount: 0,
            } as never),
        }),
      );

      const result = yield* runner
        .run(
          RepositoryStatusGet(
            {
              input: {},
              repository,
            },
            { requestId: "strict-success", source: "test" },
          ),
        )
        .pipe(Effect.result);

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "UnexpectedDefectFailure");
        assert.equal(result.failure.code, "INVALID_USECASE_SUCCESS");
        assert.equal(result.failure.requestId, "strict-success");
      }
    }),
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
