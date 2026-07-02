export const claudeCodeProviderId = "claude-code" as const;
export const claudeCodeExecutable = "claude";
export const claudeCodePackageName = "@anthropic-ai/claude-agent-sdk";

export const newClaudeCodeId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const claudeCodeNow = (): Date => new Date();
