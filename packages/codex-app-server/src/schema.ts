import {
  CodexAppServerSchemaDecodeError,
  CodexAppServerSchemaEncodeError,
} from "./errors/index.ts";
import type {
  InitializeParams as GeneratedInitializeParams,
  InitializeResponse as GeneratedInitializeResponse,
} from "./_generated/index.ts";
import type { JsonValue as GeneratedJsonValue } from "./_generated/serde_json/JsonValue.ts";
import type {
  AgentMessageDeltaNotification as GeneratedAgentMessageDeltaNotification,
  AskForApproval as GeneratedAskForApproval,
  CommandExecutionApprovalDecision as GeneratedCommandExecutionApprovalDecision,
  CommandExecutionOutputDeltaNotification as GeneratedCommandExecutionOutputDeltaNotification,
  CommandExecutionRequestApprovalParams as GeneratedCommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse as GeneratedCommandExecutionRequestApprovalResponse,
  ErrorNotification as GeneratedErrorNotification,
  FileChangeApprovalDecision as GeneratedFileChangeApprovalDecision,
  FileChangeOutputDeltaNotification as GeneratedFileChangeOutputDeltaNotification,
  FileChangeRequestApprovalParams as GeneratedFileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse as GeneratedFileChangeRequestApprovalResponse,
  ItemCompletedNotification as GeneratedItemCompletedNotification,
  ItemStartedNotification as GeneratedItemStartedNotification,
  ListMcpServerStatusParams as GeneratedListMcpServerStatusParams,
  ListMcpServerStatusResponse as GeneratedListMcpServerStatusResponse,
  McpServerRefreshResponse as GeneratedMcpServerRefreshResponse,
  Model as GeneratedModel,
  ModelListParams as GeneratedModelListParams,
  ModelListResponse as GeneratedModelListResponse,
  PlanDeltaNotification as GeneratedPlanDeltaNotification,
  ReasoningSummaryTextDeltaNotification as GeneratedReasoningSummaryTextDeltaNotification,
  ReasoningTextDeltaNotification as GeneratedReasoningTextDeltaNotification,
  SandboxMode as GeneratedSandboxMode,
  SandboxPolicy as GeneratedSandboxPolicy,
  ServerRequestResolvedNotification as GeneratedServerRequestResolvedNotification,
  Thread as GeneratedThread,
  ThreadItem as GeneratedThreadItem,
  ThreadResumeParams as GeneratedThreadResumeParams,
  ThreadResumeResponse as GeneratedThreadResumeResponse,
  ThreadStartParams as GeneratedThreadStartParams,
  ThreadStartResponse as GeneratedThreadStartResponse,
  ThreadStartedNotification as GeneratedThreadStartedNotification,
  ToolRequestUserInputOption as GeneratedToolRequestUserInputOption,
  ToolRequestUserInputParams as GeneratedToolRequestUserInputParams,
  ToolRequestUserInputQuestion as GeneratedToolRequestUserInputQuestion,
  ToolRequestUserInputResponse as GeneratedToolRequestUserInputResponse,
  Turn as GeneratedTurn,
  TurnCompletedNotification as GeneratedTurnCompletedNotification,
  TurnDiffUpdatedNotification as GeneratedTurnDiffUpdatedNotification,
  TurnInterruptParams as GeneratedTurnInterruptParams,
  TurnInterruptResponse as GeneratedTurnInterruptResponse,
  TurnPlanUpdatedNotification as GeneratedTurnPlanUpdatedNotification,
  TurnStartParams as GeneratedTurnStartParams,
  TurnStartResponse as GeneratedTurnStartResponse,
  TurnStartedNotification as GeneratedTurnStartedNotification,
  UserInput as GeneratedUserInput,
  WarningNotification as GeneratedWarningNotification,
} from "./_generated/v2/index.ts";
import type {
  ClientNotificationMethod,
  ClientRequestMethod,
  ClientRequestParamsByMethod,
  ClientRequestResponsesByMethod,
  ServerNotificationMethod,
  ServerNotificationParamsByMethod,
  ServerRequestMethod,
  ServerRequestParamsByMethod,
  ServerRequestResponsesByMethod,
} from "./rpc.ts";

