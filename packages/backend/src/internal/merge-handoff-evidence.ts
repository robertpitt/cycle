import type { WorktreeHandoverTest } from "@cycle/git-worktrees";

export type MergeHandoffEvidence = {
  readonly artifacts: ReadonlyArray<string>;
  readonly knownLimitations: ReadonlyArray<string>;
  readonly tests: ReadonlyArray<WorktreeHandoverTest>;
  readonly validation?: string | undefined;
};

const markdownHeading = /^#{1,6}\s+(.+?)\s*$/u;
const boldHeading = /^\*\*(.+?)\*\*\s*:?\s*$/u;
const labelHeading = /^([A-Za-z][A-Za-z /-]+):\s*$/u;
const bullet = /^\s*(?:[-*+] |\d+[.)]\s+)(.+?)\s*$/u;

const normalizedHeading = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[*_`]/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

const sectionsFrom = (summary: string): ReadonlyMap<string, ReadonlyArray<string>> => {
  const sections = new Map<string, string[]>();
  let current = "summary";
  sections.set(current, []);
  for (const line of summary.split(/\r?\n/u)) {
    const headingName =
      markdownHeading.exec(line)?.[1] ??
      boldHeading.exec(line)?.[1] ??
      labelHeading.exec(line)?.[1];
    if (headingName !== undefined) {
      current = normalizedHeading(headingName);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    const item = bullet.exec(line)?.[1]?.trim();
    if (item !== undefined && item.length > 0) sections.get(current)?.push(item);
  }
  return sections;
};

const itemsFor = (
  sections: ReadonlyMap<string, ReadonlyArray<string>>,
  patterns: ReadonlyArray<RegExp>,
): ReadonlyArray<string> =>
  [...sections].flatMap(([name, items]) =>
    patterns.some((pattern) => pattern.test(name)) ? items : [],
  );

const testEvidence = (item: string): WorktreeHandoverTest => {
  const lower = item.toLowerCase();
  const status = /\b(fail(?:ed|ure)?|error|broken)\b/u.test(lower)
    ? "failed"
    : /\b(not run|skipped|unable|not available)\b/u.test(lower)
      ? "not_run"
      : "passed";
  const command = /`([^`]+)`/u.exec(item)?.[1];
  return {
    ...(command === undefined ? {} : { command }),
    result: item,
    status,
  };
};

export const mergeHandoffEvidenceFromSummary = (summary: string): MergeHandoffEvidence => {
  const sections = sectionsFrom(summary);
  const testItems = itemsFor(sections, [/^tests?$/u, /testing/u, /validation/u, /verification/u]);
  const artifacts = itemsFor(sections, [/artifacts?/u, /screenshots?/u]);
  const knownLimitations = itemsFor(sections, [/limitations?/u, /risks?/u, /follow[ -]?ups?/u]);
  return {
    artifacts,
    knownLimitations,
    tests: testItems.map(testEvidence),
    ...(testItems.length === 0 ? {} : { validation: testItems.join("\n") }),
  };
};
