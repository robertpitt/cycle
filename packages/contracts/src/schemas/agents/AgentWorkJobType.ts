import { Schema } from "effect";

export const AgentWorkJobType = Schema.Literals([
  "chat",
  "quick_action",
  "comment_response",
  "review_issue",
  "draft_issue",
  "expand_issue",
  "split_issue",
  "plan_epic",
  "implement_issue",
  "review_implementation",
]).pipe(
  Schema.annotate({
    description: "Category of work an agent provider can execute.",
    identifier: "@cycle/contracts/AgentWorkJobType",
    title: "AgentWorkJobType",
  }),
);
export type AgentWorkJobType = typeof AgentWorkJobType.Type;
