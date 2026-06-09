import type { DraftId } from "../schemas/DraftId.ts";
import type { DraftSession } from "../schemas/DraftSession.ts";
import type { DraftStatus } from "../schemas/DraftStatus.ts";
import type { ExternalLink } from "../schemas/ExternalLink.ts";
import type { IssueDocument } from "../schemas/IssueDocument.ts";
import type { IssueFrontmatter } from "../schemas/IssueFrontmatter.ts";
import type { IssueId } from "../schemas/IssueId.ts";
import type { IssuePriority } from "../schemas/IssuePriority.ts";
import type { IssueStatus } from "../schemas/IssueStatus.ts";
import type { IssueType } from "../schemas/IssueType.ts";
import type { LinkedRecord } from "../schemas/LinkedRecord.ts";
import type { RecordType } from "../schemas/RecordType.ts";

export type CreateIssueInput = {
  readonly assignee?: string | null;
  readonly body?: string;
  readonly externalLinks?: ReadonlyArray<ExternalLink>;
  readonly labels?: ReadonlyArray<string>;
  readonly parent?: IssueId | null;
  readonly planningNotRequired?: boolean;
  readonly priority?: IssuePriority;
  readonly repository?: string;
  readonly status?: IssueStatus;
  readonly title: string;
  readonly type?: IssueType;
};

export type UpdateIssueInput = {
  readonly body?: string;
  readonly frontmatter?: Partial<IssueFrontmatter> & Readonly<Record<string, unknown>>;
  readonly message?: string;
};

export type TransitionIssueInput = {
  readonly id: IssueId;
  readonly reason?: string;
  readonly status: IssueStatus;
};

export type AddLinkedRecordInput<TPayload = unknown> = {
  readonly issueId: IssueId;
  readonly payload: TPayload;
  readonly recordType: RecordType;
  readonly userVisible?: boolean;
};

export type CreateDraftInput = CreateIssueInput & {
  readonly source?: unknown;
};

export type UpdateDraftInput = {
  readonly body?: string;
  readonly draftId: DraftId;
  readonly frontmatter?: Partial<IssueFrontmatter> & Readonly<Record<string, unknown>>;
  readonly status?: DraftStatus;
};

export type ReadOptions = {
  readonly from?: string;
};

export type HistoryOptions = ReadOptions & {
  readonly max?: number;
};

export type IssueQuery = ReadOptions & {
  readonly assignee?: string | null;
  readonly cursor?: string;
  readonly label?: string;
  readonly limit?: number;
  readonly parent?: IssueId | null;
  readonly priority?: IssuePriority;
  readonly status?: IssueStatus;
  readonly type?: IssueType;
};

export type IssuePage = {
  readonly entries: ReadonlyArray<IssueDocument>;
  readonly nextCursor?: string;
};

export type RecordQuery = ReadOptions & {
  readonly recordType?: RecordType;
};

export type IssueHistoryEntry = {
  readonly issue: IssueDocument | null;
  readonly snapshotId: string;
};

export type IssueHistory = {
  readonly entries: ReadonlyArray<IssueHistoryEntry>;
  readonly issueId: IssueId;
};

export type CommitDraftResult = IssueDocument;
export type CreateDraftResult = DraftSession;
export type LinkedRecordList = ReadonlyArray<LinkedRecord>;
