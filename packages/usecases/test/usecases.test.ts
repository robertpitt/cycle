import { DatabaseService, type DatabaseServiceShape, type TicketDocument } from "@cycle/database";
import { GitDbInMemory, Store as GitDbStore } from "@cycle/git-db";
import { Effect, Layer, Result } from "effect";
import type { Span } from "effect/Tracer";
import {
  AutomationEvaluateQuery,
  CommentAdd,
  IssueCreate,
  IssueGet,
  IssueList,
  IssueRelationAdd,
  IssueTransition,
  IssueUpdate,
  RepositoryStatusGet,
  UseCaseServicesLive,
  UseCaseTest,
  type WorkflowPolicy,
} from "../src/index.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const repository = { id: "usecase-repository" };
const TestLayer = UseCaseTest();

const databaseStub = (overrides: Partial<DatabaseServiceShape>): DatabaseServiceShape =>
  new Proxy(overrides, {
    get: (target, property) => {
      if (property in target) return target[property as keyof DatabaseServiceShape];

      return () => Effect.die(new Error(`Unexpected database call: ${String(property)}`));
    },
  }) as DatabaseServiceShape;

const StubLayer = (overrides: Partial<DatabaseServiceShape>) =>
  Layer.mergeAll(
    Layer.succeed(DatabaseService, DatabaseService.of(databaseStub(overrides))),
    UseCaseServicesLive,
  );

const provideStub =
  (overrides: Partial<DatabaseServiceShape>) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, Exclude<R, DatabaseService | WorkflowPolicy>> =>
    effect.pipe(Effect.provide(StubLayer(overrides))) as never;

