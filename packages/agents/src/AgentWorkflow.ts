import { Context, Effect, Layer } from "effect";
import { AgentWorkflowError } from "./AgentErrors.ts";
import type { AgentRun } from "./AgentRun.ts";
import type { AgentTask } from "./AgentTask.ts";

export type AgentWorkflowCompletionInput = {
  readonly run: AgentRun;
  readonly summary: string;
  readonly task: AgentTask;
};

export type AgentWorkflowFailureInput = {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly task: AgentTask;
};

export type AgentWorkflowPreparationInput = {
  readonly task: AgentTask;
};

export type AgentWorkflowDefinition = {
  readonly complete: (
    input: AgentWorkflowCompletionInput,
  ) => Effect.Effect<void, AgentWorkflowError>;
  readonly failed?: (input: AgentWorkflowFailureInput) => Effect.Effect<void, AgentWorkflowError>;
  readonly id: string;
  readonly prepare?: (
    input: AgentWorkflowPreparationInput,
  ) => Effect.Effect<void, AgentWorkflowError>;
};

export type AgentWorkflowRegistryShape = {
  readonly get: (workflowId: string) => Effect.Effect<AgentWorkflowDefinition, AgentWorkflowError>;
};

export class AgentWorkflowRegistry extends Context.Service<
  AgentWorkflowRegistry,
  AgentWorkflowRegistryShape
>()("@cycle/agents/AgentWorkflowRegistry") {}

const noOpWorkflow = (id: string): AgentWorkflowDefinition => ({
  complete: () => Effect.void,
  id,
});

export const AgentWorkflowRegistryLive = (
  definitions: ReadonlyArray<AgentWorkflowDefinition> = [],
) => {
  const byId = new Map(
    [
      noOpWorkflow("interactive-chat"),
      noOpWorkflow("research"),
      noOpWorkflow("scheduled"),
      ...definitions,
    ].map((definition) => [definition.id, definition]),
  );
  return Layer.succeed(
    AgentWorkflowRegistry,
    AgentWorkflowRegistry.of({
      get: (workflowId) => {
        const workflow = byId.get(workflowId);
        return workflow === undefined
          ? Effect.fail(
              new AgentWorkflowError({
                code: "agent_workflow_not_found",
                message: `Agent workflow is not registered: ${workflowId}`,
                retryable: false,
                workflowId,
              }),
            )
          : Effect.succeed(workflow);
      },
    }),
  );
};
