import {
  DatabaseService,
  DatabaseTest,
  type DatabaseServiceShape,
  type TicketDocument,
} from "@cycle/database";
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
  CommentAdd,
  IssueCreate,
  IssueGet,
  IssueList,
  IssueRelationAdd,
  IssueUpdate,
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
    } as never);

    return yield* effect;
  }).pipe(Effect.provide(TestLayer));

type TicketDocumentOverrides = Omit<Partial<TicketDocument>, "frontmatter"> & {
  readonly frontmatter?: Partial<TicketDocument["frontmatter"]>;
};

const ticketDocument = (overrides: TicketDocumentOverrides = {}): TicketDocument => {
  const { frontmatter: frontmatterOverrides, ...ticketOverrides } = overrides;
  const frontmatter = {
    createdAt: "1970-01-01T00:00:00.000Z",
    createdBy: {
      name: "Test",
      type: "human" as const,
    },
    id: "CYC-00001",
    priority: "none",
    status: "backlog",
    title: "Fixture ticket",
    type: "task",
    updatedAt: "1970-01-01T00:00:00.000Z",
    ...frontmatterOverrides,
  };

  return {
    body: "",
    bodyFormat: "markdown",
    createdBy: "Test",
    id: frontmatter.id,
    parent: "",
    priority: frontmatter.priority,
    schemaVersion: 1,
    status: frontmatter.status,
    title: frontmatter.title,
    type: frontmatter.type,
    updatedDate: "1970-01-01",
    ...ticketOverrides,
    frontmatter,
  } as TicketDocument;
};

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
            type: "task",
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
      assert.equal(created.type, "task");
      assert.equal(created.frontmatter.type, "task");
      assert.deepEqual(
        listed.entries.map((ticket) => ticket.id),
        [created.id],
      );
    }).pipe(withOpenRepository),
  );

  it.effect("requires canonical ticket type IDs for issue creates", () =>
    Effect.gen(function* () {
      const runner = makeUseCaseRunner(databaseStub({}));
      const invalidInputs = [
        {
          input: {
            title: "Missing type",
          },
          requestId: "missing-type",
        },
        {
          input: {
            title: "Empty type",
            type: "",
          },
          requestId: "empty-type",
        },
        {
          input: {
            title: "Display label type",
            type: "Task",
          },
          requestId: "display-label-type",
        },
        {
          input: {
            title: "Legacy alias type",
            type: "issue",
          },
          requestId: "legacy-alias-type",
        },
        {
          input: {
            title: "Unknown type",
            type: "unknown",
          },
          requestId: "unknown-type",
        },
      ] as const;

      for (const { input, requestId } of invalidInputs) {
        const result = yield* runner
          .run(
            IssueCreate(
              {
                input,
                repository,
              } as never,
              { requestId, source: "test" },
            ),
          )
          .pipe(Effect.result);

        assert.equal(Result.isFailure(result), true);
        if (Result.isFailure(result)) {
          assert.equal(result.failure._tag, "InvalidInputFailure");
          assert.equal(result.failure.requestId, requestId);
        }
      }
    }),
  );

  it.effect("normalizes legacy readable ticket types on issue reads", () =>
    Effect.gen(function* () {
      const cases = [
        {
          expected: "task",
          ticket: ticketDocument({
            frontmatter: { type: "issue" },
            type: "issue",
          }),
        },
        {
          expected: "epic",
          ticket: ticketDocument({
            frontmatter: { type: "initiative" },
            type: "initiative",
          }),
        },
        {
          expected: "task",
          ticket: ticketDocument({
            frontmatter: { type: undefined as never },
            type: undefined as never,
          }),
        },
        {
          expected: "legacy-custom",
          ticket: ticketDocument({
            frontmatter: { type: "legacy-custom" },
            type: "legacy-custom",
          }),
        },
      ] as const;

      for (const [index, testCase] of cases.entries()) {
        const runner = makeUseCaseRunner(
          databaseStub({
            getTicket: () => Effect.succeed(testCase.ticket),
          }),
        );
        const ticket = yield* runner.run(
          IssueGet(
            {
              input: {
                id: testCase.ticket.id,
              },
              repository,
            },
            { requestId: `legacy-type-read-${index}`, source: "test" },
          ),
        );

        assert.ok(ticket !== null);
        assert.equal(ticket.type, testCase.expected);
        assert.equal(ticket.frontmatter.type, testCase.expected);
      }
    }),
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
                type: "task",
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
                type: "task",
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
            type: "task",
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
                type: "task",
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

  it.effect("rejects non-canonical ticket types on issue update writes", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const created = yield* runner.run(
        IssueCreate({
          input: {
            title: "Canonical update",
            type: "task",
          },
          repository,
        }),
      );

      const result = yield* runner
        .run(
          IssueUpdate({
            input: {
              id: created.id,
              patch: {
                frontmatter: {
                  type: "Task",
                },
              },
            },
            repository,
          }),
        )
        .pipe(Effect.result);

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "InvalidInputFailure");
        assert.equal(result.failure.field, "patch.frontmatter.type");
      }
    }).pipe(withOpenRepository),
  );

  it.effect("allows agent pickup transition from todo to in-progress", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const created = yield* runner.run(
        IssueCreate({
          input: {
            status: "todo",
            title: "Agent pickup",
            type: "task",
          },
          repository,
        }),
      );

      const transitioned = yield* runner.run(
        IssueTransition(
          {
            input: {
              id: created.id,
              status: "in-progress",
            },
            repository,
          },
          {
            actor: {
              name: "Automation",
              type: "agent",
            },
            requestId: "agent-pickup",
            source: "test",
          },
        ),
      );

      assert.equal(transitioned.status, "in-progress");
    }).pipe(withOpenRepository),
  );

  it.effect("requires an explicit human actor for done transitions", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const created = yield* runner.run(
        IssueCreate({
          input: {
            planningNotRequired: true,
            status: "in-review",
            title: "Explicit approval",
            type: "task",
          },
          repository,
        }),
      );

      const missingActor = yield* runner
        .run(
          IssueTransition(
            {
              input: {
                id: created.id,
                status: "done",
              },
              repository,
            },
            { requestId: "missing-actor-done", source: "test" },
          ),
        )
        .pipe(Effect.result);

      assert.equal(Result.isFailure(missingActor), true);
      if (Result.isFailure(missingActor)) {
        assert.equal(missingActor.failure._tag, "PolicyViolationFailure");
        assert.equal(missingActor.failure.code, "HUMAN_APPROVAL_REQUIRED");
      }

      const approved = yield* runner.run(
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
              name: "Reviewer",
              type: "human",
            },
            requestId: "human-done",
            source: "test",
          },
        ),
      );

      assert.equal(approved.status, "done");
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
            type: "task",
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

  it.effect("preserves comment payload shape and rejects empty comments", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const created = yield* runner.run(
        IssueCreate({
          input: {
            title: "Comment shape",
            type: "task",
          },
          repository,
        }),
      );

      const empty = yield* runner
        .run(
          CommentAdd({
            input: {
              body: "   ",
              issueId: created.id,
            },
            repository,
          }),
        )
        .pipe(Effect.result);

      assert.equal(Result.isFailure(empty), true);
      if (Result.isFailure(empty)) {
        assert.equal(empty.failure._tag, "InvalidInputFailure");
        assert.equal(empty.failure.field, "input.body");
      }

      const comment = yield* runner.run(
        CommentAdd({
          input: {
            body: "Keep\nshape",
            issueId: created.id,
          },
          repository,
        }),
      );

      assert.equal(comment.recordType, "comment");
      assert.deepEqual(comment.payload, { body: "Keep\nshape" });
    }).pipe(withOpenRepository),
  );

  it.effect("rejects self-relations in usecase policy", () =>
    Effect.gen(function* () {
      const runner = yield* UseCaseRunner;
      const created = yield* runner.run(
        IssueCreate({
          input: {
            title: "Relate safely",
            type: "task",
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
            type: "task",
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
