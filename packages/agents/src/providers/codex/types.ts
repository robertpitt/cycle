import type {
  CodexAppServerClient,
  CodexAppServerChildProcessOptions,
} from "@cycle/codex-app-server";
import type {
  CodexOptions,
  RunResult,
  SandboxMode,
  ThreadEvent,
  ThreadOptions,
  TurnOptions,
} from "@openai/codex-sdk";
import type { AgentSession, AgentSessionBinding, AgentSessionStore } from "../../types.ts";

export type CodexThreadLike = {
  readonly id: string | null;
  run(input: string, options?: TurnOptions): Promise<RunResult>;
  runStreamed(
    input: string,
    options?: TurnOptions,
  ): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
};

export type CodexClientLike = {
  resumeThread(id: string, options?: ThreadOptions): CodexThreadLike;
  startThread(options?: ThreadOptions): CodexThreadLike;
};

export type CodexAgentServiceOptions = {
  readonly appServerClient?:
    | CodexAppServerClient
    | ((options: CodexAppServerClientFactoryOptions) => Promise<CodexAppServerClient>);
  readonly codexHome?: string;
  readonly codex?: CodexClientLike | ((options: CodexOptions) => CodexClientLike);
  readonly codexOptions?: CodexOptions;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly executablePath?: string;
  readonly sandboxMode?: SandboxMode;
  readonly sessionStore?: AgentSessionStore;
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
