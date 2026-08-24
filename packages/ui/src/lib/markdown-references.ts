export type CycleReferenceKind = "agent" | "commit" | "issue" | "page" | "repository" | "user";
export type LegacyCycleReferenceKind = Exclude<CycleReferenceKind, "page">;

export type CycleReference =
  | {
      readonly id: string;
      readonly kind: "agent" | "commit" | "user";
    }
  | {
      readonly id: string;
      readonly kind: "issue";
      readonly repositoryId?: string;
    }
  | {
      readonly id: string;
      readonly kind: "page";
      readonly repositoryId: string;
    }
  | {
      readonly id: string;
      readonly kind: "repository";
      readonly repositoryId?: string;
    };

export const cycleReferenceSchemes = {
  agent: "cycle-agent:",
  commit: "cycle-commit:",
  issue: "cycle-issue:",
  repository: "cycle-repository:",
  user: "cycle-user:",
} as const satisfies Record<LegacyCycleReferenceKind, string>;

export const cycleReferenceProtocols = new Set(
  Object.values(cycleReferenceSchemes).map((scheme) => scheme.slice(0, -1)),
);

const issueReferencePattern = /(^|[\s(])#([A-Za-z0-9]{2,5}-[A-Za-z0-9]{5,})(?![\w-])/gu;
const userMentionPattern = /(^|[\s(])@([A-Za-z][A-Za-z0-9_-]{1,63})(?![\w-])/gu;
const repositoryReferencePattern =
  /(^|[\s(])repo:([A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?)(?![\w./-])/gu;
const commitReferencePattern = /(^|[\s(])commit:([a-f0-9]{7,64})(?![a-f0-9])/giu;

const canonicalCycleReferencePattern =
  /^cycle:\/\/repository\/([^/?#]+)(?:\/(tickets|pages)\/([^/?#]+))?$/u;
const isUnsafeIdentifierCharacter = (character: string): boolean => {
  const codePoint = character.codePointAt(0);
  return character === "\\" || codePoint === undefined || codePoint <= 31 || codePoint === 127;
};

const decodeIdentifier = (value: string): string | undefined => {
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.length === 0 ||
      Array.from(decoded).length > 256 ||
      decoded.includes("/") ||
      Array.from(decoded).some(isUnsafeIdentifierCharacter)
    ) {
      return undefined;
    }
    return decoded;
  } catch {
    return undefined;
  }
};

const parseCanonicalCycleReferenceHref = (href: string): CycleReference | null => {
  const match = canonicalCycleReferencePattern.exec(href);
  if (!match) return null;

  const repositoryId = match[1] === undefined ? undefined : decodeIdentifier(match[1]);
  if (repositoryId === undefined) return null;

  const resourceKind = match[2];
  if (resourceKind === undefined) {
    return { id: repositoryId, kind: "repository", repositoryId };
  }

  const resourceId = match[3] === undefined ? undefined : decodeIdentifier(match[3]);
  if (resourceId === undefined) return null;

  return resourceKind === "tickets"
    ? { id: resourceId, kind: "issue", repositoryId }
    : { id: resourceId, kind: "page", repositoryId };
};

export const getCycleReferenceHref = (reference: CycleReference): string => {
  if (reference.kind === "page") {
    return `cycle://repository/${encodeURIComponent(reference.repositoryId)}/pages/${encodeURIComponent(reference.id)}`;
  }
  if (reference.kind === "issue" && reference.repositoryId !== undefined) {
    return `cycle://repository/${encodeURIComponent(reference.repositoryId)}/tickets/${encodeURIComponent(reference.id)}`;
  }
  if (reference.kind === "repository") {
    return `cycle://repository/${encodeURIComponent(reference.repositoryId ?? reference.id)}`;
  }
  return `${cycleReferenceSchemes[reference.kind]}${reference.id}`;
};

const referenceFromLegacyKind = (kind: LegacyCycleReferenceKind, id: string): CycleReference => {
  switch (kind) {
    case "agent":
      return { id, kind: "agent" };
    case "commit":
      return { id, kind: "commit" };
    case "issue":
      return { id, kind: "issue" };
    case "repository":
      return { id, kind: "repository" };
    case "user":
      return { id, kind: "user" };
  }
};

export const parseCycleReferenceHref = (href: string): CycleReference | null => {
  const canonical = parseCanonicalCycleReferenceHref(href);
  if (canonical !== null) return canonical;

  for (const [kind, scheme] of Object.entries(cycleReferenceSchemes) as Array<
    [LegacyCycleReferenceKind, string]
  >) {
    if (href.startsWith(scheme)) {
      const id = href.slice(scheme.length).trim();
      return id.length > 0 ? referenceFromLegacyKind(kind, id) : null;
    }
  }

  return null;
};

const cycleReferenceMarkdownLinkPattern = /^\[([^\]\n]+)\]\(([^()\s]+)\)$/u;
const nestedCycleReferenceMarkdownLinkPattern = /\[\[([^\]\n]+)\]\(([^()\s]+)\)\]\(([^()\s]+)\)/gu;

export const isSameCycleReference = (first: CycleReference, second: CycleReference): boolean =>
  first.kind === second.kind &&
  first.id === second.id &&
  ("repositoryId" in first ? first.repositoryId : undefined) ===
    ("repositoryId" in second ? second.repositoryId : undefined);

export const parseCycleReferenceMarkdownLink = (
  markdown: string,
): { readonly label: string; readonly reference: CycleReference } | null => {
  const match = cycleReferenceMarkdownLinkPattern.exec(markdown.trim());
  if (!match) return null;

  const label = match[1];
  const href = match[2];
  if (!label || !href) return null;

  const reference = parseCycleReferenceHref(href);
  return reference ? { label, reference } : null;
};

export const unwrapNestedCycleReferenceMarkdownLinks = (markdown: string): string =>
  markdown.replace(
    nestedCycleReferenceMarkdownLinkPattern,
    (match: string, label: string, innerHref: string, outerHref: string) => {
      const innerReference = parseCycleReferenceHref(innerHref);
      const outerReference = parseCycleReferenceHref(outerHref);
      if (
        !innerReference ||
        !outerReference ||
        !isSameCycleReference(innerReference, outerReference)
      ) {
        return match;
      }

      return `[${label}](${outerHref})`;
    },
  );

const linkReference = (
  markdown: string,
  pattern: RegExp,
  kind: LegacyCycleReferenceKind,
  label: (id: string) => string,
  normalizeId: (id: string) => string = (id) => id,
): string =>
  markdown.replace(pattern, (_match, prefix: string, rawId: string) => {
    const id = normalizeId(rawId);
    return `${prefix}[${label(id)}](${getCycleReferenceHref(referenceFromLegacyKind(kind, id))})`;
  });

export const linkCycleReferenceShorthand = (markdown: string): string => {
  const withIssueLinks = linkReference(
    markdown,
    issueReferencePattern,
    "issue",
    (id) => `#${id}`,
    (id) => id.toUpperCase(),
  );
  const withUserLinks = linkReference(withIssueLinks, userMentionPattern, "user", (id) => `@${id}`);
  const withRepositoryLinks = linkReference(
    withUserLinks,
    repositoryReferencePattern,
    "repository",
    (id) => `repo:${id}`,
  );

  return linkReference(
    withRepositoryLinks,
    commitReferencePattern,
    "commit",
    (id) => `commit:${id}`,
    (id) => id.toLowerCase(),
  );
};
