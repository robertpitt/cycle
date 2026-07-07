export type AgentIdGenerator = (prefix: string) => string;

export const makeRandomId = (prefix: string): string => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid !== undefined) return `${prefix}_${randomUuid}`;
  return makeTimestampRandomId(prefix);
};

export const makeTimestampRandomId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

