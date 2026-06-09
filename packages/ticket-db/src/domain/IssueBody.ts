export const DEFAULT_PROTECTED_SECTIONS = [
  "Acceptance Criteria",
  "Implementation Plan",
  "Risks",
  "Test Plan",
] as const;

export const defaultIssueBody = (): string =>
  [
    "## Problem",
    "",
    "Describe the problem.",
    "",
    "## Context",
    "",
    "Add relevant repository or product context.",
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] Define the expected outcome.",
    "",
    "## Implementation Plan",
    "",
    "- Outline the implementation steps.",
    "",
    "## Risks",
    "",
    "- Note important risks.",
    "",
    "## Test Plan",
    "",
    "- Describe validation steps.",
    "",
    "## Agent Notes",
    "",
    "Add agent-facing notes when needed.",
    "",
  ].join("\n");

export const extractSection = (body: string, heading: string): string => {
  const lines = body.split(/\r?\n/u);
  const headingKey = heading.trim().toLowerCase();
  const start = lines.findIndex((line) => {
    const match = /^##\s+(.+?)\s*$/u.exec(line);

    return match?.[1]?.trim().toLowerCase() === headingKey;
  });

  if (start === -1) return "";

  const content = [];

  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/u.test(lines[index] ?? "")) break;

    content.push(lines[index]);
  }

  return content.join("\n").trim();
};

export const hasSectionContent = (body: string, heading: string): boolean =>
  extractSection(body, heading)
    .split("\n")
    .some((line) => {
      const trimmed = line.trim();

      return trimmed.length > 0 && trimmed !== "- [ ]" && trimmed !== "-";
    });

export const protectedSectionsChanged = (
  before: string,
  after: string,
  sections: ReadonlyArray<string> = DEFAULT_PROTECTED_SECTIONS,
): ReadonlyArray<string> =>
  sections.filter((section) => extractSection(before, section) !== extractSection(after, section));
