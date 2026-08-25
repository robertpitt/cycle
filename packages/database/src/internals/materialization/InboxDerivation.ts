import {
  deriveInboxItemId,
  extractMentionTags,
  normalizeKey,
  stripUndefined,
  type Actor,
  type InboxItem,
  type InboxReason,
  type TicketDocument,
  type UserProfileDocument,
} from "../../domain/index.ts";
import { commentPayloadBody } from "../commands/TicketCommandRules.ts";
import type { FoldedEvents, InboxSourceEvent } from "../DatabaseRuntime.ts";
export type InboxRecipient = {
  readonly user: UserProfileDocument;
  readonly userId: string;
};

export const mergeUsers = (
  ...groups: ReadonlyArray<ReadonlyArray<UserProfileDocument>>
): ReadonlyArray<UserProfileDocument> => {
  const users = new Map<string, UserProfileDocument>();

  for (const group of groups) {
    for (const user of group) {
      users.set(user.id, user);
    }
  }

  return [...users.values()];
};

export const inboxRecipientLookupKeys = (folded: FoldedEvents): ReadonlyArray<string> => {
  const keys = new Set<string>();
  const add = (value: string | undefined): void => {
    if (value === undefined) return;
    for (const key of recipientLookupKeys(value)) {
      keys.add(key);
    }
  };
  const addActor = (actor: Actor | undefined): void => {
    add(actor?.email);
    add(actor?.name);
  };

  for (const source of folded.inboxSources) {
    if (
      source.op === "ticket.create" ||
      source.op === "ticket.update" ||
      source.op === "ticket.replace"
    ) {
      for (const mention of extractMentionTags(ticketMentionText(source.after))) {
        add(mention.normalized);
      }
      add(inboxAssigneeValue(source.after));
      continue;
    }

    if (source.op === "record.add" && normalizeKey(source.record.recordType) === "comment") {
      const ticket = source.ticket ?? folded.tickets.get(source.record.issueId);
      const body = commentPayloadBody(source.record.payload);

      for (const mention of extractMentionTags(body)) {
        add(mention.normalized);
      }
      if (ticket !== undefined && ticket !== null) {
        add(inboxAssigneeValue(ticket));
        addActor(ticket.frontmatter.createdBy);
      }
    }
  }

  return [...keys];
};

export const deriveInboxItems = (
  repositoryId: string,
  folded: FoldedEvents,
  users: ReadonlyArray<UserProfileDocument>,
): ReadonlyArray<InboxItem> => {
  const resolver = makeInboxRecipientResolver(users);
  const items = new Map<string, InboxItem>();

  const addItem = (
    source: InboxSourceEvent,
    recipient: InboxRecipient,
    reason: InboxReason,
    ticket: TicketDocument,
    options: {
      readonly bodyExcerpt?: string;
      readonly mention?: string;
      readonly recordId?: string;
    } = {},
  ): void => {
    if (!ticketActive(ticket)) return;
    if (sourceAuthoredByRecipient(source, recipient.userId)) return;

    const itemId = deriveInboxItemId({
      eventPath: source.eventPath,
      reason,
      recordId: options.recordId,
      repositoryId,
      ticketId: ticket.id,
      userId: recipient.userId,
    });
    const metadata = stripUndefined({
      actorUnknown: source.actor === undefined,
      mention: options.mention,
      sourceOperation: source.op,
    }) as Readonly<Record<string, unknown>>;

    if (items.has(itemId)) return;

    items.set(
      itemId,
      stripUndefined({
        actorEmail: source.actor?.email,
        actorName: source.actor?.name,
        bodyExcerpt: options.bodyExcerpt,
        createdAt: source.timestamp,
        eventPath: source.eventPath,
        itemId,
        metadataJson: JSON.stringify(metadata),
        reason,
        recordId: options.recordId,
        repositoryId,
        sequence: source.sequence,
        snapshotId: source.snapshotId,
        ticketId: ticket.id,
        title: ticket.title,
        userId: recipient.userId,
      }) as InboxItem,
    );
  };

  for (const source of folded.inboxSources) {
    if (
      source.op === "ticket.create" ||
      source.op === "ticket.update" ||
      source.op === "ticket.replace"
    ) {
      const beforeMentions =
        source.before === null ? new Set<string>() : mentionSet(ticketMentionText(source.before));
      const afterMentions = extractMentionTags(ticketMentionText(source.after));

      for (const mention of afterMentions) {
        if (beforeMentions.has(mention.normalized)) continue;
        for (const recipient of resolver.resolveMention(mention.normalized)) {
          addItem(source, recipient, "mention", source.after, {
            bodyExcerpt: excerptForTicket(source.after),
            mention: mention.tag,
          });
        }
      }

      const beforeAssignee = source.before === null ? undefined : inboxAssigneeValue(source.before);
      const afterAssignee = inboxAssigneeValue(source.after);

      if (afterAssignee !== undefined && afterAssignee !== beforeAssignee) {
        for (const recipient of resolver.resolveAssignee(afterAssignee)) {
          addItem(source, recipient, "assigned", source.after, {
            bodyExcerpt: excerptForTicket(source.after),
          });
        }
      }

      continue;
    }

    if (source.op === "record.add" && normalizeKey(source.record.recordType) === "comment") {
      const ticket = source.ticket ?? folded.tickets.get(source.record.issueId);
      if (ticket === undefined || ticket === null) continue;

      const body = commentPayloadBody(source.record.payload);
      const excerpt = excerptForText(body);

      for (const mention of extractMentionTags(body)) {
        for (const recipient of resolver.resolveMention(mention.normalized)) {
          addItem(source, recipient, "mention", ticket, {
            bodyExcerpt: excerpt,
            mention: mention.tag,
            recordId: source.record.id,
          });
        }
      }

      const assignee = inboxAssigneeValue(ticket);
      if (assignee !== undefined) {
        for (const recipient of resolver.resolveAssignee(assignee)) {
          addItem(source, recipient, "comment_assigned", ticket, {
            bodyExcerpt: excerpt,
            recordId: source.record.id,
          });
        }
      }

      for (const recipient of resolver.resolveActor(ticket.frontmatter.createdBy)) {
        addItem(source, recipient, "comment_created", ticket, {
          bodyExcerpt: excerpt,
          recordId: source.record.id,
        });
      }
    }
  }

  return [...items.values()].sort(
    (a, b) => a.sequence - b.sequence || a.itemId.localeCompare(b.itemId),
  );
};

