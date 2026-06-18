import type {
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  ErrorNotification,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  InitializedParams,
  InitializeParams,
  InitializeResponse,
  ItemCommandExecutionOutputDeltaNotification,
  ItemCompletedNotification,
  ItemFileChangeOutputDeltaNotification,
  ItemPlanDeltaNotification,
  ItemReasoningTextDeltaNotification,
  ItemStartedNotification,
  ItemTextDeltaNotification,
  ListMcpServerStatusParams,
  ListMcpServerStatusResponse,
  McpServerRefreshResponse,
  ServerRequestResolvedNotification,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadStartParams,
  ThreadStartResponse,
  ThreadStartedNotification,
  ToolRequestUserInputParams,
  ToolRequestUserInputResponse,
  TurnCompletedNotification,
  TurnDiffUpdatedNotification,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnPlanUpdatedNotification,
  TurnStartParams,
  TurnStartedNotification,
  TurnStartResponse,
  WarningNotification,
} from "./schema.ts";

export const CLIENT_REQUEST_METHODS = {
  initialize: "initialize",
  "thread/start": "thread/start",
  "thread/resume": "thread/resume",
  "config/mcpServer/reload": "config/mcpServer/reload",
  "mcpServerStatus/list": "mcpServerStatus/list",
  "turn/start": "turn/start",
  "turn/interrupt": "turn/interrupt",
} as const;

export const CLIENT_NOTIFICATION_METHODS = {
  initialized: "initialized",
} as const;

export const SERVER_REQUEST_METHODS = {
  "item/commandExecution/requestApproval": "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval": "item/fileChange/requestApproval",
  "item/tool/requestUserInput": "item/tool/requestUserInput",
} as const;

export const SERVER_NOTIFICATION_METHODS = {
  error: "error",
  "thread/started": "thread/started",
  "turn/started": "turn/started",
  "turn/completed": "turn/completed",
  "turn/diff/updated": "turn/diff/updated",
  "turn/plan/updated": "turn/plan/updated",
  "item/started": "item/started",
  "item/completed": "item/completed",
  "item/agentMessage/delta": "item/agentMessage/delta",
  "item/plan/delta": "item/plan/delta",
  "item/commandExecution/outputDelta": "item/commandExecution/outputDelta",
  "item/fileChange/outputDelta": "item/fileChange/outputDelta",
  "item/reasoning/summaryTextDelta": "item/reasoning/summaryTextDelta",
  "item/reasoning/textDelta": "item/reasoning/textDelta",
  "serverRequest/resolved": "serverRequest/resolved",
  warning: "warning",
} as const;

export type ClientRequestMethod = keyof typeof CLIENT_REQUEST_METHODS;
export type ClientNotificationMethod = keyof typeof CLIENT_NOTIFICATION_METHODS;
export type ServerRequestMethod = keyof typeof SERVER_REQUEST_METHODS;
export type ServerNotificationMethod = keyof typeof SERVER_NOTIFICATION_METHODS;

export type ClientRequestParamsByMethod = {
  readonly initialize: InitializeParams;
  readonly "thread/start": ThreadStartParams;
  readonly "thread/resume": ThreadResumeParams;
  readonly "config/mcpServer/reload": undefined;
  readonly "mcpServerStatus/list": ListMcpServerStatusParams;
  readonly "turn/start": TurnStartParams;
  readonly "turn/interrupt": TurnInterruptParams;
};

export type ClientRequestResponsesByMethod = {
  readonly initialize: InitializeResponse;
  readonly "thread/start": ThreadStartResponse;
  readonly "thread/resume": ThreadResumeResponse;
  readonly "config/mcpServer/reload": McpServerRefreshResponse;
  readonly "mcpServerStatus/list": ListMcpServerStatusResponse;
  readonly "turn/start": TurnStartResponse;
  readonly "turn/interrupt": TurnInterruptResponse;
};

export type ClientNotificationParamsByMethod = {
  readonly initialized: InitializedParams | undefined;
};

export type ServerRequestParamsByMethod = {
  readonly "item/commandExecution/requestApproval": CommandExecutionRequestApprovalParams;
  readonly "item/fileChange/requestApproval": FileChangeRequestApprovalParams;
  readonly "item/tool/requestUserInput": ToolRequestUserInputParams;
};

export type ServerRequestResponsesByMethod = {
  readonly "item/commandExecution/requestApproval": CommandExecutionRequestApprovalResponse;
  readonly "item/fileChange/requestApproval": FileChangeRequestApprovalResponse;
  readonly "item/tool/requestUserInput": ToolRequestUserInputResponse;
};

export type ServerNotificationParamsByMethod = {
  readonly error: ErrorNotification;
  readonly "thread/started": ThreadStartedNotification;
  readonly "turn/started": TurnStartedNotification;
  readonly "turn/completed": TurnCompletedNotification;
  readonly "turn/diff/updated": TurnDiffUpdatedNotification;
  readonly "turn/plan/updated": TurnPlanUpdatedNotification;
  readonly "item/started": ItemStartedNotification;
  readonly "item/completed": ItemCompletedNotification;
  readonly "item/agentMessage/delta": ItemTextDeltaNotification;
  readonly "item/plan/delta": ItemPlanDeltaNotification;
  readonly "item/commandExecution/outputDelta": ItemCommandExecutionOutputDeltaNotification;
  readonly "item/fileChange/outputDelta": ItemFileChangeOutputDeltaNotification;
  readonly "item/reasoning/summaryTextDelta": ItemReasoningTextDeltaNotification;
  readonly "item/reasoning/textDelta": ItemReasoningTextDeltaNotification;
  readonly "serverRequest/resolved": ServerRequestResolvedNotification;
  readonly warning: WarningNotification;
};