type WithUnknownFields<T> = T & { readonly [key: string]: unknown };

export type JsonPrimitive = Extract<GeneratedJsonValue, string | number | boolean | null>;
export type JsonValue = GeneratedJsonValue;
export type JsonObject = { readonly [key: string]: JsonValue | undefined };

export type ApprovalPolicy = GeneratedAskForApproval;
export type SandboxMode = GeneratedSandboxMode;
export type SandboxPolicy = GeneratedSandboxPolicy;
export type CommandApprovalDecision = GeneratedCommandExecutionApprovalDecision;
export type FileChangeApprovalDecision = GeneratedFileChangeApprovalDecision;

export type InitializeParams = GeneratedInitializeParams;

export type InitializeResponse = WithUnknownFields<GeneratedInitializeResponse>;

export type InitializedParams = undefined;

export type ThreadStartParams = WithUnknownFields<GeneratedThreadStartParams>;

export type ThreadResumeParams = WithUnknownFields<GeneratedThreadResumeParams>;

export type ThreadStartResponse = WithUnknownFields<GeneratedThreadStartResponse>;

export type ThreadResumeResponse = WithUnknownFields<GeneratedThreadResumeResponse>;

export type McpServerRefreshResponse = GeneratedMcpServerRefreshResponse;

export type ListMcpServerStatusParams = GeneratedListMcpServerStatusParams;

export type ListMcpServerStatusResponse = WithUnknownFields<GeneratedListMcpServerStatusResponse>;

export type Model = WithUnknownFields<GeneratedModel>;

export type ModelListParams = GeneratedModelListParams;

export type ModelListResponse = Omit<GeneratedModelListResponse, "data"> & {
  readonly data: readonly Model[];
};

export type Thread = WithUnknownFields<GeneratedThread>;

export type Turn = WithUnknownFields<GeneratedTurn>;

export type ThreadItem = WithUnknownFields<GeneratedThreadItem>;

export type TurnStartInput = GeneratedUserInput;

export type TurnStartParams = WithUnknownFields<GeneratedTurnStartParams>;

export type TurnStartResponse = WithUnknownFields<GeneratedTurnStartResponse>;

export type TurnInterruptParams = GeneratedTurnInterruptParams;

export type TurnInterruptResponse = GeneratedTurnInterruptResponse;

export type ThreadStartedNotification = Omit<GeneratedThreadStartedNotification, "thread"> & {
  readonly thread: Thread;
};

export type TurnStartedNotification = Omit<GeneratedTurnStartedNotification, "turn"> & {
  readonly turn: Turn;
};

export type TurnCompletedNotification = Omit<GeneratedTurnCompletedNotification, "turn"> & {
  readonly turn: Turn;
  readonly usage?: unknown;
};

export type TurnDiffUpdatedNotification = GeneratedTurnDiffUpdatedNotification;

export type TurnPlanUpdatedNotification = GeneratedTurnPlanUpdatedNotification;

export type ItemStartedNotification = Omit<GeneratedItemStartedNotification, "item"> & {
  readonly item: ThreadItem;
};

export type ItemCompletedNotification = Omit<GeneratedItemCompletedNotification, "item"> & {
  readonly item: ThreadItem;
};

export type ItemTextDeltaNotification = GeneratedAgentMessageDeltaNotification;

export type ItemPlanDeltaNotification = GeneratedPlanDeltaNotification;
export type ItemReasoningTextDeltaNotification =
  | GeneratedReasoningTextDeltaNotification
  | GeneratedReasoningSummaryTextDeltaNotification;

