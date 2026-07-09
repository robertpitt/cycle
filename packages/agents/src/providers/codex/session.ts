import type { AgentSession, AgentSessionBinding, AgentSessionBindingStatus } from "../../types.ts";
import { codexProviderId } from "./constants.ts";
import type { StoredCodexSession } from "./types.ts";

const serializableNative = (
  native: AgentSession["native"] | undefined,
): Readonly<Record<string, unknown>> | undefined =>
  native === undefined ? undefined : { ...native };

export const bindingFromSession = (
  session: StoredCodexSession,
  status: AgentSessionBindingStatus,
  patch: Partial<AgentSessionBinding> = {},
): AgentSessionBinding => {
  const base = session.binding;
  const updatedAt = patch.updatedAt ?? session.updatedAt.toISOString();
  const activeTurnId =
    status === "running" || status === "waiting" || status === "starting"
      ? patch.activeTurnId
      : undefined;
  const lastError = patch.lastError ?? (status === "error" ? base?.lastError : undefined);

  return {
    ...base,
    createdAt: base?.createdAt ?? session.createdAt.toISOString(),
    ...(patch.cwd === undefined && base?.cwd === undefined ? {} : { cwd: patch.cwd ?? base?.cwd }),
    ...(session.metadata === undefined && base?.metadata === undefined
      ? {}
      : { metadata: session.metadata ?? base?.metadata }),
    ...(patch.model === undefined && base?.model === undefined
      ? {}
      : { model: patch.model ?? base?.model }),
    ...(session.native === undefined && base?.native === undefined
      ? {}
      : { native: serializableNative(session.native) ?? base?.native }),
    ...(patch.runtime === undefined && base?.runtime === undefined
      ? {}
      : { runtime: patch.runtime ?? base?.runtime }),
    provider: codexProviderId,
    sessionId: session.id,
    status,
    activeTurnId,
    ...(patch.threadId === undefined && base?.threadId === undefined
      ? {}
      : { threadId: patch.threadId ?? base?.threadId }),
    ...(session.title === undefined && base?.title === undefined
      ? {}
      : { title: session.title ?? base?.title }),
    updatedAt,
    lastError,
  };
};

export const withNativeThreadId = (
  session: StoredCodexSession,
  threadId: string | null | undefined,
  updatedAt: Date,
): StoredCodexSession => {
  if (threadId === undefined || threadId === null || threadId.length === 0) {
    return {
      ...session,
      updatedAt,
    };
  }

  return {
    ...session,
    native:
      session.native === undefined
        ? { threadId }
        : {
            ...session.native,
            threadId,
          },
    updatedAt,
  };
};
