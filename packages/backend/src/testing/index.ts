import type { AgentSessionStore } from "@cycle/agents";
import { Layer } from "effect";
import { BackendAgentSessionStore } from "../BackendAgentSessionStore.ts";
import { BackendApiLive } from "../BackendApi.ts";
import { BackendDatabaseLive } from "../BackendDatabase.ts";
import { BackendRuntime, type BackendRuntimeService } from "../BackendRuntime.ts";
import { LocalSettings, type LocalSettingsService } from "../LocalSettings.ts";
import { LocalWorkspace, type LocalWorkspaceService } from "../LocalWorkspace.ts";
import { RepositoryBootstrap, type RepositoryBootstrapService } from "../RepositoryBootstrap.ts";

export const BackendAgentSessionStoreTest = (store: AgentSessionStore) =>
  Layer.succeed(BackendAgentSessionStore, BackendAgentSessionStore.of(store));

export const BackendDatabaseTest = BackendDatabaseLive;

export const BackendRuntimeTest = (service: BackendRuntimeService) =>
  Layer.succeed(BackendRuntime, BackendRuntime.of(service));

export const LocalSettingsTest = (service: LocalSettingsService) =>
  Layer.succeed(LocalSettings, LocalSettings.of(service));

export const LocalWorkspaceTest = (service: LocalWorkspaceService) =>
  Layer.succeed(LocalWorkspace, LocalWorkspace.of(service));

export const RepositoryBootstrapTest = (service: RepositoryBootstrapService) =>
  Layer.succeed(RepositoryBootstrap, RepositoryBootstrap.of(service));

export { BackendApiLive };