export type ItemCommandExecutionOutputDeltaNotification =
  WithUnknownFields<GeneratedCommandExecutionOutputDeltaNotification> & {
    readonly deltaBase64?: string;
    readonly stream?: string;
  };

export type ItemFileChangeOutputDeltaNotification =
  WithUnknownFields<GeneratedFileChangeOutputDeltaNotification>;

export type ErrorNotification = WithUnknownFields<GeneratedErrorNotification> & {
  readonly message?: string;
};

export type WarningNotification = WithUnknownFields<GeneratedWarningNotification>;

export type ServerRequestResolvedNotification =
  WithUnknownFields<GeneratedServerRequestResolvedNotification>;

export type CommandExecutionRequestApprovalParams = Omit<
  GeneratedCommandExecutionRequestApprovalParams,
  "command" | "commandActions"
> & {
  readonly approvalId?: string | null;
  readonly command?: string | readonly string[] | null;
  readonly commandActions?: readonly unknown[] | null;
};

export type CommandExecutionRequestApprovalResponse =
  GeneratedCommandExecutionRequestApprovalResponse;

export type FileChangeRequestApprovalParams =
  WithUnknownFields<GeneratedFileChangeRequestApprovalParams> & {
    readonly changes?: readonly unknown[] | null;
  };

export type FileChangeRequestApprovalResponse = GeneratedFileChangeRequestApprovalResponse;

export type ToolRequestUserInputOption = WithUnknownFields<GeneratedToolRequestUserInputOption> & {
  readonly disabled?: boolean;
  readonly value?: string;
};

export type ToolRequestUserInputQuestion = Omit<
  GeneratedToolRequestUserInputQuestion,
  "header" | "options"
> &
  WithUnknownFields<{
    readonly header?: string | null;
    readonly multiSelect?: boolean;
    readonly options?: readonly ToolRequestUserInputOption[] | null;
    readonly type?: "text" | "single_select" | "multi_select" | "boolean" | string;
  }>;

export type ToolRequestUserInputParams = Omit<GeneratedToolRequestUserInputParams, "questions"> & {
  readonly questions: readonly ToolRequestUserInputQuestion[];
};

export type ToolRequestUserInputResponse = GeneratedToolRequestUserInputResponse;

type Validator<T> = (value: unknown, path?: string) => T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown, path: string): string => {
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
  return value;
};

const readOptionalString = (value: unknown, path: string): string | null | undefined => {
  if (value === undefined || value === null) return value;
  return readString(value, path);
};

const readArray = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
};

const readObject = (value: unknown, path: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  return value;
};

const passObject = <T extends object = Record<string, unknown>>(
  value: unknown,
  path = "payload",
): T => readObject(value, path) as T;

const initializeParams: Validator<InitializeParams> = (value) => {
  const object = passObject(value);
  const clientInfo = readObject(object.clientInfo, "clientInfo");
  return {
    ...object,
    clientInfo: {
      ...clientInfo,
      name: readString(clientInfo.name, "clientInfo.name"),
      title: readOptionalString(clientInfo.title, "clientInfo.title"),
      version: readOptionalString(clientInfo.version, "clientInfo.version"),
    },
  } as InitializeParams;
};

const initializeResponse: Validator<InitializeResponse> = (value) =>
  passObject<InitializeResponse>(value);

const threadStartParams: Validator<ThreadStartParams> = (value) => {
  const object = passObject(value);
  readOptionalString(object.cwd, "cwd");
  readOptionalString(object.model, "model");
  return object as ThreadStartParams;
};

const threadResumeParams: Validator<ThreadResumeParams> = (value) => {
  const object = threadStartParams(value) as Record<string, unknown>;
  readString(object.threadId, "threadId");
  return object as ThreadResumeParams;
};

const undefinedParams: Validator<undefined> = (value) => {
  if (value !== undefined && value !== null) throw new Error("params must be omitted");
  return undefined;
};