export const makeInboxRecipientResolver = (users: ReadonlyArray<UserProfileDocument>) => {
  const lookup = new Map<string, Map<string, UserProfileDocument>>();

  const add = (key: string, user: UserProfileDocument): void => {
    for (const normalized of recipientLookupKeys(key)) {
      const current = lookup.get(normalized) ?? new Map<string, UserProfileDocument>();
      current.set(user.id, user);
      lookup.set(normalized, current);
    }
  };

  for (const user of users) {
    if (user.disabledAt !== undefined) continue;

    add(user.id, user);
    add(user.email, user);
    add(user.displayName, user);
    for (const alias of user.aliases ?? []) {
      add(alias, user);
    }
  }

  const resolve = (value: string | undefined): ReadonlyArray<InboxRecipient> => {
    if (value === undefined) return [];

    const matches = new Map<string, UserProfileDocument>();
    for (const key of recipientLookupKeys(value)) {
      for (const [userId, user] of lookup.get(key) ?? []) {
        matches.set(userId, user);
      }
    }

    if (matches.size !== 1) return [];

    const [entry] = matches;
    if (entry === undefined) return [];

    return [{ user: entry[1], userId: entry[0] }];
  };

  return {
    resolveActor: (actor: Actor): ReadonlyArray<InboxRecipient> =>
      resolve(actor.email ?? actor.name),
    resolveAssignee: resolve,
    resolveMention: resolve,
  };
};

export const recipientLookupKeys = (value: string): ReadonlyArray<string> => {
  const raw = value.trim().replace(/^@/u, "").toLowerCase();
  if (raw.length === 0) return [];

  const keys = new Set<string>([raw, normalizeKey(raw)]);

  if (/\s/u.test(raw)) {
    keys.add(raw.replace(/\s+/gu, "."));
    keys.add(raw.replace(/\s+/gu, "-"));
    keys.add(raw.replace(/\s+/gu, ""));
  }

  return [...keys].filter((key) => key.length > 0 && key !== "none");
};

export const ticketMentionText = (ticket: TicketDocument): string =>
  `${ticket.title}\n${ticket.body}`;

export const mentionSet = (value: string): Set<string> =>
  new Set(extractMentionTags(value).map((mention) => mention.normalized));

export const inboxAssigneeValue = (ticket: TicketDocument): string | undefined => {
  const value = ticket.frontmatter.assignee ?? ticket.assignee;
  if (value === null || value === undefined) return undefined;

  const normalized = String(value).trim();
  return normalized.length === 0 || normalizeKey(normalized) === "none" ? undefined : normalized;
};

export const ticketActive = (ticket: TicketDocument): boolean =>
  ticket.archivedAt === undefined && ticket.deletedAt === undefined;

export const sourceAuthoredByRecipient = (source: InboxSourceEvent, userId: string): boolean => {
  const actorEmail = source.actor?.email?.trim().toLowerCase();
  return actorEmail !== undefined && actorEmail === userId.toLowerCase();
};

export const excerptForTicket = (ticket: TicketDocument): string | undefined =>
  excerptForText(ticket.body);

export const excerptForText = (value: string): string | undefined => {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length === 0) return undefined;
  if (compact.length <= 180) return compact;

  return `${compact.slice(0, 177).trimEnd()}...`;
};
