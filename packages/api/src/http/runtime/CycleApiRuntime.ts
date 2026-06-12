import { type RepositoryInput } from "@cycle/contracts";
import { type UseCaseRunnerShape } from "@cycle/usecases";
import { Context } from "effect";

export type ApiConfig = {
  readonly enabled: boolean;
  readonly host: "127.0.0.1" | "localhost";
  readonly port: number | "auto";
  readonly staticToken: string;
};

export type RuntimeDiscoveryFile = {
  readonly apiVersion: string;
  readonly baseUrl: string;
  readonly mcpPath?: string;
  readonly mcpUrl?: string;
  readonly pid: number;
  readonly specUrl?: string;
  readonly startedAt: string;
};

export type RepositoryOpenRequest = {
  readonly displayName?: string;
  readonly path?: string;
  readonly repositoryId?: string;
  readonly syncOnOpen?: boolean;
};

export type ApiRequestContext = {
  readonly requestId: string;
};

export type RepositoryOpenInputResolver = (
  request: RepositoryOpenRequest,
  context: ApiRequestContext,
) => Promise<RepositoryInput>;

export type CycleApiMcpOptions = {
  readonly apiToken?: string;
  readonly apiUrl?: string;
  readonly auth?: false | { readonly token?: string };
  readonly enabled?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly path?: string;
  readonly requireApiOnStart?: boolean;
};

export type CycleApiOptions = {
  readonly apiVersion?: string;
  readonly baseUrl?: string;
  readonly mcp?: false | CycleApiMcpOptions;
  readonly now?: () => Date;
  readonly repositoryOpenInput?: RepositoryOpenInputResolver;
  readonly runner: UseCaseRunnerShape;
  readonly startedAt?: Date;
  readonly staticToken: string;
};

export type CycleApi = {
  readonly dispose: () => Promise<void>;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly spec: () => Readonly<Record<string, unknown>>;
};

export type CycleApiRuntimeShape = {
  readonly apiVersion: string;
  readonly now: () => Date;
  readonly repositoryOpenInput?: RepositoryOpenInputResolver;
  readonly runner: UseCaseRunnerShape;
  readonly startedAt: string;
  readonly staticToken: string;
};

export class CycleApiRuntime extends Context.Service<CycleApiRuntime, CycleApiRuntimeShape>()(
  "@cycle/api/CycleApiRuntime",
) {}
