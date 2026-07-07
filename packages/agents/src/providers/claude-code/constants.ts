import { makeRandomId } from "../../internal/id.ts";

export const claudeCodeProviderId = "claude-code" as const;
export const claudeCodeExecutable = "claude";
export const claudeCodePackageName = "@anthropic-ai/claude-agent-sdk";

export const newClaudeCodeId = makeRandomId;

export const claudeCodeNow = (): Date => new Date();