const listMcpServerStatusParams: Validator<ListMcpServerStatusParams> = (value) => {
  const object = passObject(value);
  readOptionalString(object.cursor, "cursor");
  readOptionalString(object.threadId, "threadId");
  if (object.limit !== undefined && object.limit !== null && typeof object.limit !== "number") {
    throw new Error("limit must be a number");
  }
  if (
    object.detail !== undefined &&
    object.detail !== null &&
    object.detail !== "full" &&
    object.detail !== "toolsAndAuthOnly"
  ) {
    throw new Error("detail must be full or toolsAndAuthOnly");
  }
  return object as ListMcpServerStatusParams;
};

const modelListParams: Validator<ModelListParams> = (value) => {
  const object = value === undefined || value === null ? {} : passObject(value);
  readOptionalString(object.cursor, "cursor");
  if (object.limit !== undefined && object.limit !== null && typeof object.limit !== "number") {
    throw new Error("limit must be a number");
  }
  if (
    object.includeHidden !== undefined &&
    object.includeHidden !== null &&
    typeof object.includeHidden !== "boolean"
  ) {
    throw new Error("includeHidden must be a boolean");
  }
  return object as ModelListParams;
};

const model = (value: unknown, path = "model"): Model => {
  const object = passObject<Model>(value, path);
  readString(object.id, `${path}.id`);
  readString(object.model, `${path}.model`);
  return object;
};

const modelListResponse: Validator<ModelListResponse> = (value) => {
  const object = passObject(value);
  const data = readArray(object.data, "data").map((item, index) =>
    model(item, `data[${index}]`),
  );
  return {
    ...object,
    data,
    nextCursor: readOptionalString(object.nextCursor, "nextCursor") ?? null,
  } as ModelListResponse;
};

const thread = (value: unknown, path = "thread"): Thread => {
  const object = passObject<Thread>(value, path);
  readString(object.id, `${path}.id`);
  return object;
};

const turn = (value: unknown, path = "turn"): Turn => {
  const object = passObject<Turn>(value, path);
  readString(object.id, `${path}.id`);
  return object;
};

const threadStartResponse: Validator<ThreadStartResponse> = (value) => {
  const object = passObject<ThreadStartResponse>(value);
  thread(object.thread);
  return object;
};

const threadResumeResponse: Validator<ThreadResumeResponse> = (value) => {
  const object = passObject<ThreadResumeResponse>(value);
  thread(object.thread);
  return object;
};

const listMcpServerStatusResponse: Validator<ListMcpServerStatusResponse> = (value) => {
  const object = passObject<ListMcpServerStatusResponse>(value);
  readArray(object.data, "data");
  readOptionalString(object.nextCursor, "nextCursor");
  return object;
};

const turnStartParams: Validator<TurnStartParams> = (value) => {
  const object = passObject(value);
  readString(object.threadId, "threadId");
  readArray(object.input, "input");
  return object as TurnStartParams;
};

const turnStartResponse: Validator<TurnStartResponse> = (value) => {
  const object = passObject<TurnStartResponse>(value);
  turn(object.turn);
  return object;
};

const turnInterruptParams: Validator<TurnInterruptParams> = (value) => {
  const object = passObject(value);
  return {
    threadId: readString(object.threadId, "threadId"),
    turnId: readString(object.turnId, "turnId"),
  };
};

const emptyResponse: Validator<Record<string, never>> = (value) => {
  if (value === undefined) return {};
  passObject(value);
  return {};
};

const itemNotification = <T extends ItemStartedNotification>(value: unknown): T => {
  const object = passObject<T>(value);
  readString(object.threadId, "threadId");
  readString(object.turnId, "turnId");
  const item = passObject(object.item, "item");
  readString(item.id, "item.id");
  return object;
};

const textDeltaNotification = <T extends ItemTextDeltaNotification>(value: unknown): T => {
  const object = passObject<T>(value);
  readString(object.delta, "delta");
  readString(object.itemId, "itemId");
  readString(object.threadId, "threadId");
  readString(object.turnId, "turnId");
  return object;
};

