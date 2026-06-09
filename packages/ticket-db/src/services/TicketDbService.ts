import { GitDbInMemory, Store as GitDbStore } from "@cycle/git-db";
import { Context, Effect, Layer } from "effect";
import type {
  AddLinkedRecordInput,
  CreateDraftInput,
  CreateIssueInput,
  HistoryOptions,
  IssueHistory,
  IssuePage,
  IssueQuery,
  ReadOptions,
  RecordQuery,
  TransitionIssueInput,
  UpdateDraftInput,
  UpdateIssueInput,
} from "../domain/Types.ts";
import type { TicketDbFailure } from "../errors/TicketDbFailure.ts";
import type { DraftId } from "../schemas/DraftId.ts";
import type { DraftSession } from "../schemas/DraftSession.ts";
import type { IssueDocument } from "../schemas/IssueDocument.ts";
import type { IssueId } from "../schemas/IssueId.ts";
import type { LinkedRecord } from "../schemas/LinkedRecord.ts";
import { makeTicketDbService } from "../store/TicketDbStore.ts";
import { TicketIdentity, TicketIdentityTest } from "./TicketIdentity.ts";
import { TicketIdGenerator, TicketIdGeneratorDeterministic } from "./TicketIdGenerator.ts";
import { WorkflowPolicy, WorkflowPolicyDefault } from "./WorkflowPolicy.ts";

export type TicketDbServiceShape = {
  readonly addRecord: <TPayload = unknown>(
    input: AddLinkedRecordInput<TPayload>,
  ) => Effect.Effect<LinkedRecord, TicketDbFailure>;
  readonly commitDraft: (draftId: DraftId) => Effect.Effect<IssueDocument, TicketDbFailure>;
  readonly createDraft: (input: CreateDraftInput) => Effect.Effect<DraftSession, TicketDbFailure>;
  readonly createIssue: (input: CreateIssueInput) => Effect.Effect<IssueDocument, TicketDbFailure>;
  readonly getIssue: (
    id: IssueId,
    options?: ReadOptions,
  ) => Effect.Effect<IssueDocument | null, TicketDbFailure>;
  readonly issueHistory: (
    id: IssueId,
    options?: HistoryOptions,
  ) => Effect.Effect<IssueHistory, TicketDbFailure>;
  readonly listIssues: (query?: IssueQuery) => Effect.Effect<IssuePage, TicketDbFailure>;
  readonly recordsForIssue: (
    issueId: IssueId,
    query?: RecordQuery,
  ) => Effect.Effect<ReadonlyArray<LinkedRecord>, TicketDbFailure>;
  readonly transitionIssue: (
    input: TransitionIssueInput,
  ) => Effect.Effect<IssueDocument, TicketDbFailure>;
  readonly updateDraft: (input: UpdateDraftInput) => Effect.Effect<DraftSession, TicketDbFailure>;
  readonly updateIssue: (
    id: IssueId,
    patch: UpdateIssueInput,
  ) => Effect.Effect<IssueDocument, TicketDbFailure>;
};

export class TicketDbService extends Context.Service<TicketDbService, TicketDbServiceShape>()(
  "@cycle/ticket-db/TicketDbService",
) {}

export const TicketDbLive = Layer.effect(
  TicketDbService,
  Effect.gen(function* () {
    const store = yield* GitDbStore.StoreService;
    const identity = yield* TicketIdentity;
    const ids = yield* TicketIdGenerator;
    const policy = yield* WorkflowPolicy;

    return TicketDbService.of(makeTicketDbService(store, identity, ids, policy));
  }),
);

export const TicketDbTest = (options: GitDbStore.Options = {}) => {
  const gitDb = GitDbInMemory({
    database: "cycle",
    ...options,
  });

  return TicketDbLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        gitDb,
        TicketIdentityTest(),
        TicketIdGeneratorDeterministic(),
        WorkflowPolicyDefault,
      ),
    ),
  );
};

export const TicketDbInMemory = TicketDbTest;
