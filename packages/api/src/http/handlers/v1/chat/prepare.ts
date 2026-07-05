import {
  prepareChatTurn as prepareAgentChatTurn,
  requestOrigin,
  type ChatTurnPayload,
} from "@cycle/agent-chat";
import type { AgentMcpAttachment } from "@cycle/agents";
import type { CycleApiRuntimeShape } from "../../../runtime/CycleApiRuntime.ts";

export * from "@cycle/agent-chat/prompt";

export const prepareChatTurn = (input: {
  readonly origin: string;
  readonly payload: ChatTurnPayload;
  readonly requestId: string;
  readonly runtime: CycleApiRuntimeShape;
}) =>
  prepareAgentChatTurn({
    mcp: mcpAttachmentFromRuntime(input.runtime, input.origin, input.payload.mcpRequired === true),
    payload: input.payload,
    requestId: input.requestId,
  });

export { requestOrigin };

const mcpAttachmentFromRuntime = (
  runtime: CycleApiRuntimeShape,
  origin: string,
  required: boolean,
): AgentMcpAttachment | undefined => {
  const mcpUrl =
    runtime.mcpUrl ?? (runtime.mcpPath === undefined ? undefined : `${origin}${runtime.mcpPath}`);
  if (mcpUrl === undefined) return undefined;

  return {
    headers: {
      authorization: `Bearer ${runtime.staticToken}`,
    },
    mode: "http",
    ...(required ? { required: true } : {}),
    url: mcpUrl,
  };
};
