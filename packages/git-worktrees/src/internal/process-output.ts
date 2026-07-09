export const bytesToString = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

export const boundedOutput = (value: string, maxLength = 8_192): string => {
  const normalized = value.replace(/\p{C}+/gu, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
};

export const redactEnvironment = (
  environment: Readonly<Record<string, string>>,
  redactedKeys: readonly string[] = [],
): Record<string, string> => {
  const keySet = new Set(redactedKeys.map((key) => key.toLowerCase()));
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(environment)) {
    const lower = key.toLowerCase();
    const secretLike =
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("password") ||
      lower.includes("credential") ||
      lower.includes("key");

    output[key] = keySet.has(lower) || secretLike ? "<redacted>" : value;
  }

  return output;
};