const commandOutputDeltaNotification: Validator<ItemCommandExecutionOutputDeltaNotification> = (
  value,
) => {
  const object = passObject<ItemCommandExecutionOutputDeltaNotification>(value);
  if (object.delta !== undefined) readString(object.delta, "delta");
  if (object.deltaBase64 !== undefined) readString(object.deltaBase64, "deltaBase64");
  return object;
};

const commandApprovalParams: Validator<CommandExecutionRequestApprovalParams> = (value) => {
  const object = passObject<CommandExecutionRequestApprovalParams>(value);
  readString(object.itemId, "itemId");
  readString(object.threadId, "threadId");
  readString(object.turnId, "turnId");
  return object;
};

const fileApprovalParams: Validator<FileChangeRequestApprovalParams> = (value) => {
  const object = passObject<FileChangeRequestApprovalParams>(value);
  readString(object.itemId, "itemId");
  readString(object.threadId, "threadId");
  readString(object.turnId, "turnId");
  return object;
};

const userInputParams: Validator<ToolRequestUserInputParams> = (value) => {
  const object = passObject<ToolRequestUserInputParams>(value);
  readString(object.itemId, "itemId");
  readString(object.threadId, "threadId");
  readString(object.turnId, "turnId");
  readArray(object.questions, "questions").forEach((question, index) => {
    const item = readObject(question, `questions[${index}]`);
    readString(item.id, `questions[${index}].id`);
    readString(item.question, `questions[${index}].question`);
  });
  return object;
};

const commandApprovalResponse: Validator<CommandExecutionRequestApprovalResponse> = (value) => {
  const object = passObject<CommandExecutionRequestApprovalResponse>(value);
  if (object.decision === undefined) throw new Error("decision is required");
  return object;
};

const fileApprovalResponse: Validator<FileChangeRequestApprovalResponse> = (value) => {
  const object = passObject<FileChangeRequestApprovalResponse>(value);
  if (
    object.decision !== "accept" &&
    object.decision !== "acceptForSession" &&
    object.decision !== "decline" &&
    object.decision !== "cancel"
  ) {
    throw new Error("decision must be accept, acceptForSession, decline, or cancel");
  }
  return object;
};

const userInputResponse: Validator<ToolRequestUserInputResponse> = (value) => {
  const object = passObject<ToolRequestUserInputResponse>(value);
  readObject(object.answers, "answers");
  return object;
};

const clientRequestParams = {
  initialize: initializeParams,
  "thread/start": threadStartParams,
  "thread/resume": threadResumeParams,
  "config/mcpServer/reload": undefinedParams,
  "mcpServerStatus/list": listMcpServerStatusParams,
  "model/list": modelListParams,
  "turn/start": turnStartParams,
  "turn/interrupt": turnInterruptParams,
} satisfies Record<ClientRequestMethod, Validator<unknown>>;

const clientRequestResponses = {
  initialize: initializeResponse,
  "thread/start": threadStartResponse,
  "thread/resume": threadResumeResponse,
  "config/mcpServer/reload": emptyResponse,
  "mcpServerStatus/list": listMcpServerStatusResponse,
  "model/list": modelListResponse,
  "turn/start": turnStartResponse,
  "turn/interrupt": emptyResponse,
} satisfies Record<ClientRequestMethod, Validator<unknown>>;

const serverRequestParams = {
  "item/commandExecution/requestApproval": commandApprovalParams,
  "item/fileChange/requestApproval": fileApprovalParams,
  "item/tool/requestUserInput": userInputParams,
} satisfies Record<ServerRequestMethod, Validator<unknown>>;

const serverRequestResponses = {
  "item/commandExecution/requestApproval": commandApprovalResponse,
  "item/fileChange/requestApproval": fileApprovalResponse,
  "item/tool/requestUserInput": userInputResponse,
} satisfies Record<ServerRequestMethod, Validator<unknown>>;

