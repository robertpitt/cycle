import { type GitDbError, Store as GitDbStore } from "@cycle/git-db";
import { DateTime, Effect } from "effect";
import { CURRENT_SCHEMA_VERSION } from "../constants.ts";
import { protectedSectionsChanged } from "../domain/IssueBody.ts";
import type {
  AddLinkedRecordInput,
  CreateDraftInput,
  CreateIssueInput,
  HistoryOptions,
  IssuePage,
  IssueQuery,
  ReadOptions,
  RecordQuery,
  TransitionIssueInput,
  UpdateDraftInput,
  UpdateIssueInput,
} from "../domain/Types.ts";
import {
  actorKey,
  hydrateDraftSession,
  hydrateIssueDocument,
  hydrateLinkedRecord,
  makeIssueDocument,
  makeIssueFrontmatter,
  normalizeKey,
  updateIssueDocument,
  updatedDateKey,
} from "../domain/IssueDocument.ts";
import { draftNotCommittable } from "../errors/DraftNotCommittableError.ts";
import { draftNotFound } from "../errors/DraftNotFoundError.ts";
import { issueNotFound } from "../errors/IssueNotFoundError.ts";
import { planImmutabilityError } from "../errors/PlanImmutabilityError.ts";
import type { TicketDbFailure } from "../errors/TicketDbFailure.ts";
import { validationError } from "../errors/ValidationError.ts";
import { mapGitDbError } from "../errors/mapGitDbError.ts";
import { Actor } from "../schemas/Actor.ts";
import { DraftSession } from "../schemas/DraftSession.ts";
import { IssueDocument } from "../schemas/IssueDocument.ts";
import { IssueFrontmatter } from "../schemas/IssueFrontmatter.ts";
import type { IssueId } from "../schemas/IssueId.ts";
import type { IssueStatus } from "../schemas/IssueStatus.ts";
import { LinkedRecord } from "../schemas/LinkedRecord.ts";
import type { TicketDbServiceShape } from "../services/TicketDbService.ts";
import type { TicketIdentityShape } from "../services/TicketIdentity.ts";
import type { TicketIdGeneratorShape } from "../services/TicketIdGenerator.ts";
import type { WorkflowPolicyShape } from "../services/WorkflowPolicy.ts";

const ISSUE_COLLECTION = "issues";
const RECORD_COLLECTION = "records";
const DRAFT_COLLECTION = "drafts";

const ISSUE_INDEXES = [
  "status",
  "priority",
  "type",
  "assignee",
  "parent",
  "updatedDate",
  "labels",
  "createdBy",
  "repository",
] as const;

const RECORD_INDEXES = ["issueId", "recordType", "createdDate"] as const;
const DRAFT_INDEXES = ["status", "createdByKey", "updatedDate"] as const;

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const storage = <A>(
  operation: string,
  effect: Effect.Effect<A, GitDbError>,
): Effect.Effect<A, TicketDbFailure> => effect.pipe(Effect.mapError(mapGitDbError(operation)));

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

const gitIdentity = (actor: Actor) => ({
  email: actor.email,
  name: actor.name,
});

const validateSafe = (field: string, value: string): Effect.Effect<void, TicketDbFailure> =>
  SAFE_SEGMENT.test(value) && !value.endsWith(".lock") && value !== "." && value !== ".."
    ? Effect.void
    : Effect.fail(validationError(field, `${field} must be a safe GitDB segment`));

const validateString = (
  field: string,
  value: string,
  options: { readonly allowEmpty?: boolean } = {},
): Effect.Effect<void, TicketDbFailure> =>
  value.trim().length > 0 || options.allowEmpty === true
    ? Effect.void
    : Effect.fail(validationError(field, `${field} must not be empty`));

const assertNoUnsafeContent = (
  field: string,
  value: unknown,
): Effect.Effect<void, TicketDbFailure> => {
  const unsafeKey = findUnsafeKey(value);

  if (unsafeKey !== null) {
    return Effect.fail(
      validationError(field, `unsafe secret-bearing field is not allowed: ${unsafeKey}`),
    );
  }

  return Effect.void;
};

