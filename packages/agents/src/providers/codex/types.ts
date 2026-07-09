import type {
  CodexAppServerClient,
  CodexAppServerChildProcessOptions,
} from "./app-server/CodexAppServer.ts";
import type { AgentSession, AgentSessionBinding } from "../../types.ts";

export type CodexAgentServiceOptions = {
  readonly appServerClient?:
    | CodexAppServerClient
    | ((options: CodexAppServerClientFactoryOptions) => Promise<CodexAppServerClient>);
  readonly codexHome?: string;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly executablePath?: string;
  readonly timeoutMs?: number;
};

export type CodexAppServerClientFactoryOptions = Omit<
  CodexAppServerChildProcessOptions,
  "transport"
> & {
  readonly env: Record<string, string>;
};

export type StoredCodexSession = AgentSession & {
  readonly binding?: AgentSessionBinding;
  readonly native?: AgentSession["native"] & {
    readonly threadId?: string;
  };
};

export type ActiveCodexTurn = {
  readonly controller: AbortController;
  readonly interrupt?: () => Promise<void>;
  readonly nativeThreadId?: string;
  readonly nativeTurnId?: string;
  readonly turnId: string;
};