const serverNotificationParams = {
  error: passObject,
  "thread/started": (value: unknown) => {
    const object = passObject<ThreadStartedNotification>(value);
    thread(object.thread);
    return object;
  },
  "turn/started": (value: unknown) => {
    const object = passObject<TurnStartedNotification>(value);
    readString(object.threadId, "threadId");
    turn(object.turn);
    return object;
  },
  "turn/completed": (value: unknown) => {
    const object = passObject<TurnCompletedNotification>(value);
    readString(object.threadId, "threadId");
    turn(object.turn);
    return object;
  },
  "turn/diff/updated": (value: unknown) => {
    const object = passObject<TurnDiffUpdatedNotification>(value);
    readString(object.threadId, "threadId");
    readString(object.turnId, "turnId");
    readString(object.diff, "diff");
    return object;
  },
  "turn/plan/updated": (value: unknown) => {
    const object = passObject<TurnPlanUpdatedNotification>(value);
    readString(object.threadId, "threadId");
    readString(object.turnId, "turnId");
    readArray(object.plan, "plan");
    return object;
  },
  "item/started": itemNotification,
  "item/completed": itemNotification,
  "item/agentMessage/delta": textDeltaNotification,
  "item/plan/delta": textDeltaNotification,
  "item/commandExecution/outputDelta": commandOutputDeltaNotification,
  "item/fileChange/outputDelta": textDeltaNotification,
  "item/reasoning/summaryTextDelta": textDeltaNotification,
  "item/reasoning/textDelta": textDeltaNotification,
  "serverRequest/resolved": (value: unknown) => {
    const object = passObject<ServerRequestResolvedNotification>(value);
    if (typeof object.requestId !== "string" && typeof object.requestId !== "number") {
      throw new Error("requestId must be a string or number");
    }
    return object;
  },
  warning: passObject,
} satisfies Record<ServerNotificationMethod, Validator<unknown>>;

export const encodeClientRequestParams = <M extends ClientRequestMethod>(
  method: M,
  value: ClientRequestParamsByMethod[M],
): ClientRequestParamsByMethod[M] => {
  try {
    return clientRequestParams[method](value) as ClientRequestParamsByMethod[M];
  } catch (error) {
    throw new CodexAppServerSchemaEncodeError({
      method,
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }
};

export const decodeClientRequestResponse = <M extends ClientRequestMethod>(
  method: M,
  value: unknown,
): ClientRequestResponsesByMethod[M] => {
  try {
    return clientRequestResponses[method](value) as ClientRequestResponsesByMethod[M];
  } catch (error) {
    throw new CodexAppServerSchemaDecodeError({
      method,
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }
};

export const encodeServerRequestResponse = <M extends ServerRequestMethod>(
  method: M,
  value: ServerRequestResponsesByMethod[M],
): ServerRequestResponsesByMethod[M] => {
  try {
    return serverRequestResponses[method](value) as ServerRequestResponsesByMethod[M];
  } catch (error) {
    throw new CodexAppServerSchemaEncodeError({
      method,
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }
};

export const decodeServerRequestParams = <M extends ServerRequestMethod>(
  method: M,
  value: unknown,
): ServerRequestParamsByMethod[M] => {
  try {
    return serverRequestParams[method](value) as ServerRequestParamsByMethod[M];
  } catch (error) {
    throw new CodexAppServerSchemaDecodeError({
      method,
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }
};

export const decodeServerNotificationParams = <M extends ServerNotificationMethod>(
  method: M,
  value: unknown,
): ServerNotificationParamsByMethod[M] => {
  try {
    const validator = serverNotificationParams[method] as Validator<unknown>;
    return validator(value) as ServerNotificationParamsByMethod[M];
  } catch (error) {
    throw new CodexAppServerSchemaDecodeError({
      method,
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }
};

export const encodeClientNotificationParams = <M extends ClientNotificationMethod>(
  _method: M,
  value: unknown,
): unknown => value;