const findUnsafeKey = (value: unknown, path = ""): string | null => {
  if (value === null || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUnsafeKey(value[index], `${path}[${index}]`);

      if (found !== null) return found;
    }

    return null;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = path.length === 0 ? key : `${path}.${key}`;

    if (/(api[_-]?key|token|secret|password|private[_-]?key)/iu.test(key)) {
      return nestedPath;
    }

    const found = findUnsafeKey(nested, nestedPath);

    if (found !== null) return found;
  }

  return null;
};

const validateIssueDocument = (issue: IssueDocument): Effect.Effect<void, TicketDbFailure> =>
  Effect.gen(function* () {
    yield* validateSafe("issue id", issue.id);
    yield* validateString("title", issue.frontmatter.title);
    yield* validateString("type", issue.frontmatter.type);
    yield* validateString("status", issue.frontmatter.status);
    yield* validateString("priority", issue.frontmatter.priority);
    yield* validateString("createdAt", issue.frontmatter.createdAt);
    yield* validateString("updatedAt", issue.frontmatter.updatedAt);
    yield* validateString("createdBy.name", issue.frontmatter.createdBy.name);
    yield* assertNoUnsafeContent("issue", {
      body: issue.body,
      frontmatter: issue.frontmatter,
    });
  });

const makeFrontmatter = (
  input: CreateIssueInput,
  id: IssueId,
  actor: Actor,
  now: string,
): IssueFrontmatter =>
  makeIssueFrontmatter({
    assignee: input.assignee,
    createdAt: now,
    createdBy: actor,
    externalLinks: input.externalLinks,
    id,
    labels: input.labels,
    parent: input.parent,
    planningNotRequired: input.planningNotRequired,
    priority: input.priority ?? "none",
    repository: input.repository,
    status: input.status ?? "backlog",
    title: input.title,
    type: input.type ?? "issue",
    updatedAt: now,
  });

const applyIssuePatch = (
  issue: IssueDocument,
  patch: UpdateIssueInput,
  actor: Actor,
  now: string,
): IssueDocument => {
  const patchFrontmatter = patch.frontmatter ?? {};
  const nextFrontmatter = makeIssueFrontmatter({
    ...issue.frontmatter,
    ...patchFrontmatter,
    createdAt: issue.frontmatter.createdAt,
    createdBy: issue.frontmatter.createdBy,
    id: issue.id,
    updatedAt: now,
  });

  const nextBody = patch.body ?? issue.body;

  return updateIssueDocument(issue, nextFrontmatter, nextBody);
};

