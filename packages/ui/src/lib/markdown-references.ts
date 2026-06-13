export type CycleReferenceKind = "agent" | "commit" | "issue" | "repository" | "user";

export type CycleReference = {
  readonly id: string;
  readonly kind: CycleReferenceKind;
};

export const cycleReferenceSchemes = {
  agent: "cycle-agent:",
  commit: "cycle-commit:",
  issue: "cycle-issue:",
  repository: "cycle-repository:",
  user: "cycle-user:",
} as const satisfies Record<CycleReferenceKind, string>;

export const cycleReferenceProtocols = new Set(
  Object.values(cycleReferenceSchemes).map((scheme) => scheme.slice(0, -1)),
);

const issueReferencePattern = /(^|[\s(])#([A-Za-z0-9]{2,5}-[A-Za-z0-9]{5,})(?![\w-])/gu;
const userMentionPattern = /(^|[\s(])@([A-Za-z][A-Za-z0-9_-]{1,63})(?![\w-])/gu;
const repositoryReferencePattern =
  /(^|[\s(])repo:([A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?)(?![\w./-])/gu;
const commitReferencePattern = /(^|[\s(])commit:([a-f0-9]{7,64})(?![a-f0-9])/giu;

export const getCycleReferenceHref = (reference: CycleReference): string =>
  `${cycleReferenceSchemes[reference.kind]}${reference.id}`;

export const parseCycleReferenceHref = (href: string): CycleReference | null => {
  for (const [kind, scheme] of Object.entries(cycleReferenceSchemes) as Array<
    [CycleReferenceKind, string]
  >) {
    if (href.startsWith(scheme)) {
      const id = href.slice(scheme.length).trim();
      return id.length > 0 ? { id, kind } : null;
    }
  }

  return null;
};

const linkReference = (
  markdown: string,
  pattern: RegExp,
  kind: CycleReferenceKind,
  label: (id: string) => string,
  normalizeId: (id: string) => string = (id) => id,
): string =>
  markdown.replace(pattern, (_match, prefix: string, rawId: string) => {
    const id = normalizeId(rawId);
    return `${prefix}[${label(id)}](${getCycleReferenceHref({ id, kind })})`;
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
