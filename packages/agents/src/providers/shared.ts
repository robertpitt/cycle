import type { AgentWorkJobType } from "../types.ts";

export const planningJobTypes = [
  "chat",
  "quick_action",
  "comment_response",
  "review_issue",
  "draft_issue",
  "expand_issue",
  "split_issue",
  "plan_epic",
] satisfies readonly AgentWorkJobType[];
