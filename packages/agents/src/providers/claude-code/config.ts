import type { JsonObject, JsonSchema } from "../../types.ts";

export type ClaudeCodePermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk"
  | "auto";

export type ClaudeCodeProviderConfig = {
  readonly executablePath?: string | null;
  readonly maxTurns?: number | null;
  readonly permissionMode?: ClaudeCodePermissionMode;
  readonly sdkOptions?: JsonObject;
  readonly systemPromptMode?: "cycle-default" | "provider-default";
};

export const claudeCodeConfigurationSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    executablePath: {
      description: "Optional path to a Claude Code executable. Leave empty to use SDK discovery.",
      type: ["string", "null"],
    },
    maxTurns: {
      description: "Maximum Claude Code agent turns for a run. Leave empty for the SDK default.",
      minimum: 1,
      type: ["integer", "null"],
    },
    permissionMode: {
      description: "Claude Code permission mode. The default preserves provider-native behavior.",
      enum: ["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk", "auto"],
      type: "string",
    },
    sdkOptions: {
      additionalProperties: true,
      description:
        "Redacted non-secret SDK options reserved for future provider-specific settings.",
      type: "object",
    },
    systemPromptMode: {
      enum: ["cycle-default", "provider-default"],
      type: "string",
    },
  },
  type: "object",
};

export const defaultClaudeCodeProviderConfig = (): ClaudeCodeProviderConfig => ({
  executablePath: null,
  maxTurns: null,
  permissionMode: "default",
  sdkOptions: {},
  systemPromptMode: "cycle-default",
});

export const decodeClaudeCodeProviderConfig = (value: unknown): ClaudeCodeProviderConfig => {
  if (!isRecord(value)) return defaultClaudeCodeProviderConfig();

  const permissionMode = isClaudeCodePermissionMode(value.permissionMode)
    ? value.permissionMode
    : "default";
  const executablePath =
    typeof value.executablePath === "string" && value.executablePath.trim().length > 0
      ? value.executablePath.trim()
      : null;
  const maxTurns =
    typeof value.maxTurns === "number" && Number.isInteger(value.maxTurns) && value.maxTurns >= 1
      ? value.maxTurns
      : null;
  const sdkOptions = isJsonObject(value.sdkOptions) ? value.sdkOptions : {};
  const systemPromptMode =
    value.systemPromptMode === "provider-default" ? "provider-default" : "cycle-default";

  return {
    executablePath,
    maxTurns,
    permissionMode,
    sdkOptions,
    systemPromptMode,
  };
};

export const isClaudeCodePermissionMode = (value: unknown): value is ClaudeCodePermissionMode =>
  value === "default" ||
  value === "acceptEdits" ||
  value === "bypassPermissions" ||
  value === "plan" ||
  value === "dontAsk" ||
  value === "auto";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isJsonObject = (value: unknown): value is JsonObject =>
  isRecord(value) && Object.values(value).every(isJsonValue);

const isJsonValue = (value: unknown): value is JsonObject[string] => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
};
