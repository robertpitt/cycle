import type { Effect } from "effect";
import type {
  CommentDocument,
  PageDocument,
  PageHistoryEntry,
} from "@cycle/contracts/schemas";
import type { CommentEventPayload, PageEventPayload } from "../PageEvent.ts";
import {
  type Actor,
  type CycleRepositoryMetadata,
  type IssueFrontmatter,
  type IssueTemplateDocument,
  type LabelDefinitionDocument,
  type LinkedRecord,
  type MaterializationWarning,
  type SavedViewDocument,
  type TicketDocument,
  type TicketDraftDocument,
  type UserProfileDocument,
} from "../domain/index.ts";
import type { DatabaseFailure } from "../DatabaseErrors.ts";
import type { RepositorySnapshot, RepositoryStoreShape } from "../RepositoryStore.ts";

export type RepositoryRuntime = {
  readonly cycleMetadata?: CycleRepositoryMetadata;
  readonly displayName: string;
  readonly gitDir?: string;
  readonly repositoryId: string;
  readonly store: RepositoryStoreShape;
  readonly worktreePath?: string;
};

export type CommitChange = {
  readonly changeType: "added" | "deleted" | "modified";
  readonly objectId?: string;
  readonly objectType: string;
  readonly path: string;
  readonly ticketId?: string;
};

export type DatabaseEventPayload =
  | PageEventPayload
  | CommentEventPayload
  | {
      readonly op: "repository.metadata.set";
      readonly value: CycleRepositoryMetadata;
    }
  | {
      readonly op: "ticket.create" | "ticket.replace";
      readonly value: TicketDocument;
    }
  | {
      readonly field: keyof IssueFrontmatter | "body";
      readonly op: "ticket.update";
      readonly value: unknown;
    }
  | {
      readonly op: "ticket.archive" | "ticket.delete" | "ticket.restore";
      readonly reason?: string;
    }
  | {
      readonly op: "record.add";
      readonly value: LinkedRecord;
    }
  | {
      readonly op: "draft.create" | "draft.update" | "draft.commit";
      readonly value: TicketDraftDocument;
    }
  | {
      readonly op: "user.upsert";
      readonly value: UserProfileDocument;
    }
  | {
      readonly op: "label.upsert";
      readonly value: LabelDefinitionDocument;
    }
  | {
      readonly op: "view.upsert";
      readonly value: SavedViewDocument;
    }
  | {
      readonly op: "view.delete";
    }
  | {
      readonly op: "template.upsert";
      readonly value: IssueTemplateDocument;
    };

export type FoldedEvents = {
  readonly changedComments: Set<string>;
  readonly changedLabels: Set<string>;
  readonly changedPages: Set<string>;
  readonly changedRecords: Set<string>;
  readonly changedTemplates: Set<string>;
  readonly changedTickets: Set<string>;
  readonly changedUsers: Set<string>;
  readonly changedViews: Set<string>;
  readonly commitChanges: Array<{
    readonly changes: ReadonlyArray<CommitChange>;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }>;
  cycleMetadata?: CycleRepositoryMetadata;
  readonly comments: Map<string, CommentDocument>;
  readonly deletedLabels: Set<string>;
  readonly deletedRecords: Set<string>;
  readonly deletedTemplates: Set<string>;
  readonly deletedTickets: Set<string>;
  readonly deletedUsers: Set<string>;
  readonly deletedViews: Set<string>;
  readonly drafts: Map<string, TicketDraftDocument>;
  readonly inboxSources: Array<InboxSourceEvent>;
  readonly invalidPages: Set<string>;
  readonly labels: Map<string, LabelDefinitionDocument>;
  readonly nonAdditiveEvents: Array<{
    readonly path: string;
    readonly reason: "event-deleted" | "event-modified";
    readonly snapshotId: string;
  }>;
  readonly records: Map<string, LinkedRecord>;
  readonly pageHistory: Array<PageHistoryProjection>;
  readonly pages: Map<string, PageDocument>;
  readonly templates: Map<string, IssueTemplateDocument>;
  readonly tickets: Map<string, TicketDocument>;
  readonly users: Map<string, UserProfileDocument>;
  readonly views: Map<string, SavedViewDocument>;
  readonly warnings: ReadonlyArray<MaterializationWarning>;
};

export type EventContext = {
  readonly actor?: Actor;
  readonly message?: string;
  readonly parentIds: ReadonlyArray<string>;
  readonly path: string;
  readonly repositoryId: string;
  readonly snapshotId: string;
  readonly timestamp: string;
};

export type PageHistoryProjection = {
  readonly actor: PageHistoryEntry["actor"];
  readonly committedAt: string;
  readonly message?: string;
  readonly operation: PageHistoryEntry["operation"];
  readonly pageId: string;
  readonly parentIds: ReadonlyArray<string>;
  readonly path: string;
  readonly repositoryId: string;
  readonly snapshotId: string;
};

export type InboxSourceEvent =
  | {
      readonly actor?: Actor;
      readonly after: TicketDocument;
      readonly before: TicketDocument | null;
      readonly eventPath: string;
      readonly field?: keyof IssueFrontmatter | "body";
      readonly op: "ticket.create" | "ticket.replace" | "ticket.update";
      readonly sequence: number;
      readonly snapshotId: string;
      readonly timestamp: string;
      readonly ticketId: string;
    }
  | {
      readonly actor?: Actor;
      readonly eventPath: string;
      readonly op: "record.add";
      readonly record: LinkedRecord;
      readonly sequence: number;
      readonly snapshotId: string;
      readonly timestamp: string;
      readonly ticket: TicketDocument | null;
    };

export type InboxSourceEventInput = InboxSourceEvent extends infer Source
  ? Source extends InboxSourceEvent
    ? Omit<Source, "sequence">
    : never
  : never;

export type MaterializationTrace = (
  message: string,
  data?: Readonly<Record<string, unknown>>,
) => Effect.Effect<void>;

export type GitIdentity = {
  readonly email: string;
  readonly name: string;
};

export type DatabaseTransaction = {
  readonly abort: Effect.Effect<void, DatabaseFailure>;
  readonly appendEvent: (input: {
    readonly aggregateId: string;
    readonly aggregateType: string;
    readonly eventId: string;
    readonly payload: DatabaseEventPayload;
  }) => Effect.Effect<string, DatabaseFailure>;
  readonly commit: (options: {
    readonly author?: GitIdentity;
    readonly committer?: GitIdentity;
    readonly message: string;
  }) => Effect.Effect<RepositorySnapshot, DatabaseFailure>;
};
