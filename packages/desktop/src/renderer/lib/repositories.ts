import { defaultRepositoryPreferences, type RepositoryRecord } from "@cycle/config";

export const makeFallbackRepository = (path: string): RepositoryRecord => {
  const trimmed = path.trim();
  const displayName = trimmed.split(/[\\/]/u).filter(Boolean).at(-1) ?? trimmed;

  return {
    addedAt: new Date().toISOString(),
    displayName,
    id: `repo_${Math.abs(
      Array.from(trimmed).reduce((hash, char) => hash * 31 + char.charCodeAt(0), 7),
    )}`,
    path: trimmed,
    preferences: defaultRepositoryPreferences(),
  };
};
