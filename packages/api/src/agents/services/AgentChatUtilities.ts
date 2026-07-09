export const parseAgentMentions = (body: string): ReadonlyArray<string> => {
  const ids = new Set<string>();
  const pattern = /\bcycle-agent:([A-Za-z0-9][A-Za-z0-9._-]{0,127})\b/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    if (match[1] !== undefined) ids.add(match[1]);
  }
  return [...ids];
};

export const idFromResult = (value: unknown, fallback: string): string => {
  if (typeof value !== "object" || value === null) return fallback;
  const record = value as Readonly<Record<string, unknown>>;
  for (const key of ["id", "recordId", "commentId"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return fallback;
};
