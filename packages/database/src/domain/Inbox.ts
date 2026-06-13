import { createHash } from "node:crypto";

export type InboxReason = "assigned" | "comment_assigned" | "comment_created" | "mention";

export type InboxStatus = "archived" | "read" | "snoozed" | "unread";

export type InboxSourceState = "active" | "source_archived" | "source_deleted";

export type InboxActor = {
  readonly email?: string;
  readonly name?: string;
};

export type InboxItem = {
  readonly actorEmail?: string;
  readonly actorName?: string;
  readonly bodyExcerpt?: string;
  readonly createdAt: string;
  readonly eventPath: string;
  readonly itemId: string;
  readonly metadataJson?: string;
  readonly reason: InboxReason;
  readonly recordId?: string;
  readonly repositoryId: string;
  readonly sequence: number;
  readonly snapshotId: string;
  readonly ticketId: string;
  readonly title: string;
  readonly userId: string;
};

export type InboxEntry = {
  readonly actor: InboxActor;
  readonly bodyExcerpt?: string;
  readonly createdAt: string;
  readonly eventPath: string;
  readonly itemId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly reason: InboxReason;
  readonly recordId?: string;
  readonly repositoryId: string;
  readonly sequence: number;
  readonly snapshotId: string;
  readonly sourceState: InboxSourceState;
  readonly status: InboxStatus;
  readonly ticketId: string;
  readonly title: string;
  readonly updatedAt?: string;
};

export type InboxQuery = {
  readonly createdAfter?: string;
  readonly createdBefore?: string;
  readonly cursor?: string;
  readonly includeSourceInactive?: boolean;
  readonly limit?: number;
  readonly reason?: InboxReason;
  readonly repositoryIds?: ReadonlyArray<string>;
  readonly status?: InboxStatus | "all";
  readonly ticketId?: string;
  readonly userId: string;
};

export type InboxPage = {
  readonly activeSnapshotIds: Readonly<Record<string, string | null>>;
  readonly entries: ReadonlyArray<InboxEntry>;
  readonly nextCursor?: string;
};

export type InboxRepositorySummary = {
  readonly activeSnapshotId: string | null;
  readonly repositoryId: string;
  readonly status: string;
  readonly warningCount: number;
};

export type InboxSummary = {
  readonly archivedCount: number;
  readonly byReason: Readonly<Record<string, number>>;
  readonly byRepository: Readonly<Record<string, number>>;
  readonly latestItemTimestamp?: string;
  readonly readCount: number;
  readonly repositories: ReadonlyArray<InboxRepositorySummary>;
  readonly unreadCount: number;
};

export type InboxMutationInput = {
  readonly allowMissing?: boolean;
  readonly itemIds: ReadonlyArray<string>;
  readonly userId: string;
};

export type InboxMutationResult = {
  readonly matchedCount: number;
  readonly missingItemIds: ReadonlyArray<string>;
  readonly status: InboxStatus;
  readonly updatedCount: number;
};

export type MentionTag = {
  readonly index: number;
  readonly normalized: string;
  readonly tag: string;
  readonly value: string;
};

export type InboxItemIdInput = {
  readonly eventPath: string;
  readonly reason: InboxReason;
  readonly recordId?: string;
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly userId: string;
};

export const deriveInboxItemId = (input: InboxItemIdInput): string => {
  const hash = createHash("sha256")
    .update(input.repositoryId)
    .update("\0")
    .update(input.userId)
    .update("\0")
    .update(input.eventPath)
    .update("\0")
    .update(input.ticketId)
    .update("\0")
    .update(input.recordId ?? "")
    .update("\0")
    .update(input.reason)
    .digest("base64url")
    .slice(0, 32);

  return `inb_${hash}`;
};

export const normalizeMentionValue = (value: string): string =>
  value.trim().replace(/^@/u, "").toLowerCase();

export const extractMentionTags = (markdown: string): ReadonlyArray<MentionTag> => {
  const searchable = stripMarkdownCode(markdown);
  const mentions: MentionTag[] = [];
  const seen = new Set<string>();
  const pattern =
    /(^|[^\p{L}\p{N}_@.-])@([A-Za-z0-9][A-Za-z0-9._+-]*(?:@[A-Za-z0-9][A-Za-z0-9.-]*)?)/gu;

  for (const match of searchable.matchAll(pattern)) {
    const prefix = match[1] ?? "";
    const rawValue = trimMentionPunctuation(match[2] ?? "");
    const normalized = normalizeMentionValue(rawValue);

    if (normalized.length === 0 || seen.has(normalized)) continue;

    seen.add(normalized);
    mentions.push({
      index: match.index + prefix.length,
      normalized,
      tag: `@${rawValue}`,
      value: rawValue,
    });
  }

  return mentions;
};

const stripMarkdownCode = (markdown: string): string =>
  markdown
    .replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(?:\n\2[ \t]*(?=\n|$)|$)/gu, (match) =>
      " ".repeat(match.length),
    )
    .replace(/`[^`\r\n]*`/gu, (match) => " ".repeat(match.length));

const trimMentionPunctuation = (value: string): string => value.replace(/[.,;:!?)}\]]+$/u, "");