const withOpenRepository = <A, E>(
  effect: Effect.Effect<A, E, DatabaseService | WorkflowPolicy>,
): Effect.Effect<A, unknown, never> =>
  Effect.gen(function* () {
    const database = yield* DatabaseService;
    const store = yield* GitDbStore.StoreService.pipe(
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
  it.effect("runs named usecase definitions through layers", () =>
    Effect.gen(function* () {
      const created = yield* IssueCreate.run({
        input: {
          body: "Usecase body",
          title: "Build the usecase layer",
          type: "task",
        },
        repository,
      });

      const listed = yield* IssueList.run({
        input: {},
        repository,
      });

      assert.equal(created.title, "Build the usecase layer");
      assert.equal(created.type, "task");
      assert.equal(created.frontmatter.type, "task");
      assert.deepEqual(
        listed.entries.map((ticket) => ticket.id),
        [created.id],
      );
    }).pipe(withOpenRepository),
  );

  it.effect("creates tickets with expanded canonical ticket types", () =>
    Effect.gen(function* () {
      const story = yield* IssueCreate.run({
        input: {
          title: "Describe the checkout workflow",
          type: "story",
        },
        repository,
      });
      const specification = yield* IssueCreate.run({
        input: {
          title: "Specify the ticket prompt system",
          type: "specification",
        },
        repository,
      });

      assert.equal(story.type, "story");
      assert.equal(story.frontmatter.type, "story");
      assert.equal(specification.type, "specification");
      assert.equal(specification.frontmatter.type, "specification");
    }).pipe(withOpenRepository),
  );

  it.effect("creates trace spans around usecase execution", () =>
    Effect.gen(function* () {
      let observedSpan: Span | undefined;

      const status = yield* RepositoryStatusGet.run(
        {
          input: {},
          repository,
        },
        {
          requestId: "trace-usecase",
          source: "test",
        },
      ).pipe(
        provideStub({
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

      assert.equal(status.repositoryId, repository.id);
      assert.ok(observedSpan);
      assert.equal(observedSpan.name, "test.usecase.RepositoryStatusGet");
      assert.equal(observedSpan.attributes.get("requestId"), "trace-usecase");
      assert.equal(observedSpan.attributes.get("useCase"), "RepositoryStatusGet");
    }),
  );

  it.effect("rejects invalid input, metadata, and success values with typed failures", () =>
    Effect.gen(function* () {
      const invalidInput = yield* IssueCreate.run(
        {
          input: {
            title: "Display label type",
            type: "Task",
          },
          repository,
        } as never,
        { requestId: "display-label-type", source: "test" },
      ).pipe(Effect.result, provideStub({}));

      assert.equal(Result.isFailure(invalidInput), true);
      if (Result.isFailure(invalidInput)) {
        assert.equal(invalidInput.failure._tag, "InvalidInputFailure");
        assert.equal(invalidInput.failure.requestId, "display-label-type");
      }

      const invalidMeta = yield* RepositoryStatusGet.run(
        {
          input: {},
          repository,
        },
        { requestId: "invalid-meta", extra: true } as never,
      ).pipe(Effect.result, provideStub({}));

      assert.equal(Result.isFailure(invalidMeta), true);
      if (Result.isFailure(invalidMeta)) {
        assert.equal(invalidMeta.failure._tag, "InvalidInputFailure");
        assert.equal(invalidMeta.failure.requestId, "invalid-meta");
      }

      const invalidSuccess = yield* RepositoryStatusGet.run(
        {
          input: {},
          repository,
        },
        { requestId: "invalid-success", source: "test" },
      ).pipe(
        Effect.result,
        provideStub({
          repositoryStatus: (repositoryId) =>
            Effect.succeed({
              activeSnapshotId: null,
              repositoryId,
              status: "empty" as const,
            } as never),
        }),
      );

      assert.equal(Result.isFailure(invalidSuccess), true);
      if (Result.isFailure(invalidSuccess)) {
        assert.equal(invalidSuccess.failure._tag, "UnexpectedDefectFailure");
        assert.equal(invalidSuccess.failure.code, "INVALID_USECASE_SUCCESS");
        assert.equal(invalidSuccess.failure.requestId, "invalid-success");
      }
    }),
  );

  it.effect("enforces deadline metadata before handler execution", () =>
    Effect.gen(function* () {
      const result = yield* RepositoryStatusGet.run(
        {
          input: {},
          repository,
        },
        { deadline: Date.now() - 1, requestId: "expired", source: "test" },
      ).pipe(
        Effect.result,
        provideStub({
          repositoryStatus: () => Effect.die("deadline should short-circuit"),
        }),
      );

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "TimeoutFailure");
        assert.equal(result.failure.code, "DEADLINE_EXCEEDED");
        assert.equal(result.failure.requestId, "expired");
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
      ] as const;

      for (const [index, testCase] of cases.entries()) {
        const ticket = yield* IssueGet.run(
          {
            input: {
              id: testCase.ticket.id,
            },
            repository,
          },
          { requestId: `legacy-type-read-${index}`, source: "test" },
        ).pipe(
          provideStub({
            getTicket: () => Effect.succeed(testCase.ticket),
          }),
        );

        assert.ok(ticket !== null);
        assert.equal(ticket.type, testCase.expected);
        assert.equal(ticket.frontmatter.type, testCase.expected);
      }
    }),
  );

  it.effect("keeps state-dependent workflow rules in policy services", () =>
    Effect.gen(function* () {
      const created = yield* IssueCreate.run({
        input: {
          planningNotRequired: true,
          status: "in-review",
          title: "Needs approval",
          type: "task",
        },
        repository,
      });

      const missingActor = yield* IssueTransition.run(
        {
          input: {
            id: created.id,
            status: "done",
          },
          repository,
        },
        { requestId: "missing-actor-done", source: "test" },
      ).pipe(Effect.result);

      assert.equal(Result.isFailure(missingActor), true);
      if (Result.isFailure(missingActor)) {
        assert.equal(missingActor.failure._tag, "PolicyViolationFailure");
        assert.equal(missingActor.failure.code, "HUMAN_APPROVAL_REQUIRED");
      }

      const selfRelation = yield* IssueRelationAdd.run({
        input: {
          id: created.id,
          relation: {
            issueId: created.id,
            type: "related",
          },
        },
        repository,
      }).pipe(Effect.result);

      assert.equal(Result.isFailure(selfRelation), true);
      if (Result.isFailure(selfRelation)) {
        assert.equal(selfRelation.failure._tag, "PolicyViolationFailure");
        assert.equal(selfRelation.failure.code, "SELF_RELATION");
      }
    }).pipe(withOpenRepository),
  );

  it.effect("validates stateless comment body rules through schemas", () =>
    Effect.gen(function* () {
      const result = yield* CommentAdd.run({
        input: {
          body: "   ",
          issueId: "CYC-00001",
        },
        repository,
      }).pipe(Effect.result, provideStub({}));

      assert.equal(Result.isFailure(result), true);
      if (Result.isFailure(result)) {
        assert.equal(result.failure._tag, "InvalidInputFailure");
      }
    }),
  );

  it.effect("keeps update policy and automation checks available as direct definitions", () =>
    Effect.gen(function* () {
      const created = yield* IssueCreate.run({
        input: {
          status: "ready",
          title: "Ready without plan",
          type: "task",
        },
        repository,
      });

      const update = yield* IssueUpdate.run({
        input: {
          id: created.id,
          patch: {
            frontmatter: {
              type: "Task",
            },
          },
        },
        repository,
      }).pipe(Effect.result);

      assert.equal(Result.isFailure(update), true);
      if (Result.isFailure(update)) {
        assert.equal(update.failure._tag, "InvalidInputFailure");
        assert.equal(update.failure.field, "patch.frontmatter.type");
      }

      const report = yield* AutomationEvaluateQuery.run({
        query: {
          status: "ready",
        },
        repository,
      });

      assert.equal(report.status, "fail");
      assert.deepEqual(report.checkedTicketIds, [created.id]);
      assert.equal(report.checkedAt, "1970-01-01T00:00:00.000Z");
      assert.equal(report.violations[0]?.code, "PLAN_REQUIRED");
    }).pipe(withOpenRepository),
  );
});
