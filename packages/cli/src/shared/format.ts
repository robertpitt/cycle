export const formatRepository = (repository: Record<string, unknown>): string =>
  `${stringField(repository, "repositoryId", "unknown")} ${stringField(repository, "status", "unknown")}`;

export const issueId = (issue: Record<string, unknown>): string =>
  stringField(issue, "id", "unknown");

export const issueTitle = (issue: Record<string, unknown>): string => {
  const frontmatter = issue.frontmatter;
  if (typeof frontmatter === "object" && frontmatter !== null && "title" in frontmatter) {
    const title = frontmatter.title;
    if (typeof title === "string") return title;
  }

  return stringField(issue, "title", "untitled");
};

export const issueStatus = (issue: Record<string, unknown>): string =>
  stringField(issue, "status", "unknown");

export const stringField = (record: unknown, field: string, fallback: string): string => {
  if (typeof record !== "object" || record === null || !(field in record)) return fallback;

  const value = record[field as keyof typeof record];

  return typeof value === "string" ? value : fallback;
};

export const capitalize = (value: string): string =>
  `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
