import { idFromResult, parseAgentMentions, requestOrigin } from "@cycle/agent-chat";
import { Effect } from "effect";
import type { HttpServerRequest } from "effect/unstable/http";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";

export { idFromResult, parseAgentMentions };

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
    if (parseAgentMentions(input.body).length === 0) return;

    const runtime = yield* CycleApiRuntime;
    const chat = runtime.agentChatRuntime;
    if (chat === undefined) return;

    let origin = "http://localhost";
    try {
      origin = requestOrigin(input.request);
    } catch {
      origin = "http://localhost";
    }

    void chat
      .handleSuccessfulCommentMentions({
        body: input.body,
        comment: input.comment,
        commentId: input.commentId,
        origin,
        repositoryId: input.repositoryId,
        requestId: input.requestId,
        ticketId: input.ticketId,
      })
      .catch(() => undefined);
  }).pipe(Effect.catch(() => Effect.void));
