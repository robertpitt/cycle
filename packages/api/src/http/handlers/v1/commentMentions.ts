import { AgentChatCreateInput, AgentChatSendInput } from "@cycle/agent-chat";
import { Effect } from "effect";
import type { HttpServerRequest } from "effect/unstable/http";
import { parseAgentMentions } from "../../../agents/services/AgentChatUtilities.ts";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";

export const handleSuccessfulCommentMentions = (input: {
  readonly body: string;
  readonly comment: unknown;
  readonly commentId: string;
  readonly repositoryId: string;
  readonly request: HttpServerRequest.HttpServerRequest;
  readonly requestId: string;
  readonly ticketId: string;
}): Effect.Effect<void, never, CycleApiRuntime> =>
  Effect.gen(function* () {
    const mentions = parseAgentMentions(input.body);
    if (mentions.length === 0) return;
    const runtime = yield* CycleApiRuntime;
    if (runtime.agentChat === undefined) return;
    const profiles = yield* Effect.tryPromise({
      try: runtime.agentProviderProfiles,
      catch: () => undefined,
    }).pipe(Effect.orElseSucceed(() => []));
    const available = new Set(profiles.map((profile) => profile.provider));

    yield* Effect.forEach(
      mentions.filter((providerId) => available.has(providerId as never)),
      (providerId) =>
        runtime
          .agentChat!.create(
            new AgentChatCreateInput({
              agentId: providerId,
              idempotencyKey: `comment:${input.repositoryId}:${input.ticketId}:${input.commentId}:${providerId}`,
              providerId,
              repositoryId: input.repositoryId,
              title: `${providerId} review: ${input.ticketId}`,
            }),
          )
          .pipe(
            Effect.flatMap((view) =>
              runtime.agentChat!.send(
                new AgentChatSendInput({
                  idempotencyKey: `comment-turn:${input.commentId}:${providerId}`,
                  message: [
                    input.body,
                    "",
                    `Issue context: cycle://repository/${input.repositoryId}/tickets/${input.ticketId}`,
                  ].join("\n"),
                  threadId: view.thread.threadId,
                }),
              ),
            ),
            Effect.catch(() => Effect.void),
          ),
      { concurrency: "unbounded", discard: true },
    );
  }).pipe(Effect.catch(() => Effect.void));