const initialProvenanceRecord = (
  issueId: IssueId,
  id: string,
  actor: Actor,
  now: string,
): LinkedRecord =>
  new LinkedRecord({
    createdAt: now,
    createdBy: actor,
    createdDate: updatedDateKey(now),
    id,
    issueId,
    payload: {
      actor,
      timestamp: now,
    },
    recordType: "provenance",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

const statusChangeRecord = (
  issueId: IssueId,
  id: string,
  actor: Actor,
  now: string,
  from: IssueStatus | null,
  to: IssueStatus,
  reason?: string,
): LinkedRecord =>
  new LinkedRecord({
    createdAt: now,
    createdBy: actor,
    createdDate: updatedDateKey(now),
    id,
    issueId,
    payload: {
      from,
      reason,
      to,
    },
    recordType: "status-change",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

const makeRecordId = (issueId: IssueId, recordType: string, recordId: string): string =>
  `${issueId}_${normalizeKey(recordType)}_${recordId}`;

const makeRecord = <TPayload>(
  input: AddLinkedRecordInput<TPayload>,
  id: string,
  actor: Actor,
  now: string,
): LinkedRecord =>
  new LinkedRecord({
    createdAt: now,
    createdBy: actor,
    createdDate: updatedDateKey(now),
    id,
    issueId: input.issueId,
    payload: input.payload,
    recordType: input.recordType,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

const makeDraft = (
  id: string,
  issue: IssueDocument,
  actor: Actor,
  now: string,
  source?: unknown,
): DraftSession =>
  new DraftSession({
    createdAt: now,
    createdBy: actor,
    createdByKey: actorKey(actor),
    id,
    issue,
    records: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    source,
    status: "open",
    updatedAt: now,
    updatedDate: updatedDateKey(now),
  });

const issueCollections = (store: GitDbStore.StoreServiceShape) =>
  Effect.gen(function* () {
    const issues = yield* storage(
      "open issues collection",
      store.collection<IssueDocument>(ISSUE_COLLECTION, {
        indexes: [...ISSUE_INDEXES],
      }),
    );
    const records = yield* storage(
      "open records collection",
      store.collection<LinkedRecord>(RECORD_COLLECTION, {
        indexes: [...RECORD_INDEXES],
      }),
    );
    const drafts = yield* storage(
      "open drafts collection",
      store.collection<DraftSession>(DRAFT_COLLECTION, {
        indexes: [...DRAFT_INDEXES],
      }),
    );

    return { drafts, issues, records };
  });

export const makeTicketDbService = (
  store: GitDbStore.StoreServiceShape,
  identity: TicketIdentityShape,
  ids: TicketIdGeneratorShape,
  policy: WorkflowPolicyShape,
): TicketDbServiceShape => {
  const getIssue = (id: IssueId, options?: ReadOptions) =>
    Effect.gen(function* () {
      yield* validateSafe("issue id", id);
      const { issues } = yield* issueCollections(store);

      const issue = yield* storage("get issue", issues.get(id, options));

      return issue === null ? null : hydrateIssueDocument(issue);
    });

  const createIssue = (input: CreateIssueInput) =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("create issue input", input);

      const actor = yield* identity.currentActor;
      const now = yield* nowIso;
      const id = yield* ids.issueId;
      const body = input.body ?? policy.defaultIssueBody(input);
      const issue = makeIssueDocument(makeFrontmatter(input, id, actor, now), body);

      yield* validateIssueDocument(issue);

      const recordId = yield* ids.recordId;
      const statusRecordId = yield* ids.recordId;
      const tx = yield* storage("begin create issue", store.begin());
      const issues = yield* storage(
        "open issue transaction collection",
        tx.collection<IssueDocument>(ISSUE_COLLECTION, {
          indexes: [...ISSUE_INDEXES],
        }),
      );
      const records = yield* storage(
        "open record transaction collection",
        tx.collection<LinkedRecord>(RECORD_COLLECTION, {
          indexes: [...RECORD_INDEXES],
        }),
      );

      yield* storage("put issue", issues.put(id, issue));
      yield* storage(
        "put provenance record",
        records.put(
          makeRecordId(id, "provenance", recordId),
          initialProvenanceRecord(id, makeRecordId(id, "provenance", recordId), actor, now),
        ),
      );
      yield* storage(
        "put status record",
        records.put(
          makeRecordId(id, "status-change", statusRecordId),
          statusChangeRecord(
            id,
            makeRecordId(id, "status-change", statusRecordId),
            actor,
            now,
            null,
            issue.frontmatter.status,
          ),
        ),
      );
      yield* storage(
        "commit create issue",
        tx.commit({
          author: gitIdentity(actor),
          committer: gitIdentity(actor),
          message: `${actor.name} created issue ${id}: ${issue.frontmatter.title}`,
        }),
      );

      return issue;
    });

  const updateIssue = (id: IssueId, patch: UpdateIssueInput) =>
    Effect.gen(function* () {
      const current = yield* getIssue(id);

      if (current === null) return yield* Effect.fail(issueNotFound(id));

      const actor = yield* identity.currentActor;
      const now = yield* nowIso;
      const next = applyIssuePatch(current, patch, actor, now);

      if (current.frontmatter.status === "in-progress" && patch.body !== undefined) {
        const changed = protectedSectionsChanged(
          current.body,
          patch.body,
          policy.protectedSections,
        );

        if (changed.length > 0) return yield* Effect.fail(planImmutabilityError(id, changed));
      }

      if (next.frontmatter.status !== current.frontmatter.status) {
        yield* policy.assertTransitionAllowed(
          current.frontmatter.status,
          next.frontmatter.status,
          actor,
          current,
        );
      }

      yield* validateIssueDocument(next);

      const tx = yield* storage("begin update issue", store.begin());
      const issues = yield* storage(
        "open issue transaction collection",
        tx.collection<IssueDocument>(ISSUE_COLLECTION, {
          indexes: [...ISSUE_INDEXES],
        }),
      );
      const records = yield* storage(
        "open record transaction collection",
        tx.collection<LinkedRecord>(RECORD_COLLECTION, {
          indexes: [...RECORD_INDEXES],
        }),
      );

      yield* storage("put updated issue", issues.put(id, next));

      if (next.frontmatter.status !== current.frontmatter.status) {
        const recordId = makeRecordId(id, "status-change", yield* ids.recordId);
        yield* storage(
          "put status-change record",
          records.put(
            recordId,
            statusChangeRecord(
              id,
              recordId,
              actor,
              now,
              current.frontmatter.status,
              next.frontmatter.status,
            ),
          ),
        );
      }

      yield* storage(
        "commit update issue",
        tx.commit({
          author: gitIdentity(actor),
          committer: gitIdentity(actor),
          message: patch.message ?? `${actor.name} updated issue ${id}: ${next.frontmatter.title}`,
        }),
      );

      return next;
    });

  const transitionIssue = (input: TransitionIssueInput) =>
    Effect.gen(function* () {
      const current = yield* getIssue(input.id);

      if (current === null) return yield* Effect.fail(issueNotFound(input.id));

      const actor = yield* identity.currentActor;
      yield* policy.assertTransitionAllowed(
        current.frontmatter.status,
        input.status,
        actor,
        current,
      );

      const now = yield* nowIso;
      const next = updateIssueDocument(current, {
        ...current.frontmatter,
        status: input.status,
        updatedAt: now,
      });
      const recordId = makeRecordId(input.id, "status-change", yield* ids.recordId);
      const tx = yield* storage("begin transition issue", store.begin());
      const issues = yield* storage(
        "open issue transaction collection",
        tx.collection<IssueDocument>(ISSUE_COLLECTION, {
          indexes: [...ISSUE_INDEXES],
        }),
      );
      const records = yield* storage(
        "open record transaction collection",
        tx.collection<LinkedRecord>(RECORD_COLLECTION, {
          indexes: [...RECORD_INDEXES],
        }),
      );

      yield* storage("put transitioned issue", issues.put(input.id, next));
      yield* storage(
        "put status-change record",
        records.put(
          recordId,
          statusChangeRecord(
            input.id,
            recordId,
            actor,
            now,
            current.frontmatter.status,
            input.status,
            input.reason,
          ),
        ),
      );
      yield* storage(
        "commit transition issue",
        tx.commit({
          author: gitIdentity(actor),
          committer: gitIdentity(actor),
          message: `${actor.name} moved issue ${input.id} to ${input.status}`,
        }),
      );

      return next;
    });

  const listIssues = (query: IssueQuery = {}): Effect.Effect<IssuePage, TicketDbFailure> =>
    Effect.gen(function* () {
      const { issues } = yield* issueCollections(store);
      const limit = query.limit ?? 100;
      const pageOptions = {
        cursor: query.cursor,
        from: query.from,
        limit,
      };
      const indexed =
        query.status !== undefined
          ? ({ key: normalizeKey(query.status), name: "status" } as const)
          : query.priority !== undefined
            ? ({ key: normalizeKey(query.priority), name: "priority" } as const)
            : query.type !== undefined
              ? ({ key: normalizeKey(query.type), name: "type" } as const)
              : query.assignee !== undefined
                ? ({ key: normalizeKey(query.assignee), name: "assignee" } as const)
                : query.parent !== undefined
                  ? ({ key: normalizeKey(query.parent), name: "parent" } as const)
                  : query.label !== undefined
                    ? ({ key: normalizeKey(query.label), name: "labels" } as const)
                    : null;
      const page =
        indexed === null
          ? yield* storage("page issues", issues.page(pageOptions))
          : yield* Effect.gen(function* () {
              const index = yield* storage("open issue index", issues.index(indexed.name));

              return yield* storage("page issue index", index.page(indexed.key, pageOptions));
            });
      const entries = page.entries
        .map((entry) => hydrateIssueDocument(entry.value))
        .filter((issue) => matchesQuery(issue, query));

      return {
        entries,
        nextCursor: page.nextCursor,
      };
    });

  const recordsForIssue = (issueId: IssueId, query: RecordQuery = {}) =>
    Effect.gen(function* () {
      yield* validateSafe("issue id", issueId);
      const { records } = yield* issueCollections(store);
      const byIssue = yield* storage("open records issue index", records.index("issueId"));
      const entries = yield* storage("get records for issue", byIssue.get(issueId, query));

      return entries
        .map((entry) => hydrateLinkedRecord(entry.value))
        .filter(
          (record) => query.recordType === undefined || record.recordType === query.recordType,
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });

  const addRecord = <TPayload = unknown>(input: AddLinkedRecordInput<TPayload>) =>
    Effect.gen(function* () {
      const issue = yield* getIssue(input.issueId);

      if (issue === null) return yield* Effect.fail(issueNotFound(input.issueId));

      yield* assertNoUnsafeContent("record payload", input.payload);

      const actor = yield* identity.currentActor;
      const now = yield* nowIso;
      const recordId = makeRecordId(input.issueId, input.recordType, yield* ids.recordId);
      const record = makeRecord(input, recordId, actor, now);
      const nextIssue =
        input.userVisible === false
          ? issue
          : updateIssueDocument(issue, {
              ...issue.frontmatter,
              updatedAt: now,
            });
      const tx = yield* storage("begin add record", store.begin());
      const issues = yield* storage(
        "open issue transaction collection",
        tx.collection<IssueDocument>(ISSUE_COLLECTION, {
          indexes: [...ISSUE_INDEXES],
        }),
      );
      const records = yield* storage(
        "open record transaction collection",
        tx.collection<LinkedRecord>(RECORD_COLLECTION, {
          indexes: [...RECORD_INDEXES],
        }),
      );

      if (input.userVisible !== false) {
        yield* storage("put issue activity timestamp", issues.put(input.issueId, nextIssue));
      }

      yield* storage("put linked record", records.put(record.id, record));
      yield* storage(
        "commit add record",
        tx.commit({
          author: gitIdentity(actor),
          committer: gitIdentity(actor),
          message: `${actor.name} added ${input.recordType} record to issue ${input.issueId}`,
        }),
      );

      return record;
    });

  const createDraft = (input: CreateDraftInput) =>
    Effect.gen(function* () {
      yield* assertNoUnsafeContent("create draft input", input);

      const actor = yield* identity.currentActor;
      const now = yield* nowIso;
      const issueId = yield* ids.issueId;
      const draftId = yield* ids.draftId;
      const issue = makeIssueDocument(
        makeFrontmatter(
          {
            ...input,
            status: input.status ?? "backlog",
          },
          issueId,
          actor,
          now,
        ),
        input.body ?? policy.defaultIssueBody(input),
      );
      const draft = makeDraft(draftId, issue, actor, now, input.source);

      yield* validateIssueDocument(issue);

      const { drafts } = yield* issueCollections(store);
      yield* storage(
        "put draft",
        drafts.put(draftId, draft, {
          author: gitIdentity(actor),
          committer: gitIdentity(actor),
          message: `${actor.name} created draft ${draftId}: ${issue.frontmatter.title}`,
        }),
      );

      return draft;
    });

  const updateDraft = (input: UpdateDraftInput) =>
    Effect.gen(function* () {
      const actor = yield* identity.currentActor;
      const now = yield* nowIso;
      const { drafts } = yield* issueCollections(store);
      const currentRaw = yield* storage("get draft", drafts.get(input.draftId));
      const current = currentRaw === null ? null : hydrateDraftSession(currentRaw);

      if (current === null) return yield* Effect.fail(draftNotFound(input.draftId));

      if (current.status === "committed" || current.status === "abandoned") {
        return yield* Effect.fail(draftNotCommittable(input.draftId, current.status));
      }

      const nextIssue = applyIssuePatch(
        current.issue,
        {
          body: input.body,
          frontmatter: input.frontmatter,
        },
        actor,
        now,
      );
      const next = {
        ...current,
        issue: nextIssue,
        status: input.status ?? current.status,
        updatedAt: now,
        updatedDate: updatedDateKey(now),
      };

      yield* validateIssueDocument(nextIssue);
      yield* storage(
        "put draft update",
        drafts.put(input.draftId, next, {
          author: gitIdentity(actor),
          committer: gitIdentity(actor),
          message: `${actor.name} updated draft ${input.draftId}`,
        }),
      );

      return next;
    });

  const commitDraft = (draftId: string) =>
    Effect.gen(function* () {
      const actor = yield* identity.currentActor;
      const now = yield* nowIso;
      const { drafts } = yield* issueCollections(store);
      const currentRaw = yield* storage("get draft", drafts.get(draftId));
      const current = currentRaw === null ? null : hydrateDraftSession(currentRaw);

      if (current === null) return yield* Effect.fail(draftNotFound(draftId));

      if (current.status !== "open" && current.status !== "ready") {
        return yield* Effect.fail(draftNotCommittable(draftId, current.status));
      }

      yield* validateIssueDocument(current.issue);

      const committedDraft = {
        ...current,
        status: "committed" as const,
        updatedAt: now,
        updatedDate: updatedDateKey(now),
      };
      const provenanceId = makeRecordId(current.issue.id, "provenance", yield* ids.recordId);
      const tx = yield* storage("begin commit draft", store.begin());
      const issueTx = yield* storage(
        "open issue transaction collection",
        tx.collection<IssueDocument>(ISSUE_COLLECTION, {
          indexes: [...ISSUE_INDEXES],
        }),
      );
      const recordTx = yield* storage(
        "open record transaction collection",
        tx.collection<LinkedRecord>(RECORD_COLLECTION, {
          indexes: [...RECORD_INDEXES],
        }),
      );
      const draftTx = yield* storage(
        "open draft transaction collection",
        tx.collection<DraftSession>(DRAFT_COLLECTION, {
          indexes: [...DRAFT_INDEXES],
        }),
      );

      yield* storage("put committed draft issue", issueTx.put(current.issue.id, current.issue));
      yield* storage("put committed draft marker", draftTx.put(draftId, committedDraft));
      yield* storage(
        "put committed draft provenance",
        recordTx.put(
          provenanceId,
          initialProvenanceRecord(current.issue.id, provenanceId, actor, now),
        ),
      );

      for (const record of current.records) {
        yield* storage("put draft linked record", recordTx.put(record.id, record));
      }

      yield* storage(
        "commit draft",
        tx.commit({
          author: gitIdentity(actor),
          committer: gitIdentity(actor),
          message: `${actor.name} committed draft ${draftId}: ${current.issue.frontmatter.title}`,
        }),
      );

      return current.issue;
    });

  const issueHistory = (id: IssueId, options: HistoryOptions = {}) =>
    Effect.gen(function* () {
      yield* validateSafe("issue id", id);
      const snapshots = yield* storage(
        "read issue history",
        store.history(options.from, {
          max: options.max,
        }),
      );
      const { issues } = yield* issueCollections(store);
      const entries = [];
      let previous: IssueDocument | null | undefined;

      for (const snapshot of snapshots) {
        const rawIssue = yield* storage(
          "read historical issue",
          issues.get(id, { from: snapshot.id }),
        );
        const issue = rawIssue === null ? null : hydrateIssueDocument(rawIssue);
        const changed = JSON.stringify(issue) !== JSON.stringify(previous);

        if (changed) {
          entries.push({
            issue,
            snapshotId: snapshot.id,
          });
        }

        previous = issue;
      }

      return {
        entries,
        issueId: id,
      };
    });

  return {
    addRecord,
    commitDraft,
    createDraft,
    createIssue,
    getIssue,
    issueHistory,
    listIssues,
    recordsForIssue,
    transitionIssue,
    updateDraft,
    updateIssue,
  };
};

const matchesQuery = (issue: IssueDocument, query: IssueQuery): boolean =>
  (query.status === undefined || issue.status === normalizeKey(query.status)) &&
  (query.priority === undefined || issue.priority === normalizeKey(query.priority)) &&
  (query.type === undefined || issue.type === normalizeKey(query.type)) &&
  (query.assignee === undefined || issue.assignee === normalizeKey(query.assignee)) &&
  (query.parent === undefined || issue.parent === normalizeKey(query.parent)) &&
  (query.label === undefined || issue.labels?.includes(normalizeKey(query.label)) === true);
