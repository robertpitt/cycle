import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Brain,
  ChevronDown,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  Copy,
  HelpCircle,
  Info,
  LoaderCircle,
  PencilLine,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  UserRound,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { Badge } from "../../atoms/badge/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { DateTime } from "../../atoms/date-time/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { Select, type SelectItem } from "../../atoms/select/index.ts";
import { Text } from "../../atoms/text/index.ts";
import { cn } from "../../lib/cn.ts";
import type { ComponentTone } from "../../lib/contracts.ts";
import { MarkdownRenderer } from "../markdown-renderer/index.ts";

export type AgentChatConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "failed"
  | "reconnecting";

export type AgentChatThreadStatus = "active" | "archived" | "draft" | "error" | "waiting";

export type AgentChatTurnStatus =
  | "cancelled"
  | "completed"
  | "failed"
  | "queued"
  | "running"
  | "waiting_for_user";

export type AgentChatProviderAvailability = "available" | "unavailable" | "unsupported";

export type AgentChatRuntimeMode = "read-only" | "workspace-write" | "full-access";

export type AgentChatModelOption = {
  readonly description?: string | null;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
};

export type AgentChatThinkingLevelOption = {
  readonly description?: string | null;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
};

export type AgentChatProviderProfile = {
  readonly availability?: AgentChatProviderAvailability;
  readonly defaultModel?: string | null;
  readonly defaultThinkingLevel?: string | null;
  readonly description?: string | null;
  readonly id: string;
  readonly label: string;
  readonly models: readonly AgentChatModelOption[];
  readonly statusLabel?: string | null;
  readonly thinkingLevels?: readonly AgentChatThinkingLevelOption[];
};

export type AgentChatThreadListEntry = {
  readonly activeTurnId?: string | null;
  readonly archivedAt?: string | null;
  readonly createdAt?: string | null;
  readonly id: string;
  readonly lastError?: string | null;
  readonly model?: string | null;
  readonly origin?: AgentChatThreadOrigin | null;
  readonly providerId?: string | null;
  readonly runtimeMode?: AgentChatRuntimeMode | null;
  readonly status: AgentChatThreadStatus;
  readonly summary?: string | null;
  readonly thinkingLevel?: string | null;
  readonly title: string;
  readonly unreadCount?: number;
  readonly updatedAt?: string | null;
};

export type AgentChatThreadOrigin = {
  readonly agentId?: string | null;
  readonly commentId?: string | null;
  readonly issueId?: string | null;
  readonly jobId?: string | null;
  readonly kind: string;
  readonly label?: string | null;
  readonly repositoryId?: string | null;
  readonly trigger?: string | null;
};

export type AgentChatMessageRole = "assistant" | "system" | "user";

export type AgentChatMessage = {
  readonly createdAt: string;
  readonly id: string;
  readonly role: AgentChatMessageRole;
  readonly sequence?: number;
  readonly streaming?: boolean;
  readonly text: string;
  readonly turnId?: string | null;
  readonly updatedAt?: string | null;
};

export type AgentChatActivityKind =
  | "error"
  | "progress"
  | "question"
  | "system"
  | "thinking"
  | "tool"
  | "usage";

export type AgentChatActivityStatus = "cancelled" | "completed" | "failed" | "pending" | "running";

export type AgentChatActivityPayload = Record<string, unknown>;

export type AgentChatActivity = {
  readonly createdAt: string;
  readonly detail?: string | null;
  readonly id: string;
  readonly kind: AgentChatActivityKind;
  readonly payload?: AgentChatActivityPayload | null;
  readonly sequence?: number;
  readonly status?: AgentChatActivityStatus | null;
  readonly title: string;
  readonly turnId?: string | null;
  readonly updatedAt?: string | null;
};

export type AgentChatApprovalKind = "command" | "file-change" | "permissions" | "unknown";

export type AgentChatApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type AgentChatApprovalRequest = {
  readonly activity: AgentChatActivity;
  readonly createdAt: string;
  readonly defaultDecision?: AgentChatApprovalDecision | null;
  readonly details?: AgentChatActivityPayload | null;
  readonly kind: AgentChatApprovalKind;
  readonly requestId: string;
};

export type AgentChatApprovalDecisionInput = {
  readonly activity: AgentChatActivity;
  readonly decision: AgentChatApprovalDecision;
  readonly kind: AgentChatApprovalKind;
  readonly requestId: string;
};

export type AgentChatQuestionStatus = "answered" | "cancelled" | "expired" | "open";

export type AgentChatQuestionOption = {
  readonly description?: string | null;
  readonly disabled?: boolean;
  readonly label: string;
  readonly value?: string;
};

export type AgentChatQuestionItem = {
  readonly header: string;
  readonly id: string;
  readonly multiSelect: boolean;
  readonly options: readonly AgentChatQuestionOption[];
  readonly question: string;
};

export type AgentChatQuestion = {
  readonly answeredAt?: string | null;
  readonly createdAt: string;
  readonly id: string;
  readonly prompt: string;
  readonly questions: readonly AgentChatQuestionItem[];
  readonly sequence?: number;
  readonly status: AgentChatQuestionStatus;
  readonly turnId: string;
  readonly updatedAt?: string | null;
};

export type AgentChatQuestionDraft = Record<string, readonly string[]>;

export type AgentChatQuestionAnswer = {
  readonly items: readonly {
    readonly itemId: string;
    readonly selectedOptionValues: readonly string[];
  }[];
  readonly questionId: string;
};

export type AgentChatTimelineEntry =
  | {
      readonly activity: AgentChatActivity;
      readonly createdAt?: string;
      readonly id: string;
      readonly kind: "activity";
      readonly sequence?: number;
    }
  | {
      readonly createdAt?: string;
      readonly id: string;
      readonly kind: "message";
      readonly message: AgentChatMessage;
      readonly sequence?: number;
    }
  | {
      readonly createdAt?: string;
      readonly id: string;
      readonly kind: "question";
      readonly question: AgentChatQuestion;
      readonly sequence?: number;
    };

export type AgentChatThreadDetail = AgentChatThreadListEntry & {
  readonly timeline: readonly AgentChatTimelineEntry[];
  readonly turnStatus?: AgentChatTurnStatus | null;
};

export const getAgentChatQuestionOptionValue = (option: AgentChatQuestionOption): string =>
  option.value ?? option.label;

const icon = (Icon: LucideIcon, className = "size-4") => (
  <Icon aria-hidden className={className} strokeWidth={1.8} />
);

const statusTone = {
  active: "info",
  archived: "neutral",
  draft: "neutral",
  error: "danger",
  waiting: "warning",
} satisfies Record<AgentChatThreadStatus, ComponentTone>;

const threadStatusLabel = {
  active: "active",
  archived: "archived",
  draft: "draft",
  error: "failed",
  waiting: "waiting",
} satisfies Record<AgentChatThreadStatus, string>;

const threadStatusMarkerClassName = {
  active: "bg-primary",
  archived: "bg-muted-foreground/45",
  draft: "bg-border",
  error: "bg-destructive",
  waiting: "bg-warning",
} satisfies Record<AgentChatThreadStatus, string>;

const turnStatusTone = {
  cancelled: "neutral",
  completed: "success",
  failed: "danger",
  queued: "neutral",
  running: "info",
  waiting_for_user: "warning",
} satisfies Record<AgentChatTurnStatus, ComponentTone>;

export const originLabel = (origin?: AgentChatThreadOrigin | null): string | null => {
  if (!origin) return null;
  if (origin.label) return origin.label;

  switch (origin.kind) {
    case "issue-comment":
      return origin.issueId ? `Issue ${origin.issueId}` : "Issue comment";
    case "agent-work":
      return "Agent work";
    default:
      return origin.kind;
  }
};

const originBadgeLabel = (origin?: AgentChatThreadOrigin | null): string | null => {
  if (!origin) return null;

  switch (origin.kind) {
    case "issue-comment":
      return "Issue comment";
    case "agent-work":
      return "Agent work";
    default:
      return origin.kind;
  }
};

export const originDescription = (origin?: AgentChatThreadOrigin | null): string | null => {
  if (!origin) return null;

  const parts = [
    origin.repositoryId ? `Repository ${origin.repositoryId}` : null,
    origin.issueId ? `Issue ${origin.issueId}` : null,
    origin.commentId ? `Comment ${origin.commentId}` : null,
    origin.jobId ? `Job ${origin.jobId}` : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(" / ") : originLabel(origin);
};

const activityKindIcon = {
  error: AlertTriangle,
  progress: Radio,
  question: HelpCircle,
  system: Info,
  thinking: Brain,
  tool: Wrench,
  usage: CheckCircle2,
} satisfies Record<AgentChatActivityKind, LucideIcon>;

const activityStatusTone = {
  cancelled: "neutral",
  completed: "success",
  failed: "danger",
  pending: "neutral",
  running: "info",
} satisfies Record<AgentChatActivityStatus, ComponentTone>;

const activityStatusLabel = {
  cancelled: "Cancelled",
  completed: "Done",
  failed: "Failed",
  pending: "Pending",
  running: "Running",
} satisfies Record<AgentChatActivityStatus, string>;

const connectionStatusCopy = {
  connected: {
    description: "Live updates are active.",
    icon: CheckCircle2,
    message: "Connected",
    tone: "success",
  },
  connecting: {
    description: "Opening the local chat session.",
    icon: LoaderCircle,
    message: "Connecting",
    tone: "neutral",
  },
  disconnected: {
    description: "Messages can be drafted, but live updates are paused.",
    icon: AlertCircle,
    message: "Disconnected",
    tone: "warning",
  },
  failed: {
    description: "The chat session failed and needs to reconnect.",
    icon: CircleAlert,
    message: "Connection failed",
    tone: "danger",
  },
  reconnecting: {
    description: "Restoring the local chat session.",
    icon: RefreshCw,
    message: "Reconnecting",
    tone: "warning",
  },
} satisfies Record<
  AgentChatConnectionStatus,
  {
    readonly description: string;
    readonly icon: LucideIcon;
    readonly message: string;
    readonly tone: ComponentTone;
  }
>;

const labelForRole = (role: AgentChatMessageRole) => {
  if (role === "assistant") return "Cycle Agent";
  if (role === "system") return "System";
  return "You";
};

const providerAvailabilityLabel = (availability: AgentChatProviderAvailability = "available") => {
  if (availability === "available") return "Available";
  if (availability === "unsupported") return "Unsupported";
  return "Unavailable";
};

const runtimeModeItems: readonly SelectItem[] = [
  {
    label: "Read only",
    value: "read-only",
  },
  {
    label: "Workspace write",
    value: "workspace-write",
  },
  {
    label: "Full access",
    value: "full-access",
  },
];

const runtimeModeLabel = (runtimeMode?: AgentChatRuntimeMode | null): string => {
  if (runtimeMode === "workspace-write") return "Workspace write";
  if (runtimeMode === "full-access") return "Full access";
  return "Read only";
};

const formatPayloadValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringPayloadValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const approvalKindFromUnknown = (value: unknown): AgentChatApprovalKind =>
  value === "command" || value === "file-change" || value === "permissions" || value === "unknown"
    ? value
    : "unknown";

const approvalDecisionFromUnknown = (value: unknown): AgentChatApprovalDecision | undefined =>
  value === "accept" || value === "acceptForSession" || value === "decline" || value === "cancel"
    ? value
    : undefined;

const approvalDecisionLabel = (decision: AgentChatApprovalDecision): string => {
  switch (decision) {
    case "accept":
      return "Approve once";
    case "acceptForSession":
      return "Approve session";
    case "decline":
      return "Decline";
    case "cancel":
      return "Cancel";
  }
};

const approvalKindLabel = (kind: AgentChatApprovalKind): string => {
  switch (kind) {
    case "command":
      return "Command";
    case "file-change":
      return "File change";
    case "permissions":
      return "Permission";
    case "unknown":
      return "Approval";
  }
};

const activityLooksLikeApproval = (activity: AgentChatActivity): boolean =>
  activity.kind === "question" && /approval/iu.test(activity.title);

export const agentChatApprovalRequestFromActivity = (
  activity: AgentChatActivity,
): AgentChatApprovalRequest | undefined => {
  if (!activityLooksLikeApproval(activity)) return undefined;

  const payload = activity.payload;
  const requestId = stringPayloadValue(payload?.requestId);
  if (requestId === undefined) return undefined;

  return {
    activity,
    createdAt: stringPayloadValue(payload?.createdAt) ?? activity.createdAt,
    defaultDecision: approvalDecisionFromUnknown(payload?.defaultDecision) ?? null,
    details: isRecord(payload?.details) ? payload.details : null,
    kind: approvalKindFromUnknown(payload?.kind),
    requestId,
  };
};

export const isAgentChatApprovalActivity = (activity: AgentChatActivity): boolean =>
  agentChatApprovalRequestFromActivity(activity) !== undefined;

const hiddenActivityPayloadKeys = new Set([
  "command",
  "delta",
  "diff",
  "event",
  "eventType",
  "input",
  "item",
  "itemId",
  "itemType",
  "metadata",
  "name",
  "output",
  "patch",
  "requestId",
  "response",
  "streamKind",
]);

const compactActivityGenericTitles = new Set(["MCP tool", "Provider activity", "Tool call"]);
const genericToolNames = new Set([
  "command_execution",
  "mcp_tool_call",
  "tool",
  "tool.completed",
  "tool.started",
]);

const genericToolLabel = (name: string | undefined): string | undefined => {
  if (name === "command_execution") return "Command";
  if (name === "mcp_tool_call") return "MCP tool";
  return undefined;
};

const payloadString = (
  payload: AgentChatActivityPayload | null | undefined,
  key: string,
): string | undefined => {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const commandFromUnknown = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value.join(" ");
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const command = commandFromUnknown(entry);
      if (command !== undefined) return command;
    }
  }
  if (isRecord(value)) {
    return (
      commandFromUnknown(value.command) ??
      commandFromUnknown(value.argv) ??
      commandFromUnknown(value.args) ??
      commandFromUnknown(value.commandActions)
    );
  }
  return undefined;
};

const compactUnknownValue = (value: unknown): string | undefined => {
  const formatted = formatPayloadValue(value);
  if (formatted !== undefined) return formatted;
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (isRecord(value)) {
    const serialized = JSON.stringify(value);
    return serialized.length > 160 ? `${serialized.slice(0, 157)}...` : serialized;
  }
  return undefined;
};

const nestedActivityEvent = (
  activity: AgentChatActivity,
): Readonly<Record<string, unknown>> | undefined =>
  isRecord(activity.payload?.event) ? activity.payload.event : undefined;

const eventInput = (activity: AgentChatActivity): unknown => nestedActivityEvent(activity)?.input;

const eventOutput = (activity: AgentChatActivity): unknown => nestedActivityEvent(activity)?.output;

const eventToolName = (activity: AgentChatActivity): string | undefined =>
  stringPayloadValue(nestedActivityEvent(activity)?.toolName);

const toolLabelFromUnknown = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;
  const namespace =
    stringPayloadValue(value.namespace) ??
    stringPayloadValue(value.server) ??
    stringPayloadValue(value.mcpServer);
  const tool = stringPayloadValue(value.tool) ?? stringPayloadValue(value.name);
  return (
    [namespace, tool].filter((part): part is string => part !== undefined).join(".") || undefined
  );
};

const activityCommandLabel = (activity: AgentChatActivity): string | undefined =>
  payloadString(activity.payload, "command") ??
  commandFromUnknown(eventInput(activity)) ??
  commandFromUnknown(activity.payload?.input);

const activityToolLabel = (activity: AgentChatActivity): string | undefined => {
  const payloadTool = payloadString(activity.payload, "tool");
  if (payloadTool) {
    const payloadNamespace = payloadString(activity.payload, "namespace");
    return [payloadNamespace, payloadTool].filter(Boolean).join(".");
  }

  const inputTool =
    toolLabelFromUnknown(eventInput(activity)) ?? toolLabelFromUnknown(activity.payload?.input);
  if (inputTool !== undefined) return inputTool;

  const name = eventToolName(activity) ?? payloadString(activity.payload, "name");
  return name && !genericToolNames.has(name) ? name : undefined;
};

const activityOutputDetail = (activity: AgentChatActivity): string | undefined => {
  const output = eventOutput(activity) ?? activity.payload?.output;
  if (isRecord(output)) {
    return (
      stringPayloadValue(output.message) ??
      stringPayloadValue(output.summary) ??
      compactUnknownValue(output)
    );
  }
  return compactUnknownValue(output);
};

const activityNotificationLabel = (activity: AgentChatActivity): string => {
  const command = activityCommandLabel(activity);
  if (command) return command;

  const tool = activityToolLabel(activity);
  if (tool) return tool;

  const genericLabel = genericToolLabel(
    eventToolName(activity) ?? payloadString(activity.payload, "name"),
  );
  if (genericLabel !== undefined) return genericLabel;

  if (activity.kind === "tool" && activity.detail && activity.detail.trim().length > 0) {
    return activity.detail;
  }

  if (
    compactActivityGenericTitles.has(activity.title) &&
    activity.detail &&
    activity.detail.trim().length > 0
  ) {
    return activity.detail;
  }

  return activity.title;
};

const providerItems = (
  providers: readonly AgentChatProviderProfile[],
  providerId?: string | null,
): readonly SelectItem[] => {
  const items: SelectItem[] = [
    {
      label: "No provider selected",
      value: "",
    },
  ];

  for (const provider of providers) {
    const availability = provider.availability ?? "available";
    items.push({
      disabled: availability !== "available",
      label:
        availability === "available"
          ? provider.label
          : `${provider.label} (${provider.statusLabel ?? providerAvailabilityLabel(availability)})`,
      value: provider.id,
    });
  }

  if (providerId && !providers.some((provider) => provider.id === providerId)) {
    items.push({
      disabled: true,
      label: `${providerId} (unavailable)`,
      value: providerId,
    });
  }

  return items;
};

const modelItems = (
  providers: readonly AgentChatProviderProfile[],
  providerId?: string | null,
  model?: string | null,
): readonly SelectItem[] => {
  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const models = selectedProvider?.models ?? [];
  const items: SelectItem[] = [
    {
      disabled: true,
      label: selectedProvider ? "Select model" : "Select provider first",
      value: "",
    },
  ];

  for (const modelOption of models) {
    items.push({
      disabled: modelOption.disabled,
      label: modelOption.label,
      value: modelOption.id,
    });
  }

  if (model && !models.some((modelOption) => modelOption.id === model)) {
    items.push({
      disabled: true,
      label: `${model} (unavailable)`,
      value: model,
    });
  }

  return items;
};

const thinkingLevelsForProvider = (
  providers: readonly AgentChatProviderProfile[],
  providerId?: string | null,
): readonly AgentChatThinkingLevelOption[] =>
  providers.find((provider) => provider.id === providerId)?.thinkingLevels ?? [];

const compactSelectClassName =
  "h-7 w-auto min-w-0 border-transparent bg-transparent px-1.5 py-1 text-xs shadow-none hover:border-transparent hover:bg-subtle focus-visible:ring-1";

const AgentChatInlineSetting = ({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: React.ReactNode;
}) => (
  <span className="inline-flex min-w-0 items-center gap-1.5">
    <Text as="span" className="shrink-0" tone="muted" variant="meta">
      {label}
    </Text>
    {children}
  </span>
);

export type AgentChatTurnStatusIndicatorProps = {
  readonly className?: string;
  readonly label?: string;
  readonly status?: AgentChatTurnStatus | null;
};

export const AgentChatTurnStatusIndicator = ({
  className,
  label,
  status,
}: AgentChatTurnStatusIndicatorProps) => {
  if (!status) return null;

  const isRunning = status === "queued" || status === "running";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "grid size-4 place-items-center rounded-full",
          isRunning && "animate-pulse text-primary",
          status === "failed" && "text-destructive",
          status === "waiting_for_user" && "text-warning",
          status === "completed" && "text-success",
          status === "cancelled" && "text-muted-foreground",
        )}
      >
        {isRunning ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : status === "completed" ? (
          <CheckCircle2 className="size-3.5" />
        ) : status === "failed" ? (
          <XCircle className="size-3.5" />
        ) : status === "waiting_for_user" ? (
          <HelpCircle className="size-3.5" />
        ) : (
          <Circle className="size-3.5" />
        )}
      </span>
      <Badge tone={turnStatusTone[status]}>{label ?? status.replaceAll("_", " ")}</Badge>
    </span>
  );
};

export type AgentChatConnectionStatusBannerProps = {
  readonly className?: string;
  readonly status: AgentChatConnectionStatus;
};

export const AgentChatConnectionStatusBanner = ({
  className,
  status,
}: AgentChatConnectionStatusBannerProps) => {
  if (status === "connected") return null;

  const copy = connectionStatusCopy[status];
  const Icon = copy.icon;

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3 border-b border-border bg-subtle/70 px-4 py-3",
        className,
      )}
      role={status === "failed" ? "alert" : "status"}
    >
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center",
          copy.tone === "danger" && "text-destructive",
          copy.tone === "warning" && "text-warning",
          copy.tone === "neutral" && "text-muted-foreground",
        )}
      >
        <Icon aria-hidden className={cn("size-4", status === "reconnecting" && "animate-spin")} />
      </span>
      <span className="min-w-0">
        <Text as="span" className="block" variant="panelTitle">
          {copy.message}
        </Text>
        <Text as="span" className="block" tone="muted" variant="meta">
          {copy.description}
        </Text>
      </span>
    </div>
  );
};

export type AgentChatThreadListItemProps = {
  readonly className?: string;
  readonly onThreadDelete?: (threadId: string) => void;
  readonly onThreadSelect?: (threadId: string) => void;
  readonly relativeBase?: Date | string;
  readonly selected?: boolean;
  readonly thread: AgentChatThreadListEntry;
};

export const AgentChatThreadListItem = ({
  className,
  onThreadDelete,
  onThreadSelect,
  relativeBase,
  selected = false,
  thread,
}: AgentChatThreadListItemProps) => {
  const source = originBadgeLabel(thread.origin);
  const preview = thread.lastError ?? thread.summary;

  return (
    <div
      className={cn(
        "group relative w-full border-b border-border transition-colors last:border-b-0",
        "hover:bg-subtle/70 focus-within:bg-subtle/70",
        selected && "bg-primary/6 shadow-[inset_2px_0_0_var(--cycle-color-primary)]",
        thread.status === "archived" && "text-muted-foreground",
        className,
      )}
      data-state={selected ? "selected" : "idle"}
    >
      <button
        aria-current={selected ? "page" : undefined}
        className={cn(
          "block w-full min-w-0 px-3 py-2 text-left",
          onThreadDelete && "pr-9",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        )}
        disabled={onThreadSelect === undefined}
        onClick={() => onThreadSelect?.(thread.id)}
        type="button"
      >
        <span className="block min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="grid size-3 shrink-0 place-items-center">
              {thread.activeTurnId ? (
                <LoaderCircle
                  aria-hidden
                  className="size-3 animate-spin text-primary"
                  strokeWidth={2}
                />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    threadStatusMarkerClassName[thread.status],
                  )}
                />
              )}
            </span>
            <Text as="span" className="min-w-0 flex-1" truncate variant="panelTitle" wrap="nowrap">
              {thread.title}
            </Text>
            {thread.unreadCount ? (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                {thread.unreadCount}
              </span>
            ) : null}
            {thread.updatedAt ? (
              <DateTime
                className="shrink-0 text-[11px] font-medium leading-4 text-muted-foreground"
                format="relative"
                relativeBase={relativeBase}
                value={thread.updatedAt}
              />
            ) : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <Text
              as="span"
              className="shrink-0"
              tone={statusTone[thread.status]}
              variant="meta"
              wrap="nowrap"
            >
              {threadStatusLabel[thread.status]}
            </Text>
            {source ? (
              <>
                <span aria-hidden className="size-1 rounded-full bg-border" />
                <Text
                  as="span"
                  className="min-w-0 max-w-20 shrink-0"
                  tone="muted"
                  truncate
                  variant="meta"
                  wrap="nowrap"
                >
                  {source}
                </Text>
              </>
            ) : null}
            {thread.providerId ? (
              <>
                <span aria-hidden className="size-1 rounded-full bg-border" />
                <Text
                  as="span"
                  className="min-w-0 max-w-28 shrink-0"
                  tone="muted"
                  truncate
                  variant="meta"
                  wrap="nowrap"
                >
                  {thread.providerId}
                  {thread.model ? ` / ${thread.model}` : ""}
                </Text>
              </>
            ) : null}
            {preview ? (
              <>
                <span aria-hidden className="size-1 rounded-full bg-border" />
                <Text
                  as="span"
                  className="min-w-0 flex-1"
                  tone={thread.lastError ? "danger" : "muted"}
                  truncate
                  variant="meta"
                  wrap="nowrap"
                >
                  {preview}
                </Text>
              </>
            ) : null}
          </span>
        </span>
      </button>
      {onThreadDelete ? (
        <IconButton
          className={cn(
            "absolute right-1.5 top-1/2 size-7 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
            thread.activeTurnId &&
              "opacity-45 group-hover:opacity-45 group-focus-within:opacity-45",
          )}
          disabled={Boolean(thread.activeTurnId)}
          icon={<Trash2 aria-hidden className="size-3.5" />}
          label={`Delete ${thread.title}`}
          onClick={() => onThreadDelete(thread.id)}
          size="sm"
          title={thread.activeTurnId ? "Cannot delete while a turn is active" : "Delete chat"}
          tone="danger"
          variant="ghost"
        />
      ) : null}
    </div>
  );
};

export type AgentChatStreamingTextProps = {
  readonly className?: string;
  readonly streaming?: boolean;
  readonly text: string;
};

export const AgentChatStreamingText = ({
  className,
  streaming = false,
  text,
}: AgentChatStreamingTextProps) => (
  <div className={cn("relative min-w-0", className)}>
    <MarkdownRenderer className="gap-2" markdown={text || (streaming ? " " : "")} />
    {streaming ? (
      <span
        aria-hidden
        className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-primary"
      />
    ) : null}
  </div>
);

export type AgentChatMessageRowProps = {
  readonly className?: string;
  readonly message: AgentChatMessage;
  readonly onCopyMessage?: (message: AgentChatMessage) => void;
  readonly relativeBase?: Date | string;
};

export const AgentChatMessageRow = ({
  className,
  message,
  onCopyMessage,
  relativeBase,
}: AgentChatMessageRowProps) => {
  const assistant = message.role === "assistant";
  const system = message.role === "system";
  const Icon = assistant ? Bot : system ? Terminal : UserRound;

  return (
    <article
      className={cn(
        "group grid min-w-0 grid-cols-[82px_minmax(0,1fr)] gap-3 border-b border-border/70 px-1 py-2.5 last:border-b-0",
        message.streaming && "bg-primary/5",
        className,
      )}
    >
      <div className="min-w-0 pt-0.5">
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-xs font-medium",
            assistant && "text-primary",
            system && "text-muted-foreground",
            message.role === "user" && "text-foreground",
          )}
        >
          <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
          <span className="min-w-0 truncate">{labelForRole(message.role)}</span>
        </div>
        <DateTime
          className="mt-1 block text-[11px] text-muted-foreground"
          format="time"
          relativeBase={relativeBase}
          value={message.createdAt}
        />
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex min-h-6 min-w-0 items-center gap-2">
          {message.streaming ? <Badge tone="info">Streaming</Badge> : null}
          {onCopyMessage ? (
            <IconButton
              className="ml-auto size-6 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              icon={icon(Copy, "size-3.5")}
              label="Copy message"
              onClick={() => onCopyMessage(message)}
              size="sm"
              variant="ghost"
            />
          ) : null}
        </div>
        <AgentChatStreamingText streaming={message.streaming} text={message.text} />
      </div>
    </article>
  );
};

export type AgentChatActivityStripProps = {
  readonly activities: readonly AgentChatActivity[];
  readonly className?: string;
  readonly maxVisible?: number;
  readonly relativeBase?: Date | string;
};

const compactPayloadValue = (value: unknown): string | undefined => {
  const compact = compactUnknownValue(value);
  return compact && compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
};

const usefulActivityPayloadEntries = (
  activity: AgentChatActivity,
): readonly (readonly [string, string])[] => {
  const event = nestedActivityEvent(activity);
  const entries: [string, string][] = [];
  const command = activityCommandLabel(activity);
  const tool = activityToolLabel(activity);
  const output = activityOutputDetail(activity);

  if (command !== undefined) entries.push(["command", command]);
  if (tool !== undefined && tool !== command) entries.push(["tool", tool]);
  const rawInput = event?.input ?? activity.payload?.input;
  const inputRecord = isRecord(rawInput) ? rawInput : undefined;
  const input = compactPayloadValue(inputRecord?.arguments ?? rawInput);
  const inputLabel = inputRecord?.arguments === undefined ? "input" : "arguments";
  if (command === undefined && input !== undefined && input !== tool) {
    entries.push([inputLabel, input]);
  } else if (command !== undefined && inputRecord?.arguments !== undefined && input !== undefined) {
    entries.push(["arguments", input]);
  }
  if (output !== undefined && output !== command && output !== tool)
    entries.push(["output", output]);

  const error =
    stringPayloadValue(event?.message) ??
    stringPayloadValue(event?.code) ??
    stringPayloadValue(activity.payload?.error);
  if (error !== undefined) entries.push(["error", error]);

  return entries;
};

const activityPayloadEntries = (
  activity: AgentChatActivity,
): readonly (readonly [string, string])[] =>
  [
    ...usefulActivityPayloadEntries(activity),
    ...Object.entries(activity.payload ?? {})
      .filter(([key]) => !hiddenActivityPayloadKeys.has(key))
      .map(([key, value]) => [key, compactPayloadValue(value)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
  ].slice(0, 6);

const activityItemType = (activity: AgentChatActivity): string | undefined =>
  payloadString(activity.payload, "itemType");

const isCommandActivity = (activity: AgentChatActivity): boolean => {
  const itemType = activityItemType(activity);
  const toolName = eventToolName(activity) ?? payloadString(activity.payload, "name");
  return (
    activityCommandLabel(activity) !== undefined ||
    itemType === "commandExecution" ||
    itemType === "command_execution" ||
    toolName === "command_execution" ||
    /^command$/iu.test(activity.title)
  );
};

const isFileActivity = (activity: AgentChatActivity): boolean => {
  const itemType = activityItemType(activity);
  return (
    itemType === "fileChange" ||
    itemType === "file_change" ||
    payloadString(activity.payload, "streamKind") === "file_change_output" ||
    activity.title.toLowerCase().includes("file") ||
    activity.payload?.diff !== undefined ||
    activity.payload?.patch !== undefined
  );
};

const isSearchActivity = (activity: AgentChatActivity): boolean => {
  const itemType = activityItemType(activity);
  const event = nestedActivityEvent(activity);
  const input = isRecord(event?.input) ? event.input : undefined;
  return (
    itemType === "webSearch" ||
    itemType === "web_search" ||
    stringPayloadValue(input?.query) !== undefined ||
    activity.title.toLowerCase().includes("search")
  );
};

const plural = (count: number, singular: string, pluralLabel = `${singular}s`): string =>
  count === 1 ? singular : pluralLabel;

const countLabel = (count: number, singular: string, pluralLabel = `${singular}s`): string =>
  count === 1 ? `a ${singular}` : `${count} ${pluralLabel}`;

const joinSummaryParts = (parts: readonly string[]): string => {
  if (parts.length <= 2) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
};

const activityDisplayTitle = (activity: AgentChatActivity): string =>
  activityNotificationLabel(activity);

const activityDisplayDetail = (activity: AgentChatActivity): string | undefined => {
  const title = activityDisplayTitle(activity);
  const output = activityOutputDetail(activity);
  if (output !== undefined && output !== title) return output;
  if (activity.detail && activity.detail.trim().length > 0 && activity.detail !== title) {
    return activity.detail;
  }
  return undefined;
};

const activityStripLabel = (activities: readonly AgentChatActivity[]): string => {
  const failed = activities.filter((activity) => activity.status === "failed").length;
  const running = activities.filter(
    (activity) => activity.status === "running" || activity.status === "pending",
  ).length;
  const commands = activities.filter(isCommandActivity);
  const files = activities.filter(
    (activity) => !isCommandActivity(activity) && isFileActivity(activity),
  );
  const searches = activities.filter(
    (activity) =>
      !isCommandActivity(activity) && !isFileActivity(activity) && isSearchActivity(activity),
  );
  const tools = activities.filter(
    (activity) =>
      activity.kind === "tool" &&
      !isCommandActivity(activity) &&
      !isFileActivity(activity) &&
      !isSearchActivity(activity),
  );
  const thinking = activities.filter((activity) => activity.kind === "thinking").length;
  const usage = activities.filter((activity) => activity.kind === "usage").length;
  const progress = activities.filter((activity) => activity.kind === "progress").length;
  const parts = [
    commands.length === 1 && activities.length === 1
      ? `Ran ${activityDisplayTitle(commands[0] as AgentChatActivity)}`
      : commands.length > 0
        ? `Ran ${commands.length} ${plural(commands.length, "command")}`
        : null,
    files.length > 0 ? `Edited ${countLabel(files.length, "file")}` : null,
    searches.length > 0
      ? `Searched ${searches.length === 1 ? "code" : `${searches.length} times`}`
      : null,
    tools.length > 0 ? `Used ${tools.length} ${plural(tools.length, "tool")}` : null,
    thinking > 0 ? `Reasoned${thinking === 1 ? "" : ` ${thinking} times`}` : null,
    usage > 0 ? "Recorded usage" : null,
    progress > 0 ? `Updated ${countLabel(progress, "progress event")}` : null,
  ].filter((part): part is string => part !== null);
  const base =
    parts.length > 0
      ? joinSummaryParts(parts)
      : `${activities.length} background ${plural(activities.length, "event")}`;
  if (failed > 0) return `${base}, ${failed} failed`;
  if (running > 0) return `${base}, ${running} active`;
  return base;
};

const activityStripIcon = (activities: readonly AgentChatActivity[]): LucideIcon => {
  if (activities.some(isCommandActivity)) return Terminal;
  if (activities.some(isFileActivity)) return PencilLine;
  if (activities.some(isSearchActivity)) return Search;
  if (activities.some((activity) => activity.kind === "thinking")) return Brain;
  return Wrench;
};

export const AgentChatActivityStrip = ({
  activities,
  className,
  maxVisible = Number.POSITIVE_INFINITY,
  relativeBase,
}: AgentChatActivityStripProps) => {
  const visibleActivities =
    Number.isFinite(maxVisible) && maxVisible > 0 ? activities.slice(-maxVisible) : activities;
  const hiddenCount = Math.max(activities.length - visibleActivities.length, 0);
  const label = activityStripLabel(activities);
  const Icon = activityStripIcon(activities);

  if (activities.length === 0) return null;

  return (
    <details
      aria-label={label}
      className={cn(
        "group/activity-strip min-w-0 border-b border-border/50 px-1 py-1.5",
        className,
      )}
    >
      <summary className="grid min-w-0 cursor-pointer list-none grid-cols-[82px_minmax(0,1fr)] gap-3 rounded-md py-1 outline-none hover:bg-subtle/55 focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span aria-hidden />
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
          <Text as="span" className="min-w-0 flex-1" truncate variant="bodyCompact">
            {label}
          </Text>
          {hiddenCount > 0 ? (
            <Badge appearance="outline" className="shrink-0">
              +{hiddenCount}
            </Badge>
          ) : null}
          <ChevronDown
            aria-hidden
            className="size-3.5 shrink-0 transition-transform group-open/activity-strip:rotate-180"
            strokeWidth={1.8}
          />
        </span>
      </summary>
      <div className="grid min-w-0 grid-cols-[82px_minmax(0,1fr)] gap-3 pb-2 pt-1">
        <span aria-hidden />
        <ol className="grid min-w-0 gap-1.5 rounded-md border border-border/70 bg-subtle/35 p-2">
          {visibleActivities.map((activity) => {
            const ActivityIcon = activityKindIcon[activity.kind];
            const title = activityDisplayTitle(activity);
            const detail = activityDisplayDetail(activity);
            const entries = activityPayloadEntries(activity).slice(0, 4);

            return (
              <li
                className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] gap-2 rounded px-2 py-1.5"
                key={activity.id}
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-5 place-items-center rounded border border-border bg-background text-muted-foreground",
                    activity.kind === "tool" && "text-accent",
                    activity.kind === "error" && "text-destructive",
                    activity.status === "running" && "animate-pulse",
                  )}
                >
                  <ActivityIcon aria-hidden className="size-3" strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <Text as="span" className="min-w-0 flex-1" truncate variant="control">
                      {title}
                    </Text>
                    {activity.status ? (
                      <Badge appearance="outline" tone={activityStatusTone[activity.status]}>
                        {activityStatusLabel[activity.status]}
                      </Badge>
                    ) : null}
                  </span>
                  {detail ? (
                    <Text
                      as="span"
                      className="mt-0.5 block font-mono text-[11px] leading-4"
                      tone="muted"
                      wrap="break"
                    >
                      {detail}
                    </Text>
                  ) : null}
                  {entries.length > 0 ? (
                    <span className="mt-1 flex min-w-0 flex-wrap gap-1">
                      {entries.map(([key, value]) => (
                        <span
                          className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          key={key}
                        >
                          <span className="font-medium text-foreground">{key}</span>
                          <span className="min-w-0 truncate">{value}</span>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <DateTime
                  className="mt-0.5 shrink-0 text-[11px] text-muted-foreground"
                  format="time"
                  relativeBase={relativeBase}
                  value={activity.createdAt}
                />
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
};

const AgentChatThinkingActivityRow = ({
  activity,
  className,
  relativeBase,
}: AgentChatActivityRowProps) => {
  const running = activity.status === "running" || activity.status === "pending";
  const failed = activity.status === "failed";
  const cancelled = activity.status === "cancelled";

  return (
    <div className={cn("grid grid-cols-[32px_minmax(0,1fr)] gap-3", className)}>
      <span
        className={cn(
          "grid size-8 place-items-center rounded-md border bg-subtle",
          running && "border-primary/25 bg-primary/8 text-primary",
          !running && !failed && !cancelled && "border-border text-muted-foreground",
          failed && "border-destructive/25 bg-destructive/8 text-destructive",
          cancelled && "border-border text-muted-foreground",
        )}
      >
        {running ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.8} />
        ) : (
          <Brain aria-hidden className="size-4" strokeWidth={1.8} />
        )}
      </span>
      <div
        className={cn(
          "flex min-h-9 min-w-0 items-center gap-2 rounded-md border px-3 py-2",
          running && "border-primary/15 bg-primary/5",
          !running && "border-border bg-subtle/45",
          failed && "border-destructive/20 bg-destructive/8",
        )}
        role={running ? "status" : undefined}
      >
        <Text as="span" className="min-w-0" truncate variant="control">
          {activity.title}
        </Text>
        {running ? (
          <span aria-hidden className="inline-flex shrink-0 items-center gap-0.5 text-primary">
            <span className="size-1 rounded-full bg-current animate-pulse" />
            <span className="size-1 rounded-full bg-current animate-pulse [animation-delay:120ms]" />
            <span className="size-1 rounded-full bg-current animate-pulse [animation-delay:240ms]" />
          </span>
        ) : null}
        {activity.status ? (
          <Badge appearance="outline" tone={activityStatusTone[activity.status]}>
            {activityStatusLabel[activity.status]}
          </Badge>
        ) : null}
        <DateTime
          className="ml-auto shrink-0 text-xs text-muted-foreground"
          format="time"
          relativeBase={relativeBase}
          value={activity.createdAt}
        />
      </div>
    </div>
  );
};

const approvalCommandFromDetails = (
  details: AgentChatActivityPayload | null | undefined,
): string | undefined => stringPayloadValue(details?.command);

const approvalCwdFromDetails = (
  details: AgentChatActivityPayload | null | undefined,
): string | undefined => stringPayloadValue(details?.cwd);

const approvalChangesFromDetails = (
  details: AgentChatActivityPayload | null | undefined,
): readonly unknown[] => (Array.isArray(details?.changes) ? details.changes : []);

const approvalChangeLabel = (change: unknown, index: number): string => {
  if (typeof change === "string" && change.trim().length > 0) return change;
  if (isRecord(change)) {
    return (
      stringPayloadValue(change.path) ??
      stringPayloadValue(change.file) ??
      stringPayloadValue(change.title) ??
      `Change ${index + 1}`
    );
  }
  return `Change ${index + 1}`;
};

const resolvedApprovalDecision = (
  activity: AgentChatActivity,
): AgentChatApprovalDecision | undefined =>
  approvalDecisionFromUnknown(activity.payload?.decision) ??
  approvalDecisionFromUnknown(activity.detail);

export type AgentChatApprovalCardProps = {
  readonly activity: AgentChatActivity;
  readonly className?: string;
  readonly onDecision?: (input: AgentChatApprovalDecisionInput) => void;
  readonly relativeBase?: Date | string;
};

export const AgentChatApprovalCard = ({
  activity,
  className,
  onDecision,
  relativeBase,
}: AgentChatApprovalCardProps) => {
  const request = agentChatApprovalRequestFromActivity(activity);
  if (request === undefined) return null;

  const status = activity.status ?? "pending";
  const pending = status === "pending";
  const command = approvalCommandFromDetails(request.details);
  const cwd = approvalCwdFromDetails(request.details);
  const changes = approvalChangesFromDetails(request.details);
  const decision = resolvedApprovalDecision(activity);
  const tone = pending ? "warning" : status === "failed" ? "danger" : "neutral";
  const actionDisabled = !pending || onDecision === undefined;

  const decide = (nextDecision: AgentChatApprovalDecision) => {
    onDecision?.({
      activity,
      decision: nextDecision,
      kind: request.kind,
      requestId: request.requestId,
    });
  };

  return (
    <div className={cn("grid grid-cols-[32px_minmax(0,1fr)] gap-3", className)}>
      <span
        className={cn(
          "grid size-8 place-items-center rounded-md border",
          pending && "border-warning/30 bg-warning/12 text-warning",
          status === "completed" && "border-success/25 bg-success/8 text-success",
          status === "failed" && "border-destructive/25 bg-destructive/8 text-destructive",
          status === "cancelled" && "border-border bg-subtle text-muted-foreground",
        )}
      >
        <HelpCircle aria-hidden className="size-4" strokeWidth={1.8} />
      </span>
      <section
        className={cn(
          "min-w-0 rounded-lg border bg-surface px-4 py-4",
          pending && "border-warning/30 bg-warning/5",
          status === "completed" && "border-success/20 bg-success/5",
          status === "failed" && "border-destructive/25 bg-destructive/8",
          status === "cancelled" && "border-border bg-subtle/45",
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Text as="h3" variant="sectionTitle" wrap="break">
                {activity.title}
              </Text>
              <Badge appearance="outline" tone={tone}>
                {activity.status ? activityStatusLabel[activity.status] : "Pending"}
              </Badge>
              <Badge appearance="outline">{approvalKindLabel(request.kind)}</Badge>
              {decision ? (
                <Badge
                  appearance="outline"
                  tone={
                    decision === "accept" || decision === "acceptForSession" ? "success" : "neutral"
                  }
                >
                  {approvalDecisionLabel(decision)}
                </Badge>
              ) : null}
            </div>
            <DateTime
              className="mt-1 block text-xs text-muted-foreground"
              format="time"
              relativeBase={relativeBase}
              value={activity.createdAt}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {command ? (
            <div className="grid gap-2">
              <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <Terminal aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
                <Text as="span" variant="meta">
                  Command
                </Text>
              </div>
              <pre className="max-h-48 min-w-0 overflow-auto rounded-md border border-border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground">
                <code className="whitespace-pre-wrap break-words">{command}</code>
              </pre>
            </div>
          ) : activity.detail ? (
            <Text as="p" tone="muted" variant="bodyCompact" wrap="break">
              {activity.detail}
            </Text>
          ) : null}

          {changes.length > 0 ? (
            <div className="rounded-md border border-border bg-popover px-3 py-2">
              <Text as="div" tone="muted" variant="meta">
                {changes.length} file change{changes.length === 1 ? "" : "s"}
              </Text>
              <ul className="mt-2 grid gap-1 text-xs text-popover-foreground">
                {changes.slice(0, 5).map((change, index) => (
                  <li className="min-w-0 truncate" key={index}>
                    {approvalChangeLabel(change, index)}
                  </li>
                ))}
              </ul>
              {changes.length > 5 ? (
                <Text as="div" className="mt-1" tone="muted" variant="meta">
                  +{changes.length - 5} more
                </Text>
              ) : null}
            </div>
          ) : null}

          {cwd ? (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-subtle px-2 py-1 text-xs text-muted-foreground">
                <span className="shrink-0 font-medium text-foreground">cwd</span>
                <span className="min-w-0 truncate">{cwd}</span>
              </span>
            </div>
          ) : null}
          <details className="group/details text-xs text-muted-foreground">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded px-1 py-0.5 outline-none hover:bg-subtle focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              Details
              <ChevronDown
                aria-hidden
                className="size-3 transition-transform group-open/details:rotate-180"
                strokeWidth={1.8}
              />
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {request.defaultDecision ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-subtle px-2 py-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">default</span>
                  {approvalDecisionLabel(request.defaultDecision)}
                </span>
              ) : null}
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-subtle px-2 py-1 text-xs text-muted-foreground">
                <span className="shrink-0 font-medium text-foreground">requestId</span>
                <span className="min-w-0 truncate">{request.requestId}</span>
              </span>
            </div>
          </details>
        </div>

        {pending ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              disabled={actionDisabled}
              leftIcon={<Check aria-hidden className="size-3.5" />}
              onClick={() => decide("accept")}
              size="sm"
              tone="success"
            >
              Approve once
            </Button>
            <Button
              disabled={actionDisabled}
              leftIcon={<CheckCircle2 aria-hidden className="size-3.5" />}
              onClick={() => decide("acceptForSession")}
              size="sm"
              tone="success"
              variant="outline"
            >
              Approve session
            </Button>
            <Button
              disabled={actionDisabled}
              leftIcon={<XCircle aria-hidden className="size-3.5" />}
              onClick={() => decide("decline")}
              size="sm"
              tone="danger"
              variant="outline"
            >
              Decline
            </Button>
            <Button
              disabled={actionDisabled}
              onClick={() => decide("cancel")}
              size="sm"
              tone="neutral"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
};

export type AgentChatActivityRowProps = {
  readonly activity: AgentChatActivity;
  readonly className?: string;
  readonly onApprovalDecision?: (input: AgentChatApprovalDecisionInput) => void;
  readonly relativeBase?: Date | string;
};

export const AgentChatActivityRow = ({
  activity,
  className,
  onApprovalDecision,
  relativeBase,
}: AgentChatActivityRowProps) => {
  if (activity.kind === "thinking") {
    return (
      <AgentChatThinkingActivityRow
        activity={activity}
        className={className}
        relativeBase={relativeBase}
      />
    );
  }

  if (isAgentChatApprovalActivity(activity)) {
    return (
      <AgentChatApprovalCard
        activity={activity}
        className={className}
        onDecision={onApprovalDecision}
        relativeBase={relativeBase}
      />
    );
  }

  const Icon = activityKindIcon[activity.kind];
  const tone = activity.status ? activityStatusTone[activity.status] : "neutral";
  const title = activityDisplayTitle(activity);
  const detail = activityDisplayDetail(activity);
  const payloadEntries = Object.entries(activity.payload ?? {})
    .filter(([key]) => !hiddenActivityPayloadKeys.has(key))
    .map(([key, value]) => [key, formatPayloadValue(value)] as const)
    .filter(([, value]) => value !== undefined)
    .slice(0, 4);

  return (
    <div className={cn("grid grid-cols-[32px_minmax(0,1fr)] gap-3", className)}>
      <span
        className={cn(
          "grid size-8 place-items-center rounded-md border border-border bg-subtle text-muted-foreground",
          activity.kind === "tool" && "text-accent",
          activity.kind === "error" && "text-destructive",
          activity.status === "running" && "animate-pulse",
        )}
      >
        <Icon aria-hidden className="size-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Text as="span" className="min-w-0" truncate variant="panelTitle">
                {title}
              </Text>
              <Badge appearance="outline" tone={tone}>
                {activity.status ? activityStatusLabel[activity.status] : activity.kind}
              </Badge>
            </div>
            {detail ? (
              <Text as="p" className="mt-1" tone="muted" variant="bodyCompact" wrap="break">
                {detail}
              </Text>
            ) : null}
          </div>
          <DateTime
            className="shrink-0 text-xs text-muted-foreground"
            format="time"
            relativeBase={relativeBase}
            value={activity.createdAt}
          />
        </div>
        {payloadEntries.length > 0 ? (
          <details className="group/details mt-3 text-xs text-muted-foreground">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded px-1 py-0.5 outline-none hover:bg-subtle focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              Details
              <ChevronDown
                aria-hidden
                className="size-3 transition-transform group-open/details:rotate-180"
                strokeWidth={1.8}
              />
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {payloadEntries.map(([key, value]) => (
                <span
                  className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-subtle px-2 py-1 text-xs text-muted-foreground"
                  key={key}
                >
                  <span className="font-medium text-foreground">{key}</span>
                  <span className="min-w-0 truncate">{value}</span>
                </span>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
};

export type AgentChatProviderModelPickerProps = {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly model?: string | null;
  readonly onModelChange?: (model: string | null) => void;
  readonly onProviderChange?: (providerId: string | null) => void;
  readonly providerId?: string | null;
  readonly providers: readonly AgentChatProviderProfile[];
};

export const AgentChatProviderModelPicker = ({
  className,
  disabled = false,
  model,
  onModelChange,
  onProviderChange,
  providerId,
  providers,
}: AgentChatProviderModelPickerProps) => (
  <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2", className)}>
    <AgentChatInlineSetting label="Agent">
      <Select
        aria-label="Agent provider"
        className={compactSelectClassName}
        disabled={disabled || onProviderChange === undefined}
        items={providerItems(providers, providerId)}
        onValueChange={(value) => {
          onProviderChange?.(value && value.length > 0 ? value : null);
        }}
        placeholder="Provider"
        value={providerId ?? ""}
      />
    </AgentChatInlineSetting>
    <AgentChatInlineSetting label="Model">
      <Select
        aria-label="Agent model"
        className={compactSelectClassName}
        disabled={disabled || !providerId || onModelChange === undefined}
        items={modelItems(providers, providerId, model)}
        onValueChange={(value) => {
          onModelChange?.(value && value.length > 0 ? value : null);
        }}
        placeholder="Model"
        value={model ?? ""}
      />
    </AgentChatInlineSetting>
  </div>
);

export type AgentChatThinkingSelectorProps = {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onThinkingLevelChange?: (thinkingLevel: string | null) => void;
  readonly providerId?: string | null;
  readonly providers: readonly AgentChatProviderProfile[];
  readonly thinkingLevel?: string | null;
};

export type AgentChatRuntimeModePickerProps = {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onRuntimeModeChange?: (runtimeMode: AgentChatRuntimeMode | null) => void;
  readonly runtimeMode?: AgentChatRuntimeMode | null;
};

export const AgentChatRuntimeModePicker = ({
  className,
  disabled = false,
  onRuntimeModeChange,
  runtimeMode,
}: AgentChatRuntimeModePickerProps) => (
  <AgentChatInlineSetting label="Permissions">
    <Select
      aria-label="Permission mode"
      className={cn(compactSelectClassName, className)}
      disabled={disabled || onRuntimeModeChange === undefined}
      items={runtimeModeItems}
      onValueChange={(value) =>
        onRuntimeModeChange?.(
          value === "read-only" || value === "workspace-write" || value === "full-access"
            ? value
            : null,
        )
      }
      placeholder="Permissions"
      value={runtimeMode ?? "read-only"}
    />
  </AgentChatInlineSetting>
);

export const AgentChatThinkingSelector = ({
  className,
  disabled = false,
  onThinkingLevelChange,
  providerId,
  providers,
  thinkingLevel,
}: AgentChatThinkingSelectorProps) => {
  const levels = thinkingLevelsForProvider(providers, providerId);
  const hasSelectedUnavailable =
    thinkingLevel && !levels.some((level) => level.id === thinkingLevel);
  const items: SelectItem[] =
    levels.length > 0
      ? [
          {
            label: "Default",
            value: "",
          },
          ...levels.map((level) => ({
            disabled: level.disabled,
            label: level.label,
            value: level.id,
          })),
        ]
      : [
          {
            disabled: true,
            label: "Unsupported",
            value: "",
          },
        ];

  if (hasSelectedUnavailable && thinkingLevel) {
    items.push({
      disabled: true,
      label: `${thinkingLevel} (unavailable)`,
      value: thinkingLevel,
    });
  }

  return (
    <AgentChatInlineSetting label="Reasoning">
      <Select
        aria-label="Reasoning level"
        className={cn(compactSelectClassName, className)}
        disabled={disabled || levels.length === 0 || onThinkingLevelChange === undefined}
        items={items}
        onValueChange={(value) => onThinkingLevelChange?.(value && value.length > 0 ? value : null)}
        placeholder="Reasoning"
        value={thinkingLevel ?? ""}
      />
    </AgentChatInlineSetting>
  );
};

export type AgentChatAnswerOptionGroupProps = {
  readonly disabled?: boolean;
  readonly item: AgentChatQuestionItem;
  readonly onValueChange?: (values: readonly string[]) => void;
  readonly value?: readonly string[];
};

export const AgentChatAnswerOptionGroup = ({
  disabled = false,
  item,
  onValueChange,
  value: selectedValues = [],
}: AgentChatAnswerOptionGroupProps) => {
  const selectedSet = React.useMemo(() => new Set(selectedValues), [selectedValues]);

  const toggleValue = (optionValue: string) => {
    if (item.multiSelect) {
      onValueChange?.(
        selectedSet.has(optionValue)
          ? selectedValues.filter((selectedValue) => selectedValue !== optionValue)
          : [...selectedValues, optionValue],
      );
      return;
    }

    onValueChange?.([optionValue]);
  };

  return (
    <div
      aria-label={item.question}
      className="grid gap-2"
      role={item.multiSelect ? "group" : "radiogroup"}
    >
      {item.options.map((option) => {
        const value = getAgentChatQuestionOptionValue(option);
        const selected = selectedSet.has(value);

        return (
          <button
            aria-checked={selected}
            className={cn(
              "grid min-h-12 grid-cols-[18px_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-popover px-3 py-2 text-left transition-colors",
              "hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              selected && "border-primary/40 bg-primary/10",
              (disabled || option.disabled) && "pointer-events-none opacity-45",
            )}
            disabled={disabled || option.disabled || onValueChange === undefined}
            key={value}
            onClick={() => toggleValue(value)}
            role={item.multiSelect ? "checkbox" : "radio"}
            type="button"
          >
            <span
              className={cn(
                "mt-0.5 grid size-[18px] place-items-center rounded border border-border text-transparent",
                selected && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {selected ? <Check aria-hidden className="size-3.5" strokeWidth={2.4} /> : null}
            </span>
            <span className="min-w-0">
              <Text as="span" className="block" variant="control" wrap="break">
                {option.label}
              </Text>
              {option.description ? (
                <Text as="span" className="mt-0.5 block" tone="muted" variant="meta" wrap="break">
                  {option.description}
                </Text>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export type AgentChatQuestionCardProps = {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly draft?: AgentChatQuestionDraft;
  readonly onAnswer?: (answer: AgentChatQuestionAnswer) => void;
  readonly onDraftChange?: (itemId: string, selectedOptionValues: readonly string[]) => void;
  readonly question: AgentChatQuestion;
  readonly relativeBase?: Date | string;
};

export const AgentChatQuestionCard = ({
  className,
  disabled = false,
  draft = {},
  onAnswer,
  onDraftChange,
  question,
  relativeBase,
}: AgentChatQuestionCardProps) => {
  const canAnswer =
    question.status === "open" &&
    question.questions.every((item) => (draft[item.id]?.length ?? 0) > 0);

  return (
    <div className={cn("grid grid-cols-[32px_minmax(0,1fr)] gap-3", className)}>
      <span className="grid size-8 place-items-center rounded-md border border-warning/30 bg-warning/12 text-warning">
        <HelpCircle aria-hidden className="size-4" strokeWidth={1.8} />
      </span>
      <section className="min-w-0 rounded-lg border border-warning/30 bg-warning/5 px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Text as="h3" variant="sectionTitle" wrap="break">
                {question.prompt}
              </Text>
              <Badge tone={question.status === "open" ? "warning" : "neutral"}>
                {question.status}
              </Badge>
            </div>
            <DateTime
              className="mt-1 block text-xs text-muted-foreground"
              format="time"
              relativeBase={relativeBase}
              value={question.createdAt}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-4">
          {question.questions.map((item) => (
            <div className="grid gap-2" key={item.id}>
              <div className="min-w-0">
                <Text as="div" tone="muted" variant="meta" wrap="break">
                  {item.header}
                </Text>
                <Text as="div" className="mt-0.5" variant="control" wrap="break">
                  {item.question}
                </Text>
              </div>
              <AgentChatAnswerOptionGroup
                disabled={disabled || question.status !== "open"}
                item={item}
                onValueChange={
                  onDraftChange ? (values) => onDraftChange(item.id, values) : undefined
                }
                value={draft[item.id] ?? []}
              />
            </div>
          ))}
        </div>
        {question.status === "open" ? (
          <div className="mt-4 flex justify-end">
            <Button
              disabled={disabled || !canAnswer || onAnswer === undefined}
              onClick={() =>
                onAnswer?.({
                  items: question.questions.map((item) => ({
                    itemId: item.id,
                    selectedOptionValues: draft[item.id] ?? [],
                  })),
                  questionId: question.id,
                })
              }
              size="sm"
              tone="warning"
            >
              Submit answer
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
};

export type AgentChatProviderSummaryProps = {
  readonly className?: string;
  readonly model?: string | null;
  readonly providerId?: string | null;
  readonly providers: readonly AgentChatProviderProfile[];
  readonly runtimeMode?: AgentChatRuntimeMode | null;
  readonly thinkingLevel?: string | null;
};

export const AgentChatProviderSummary = ({
  className,
  model,
  providerId,
  providers,
  runtimeMode,
  thinkingLevel,
}: AgentChatProviderSummaryProps) => {
  const provider = providers.find((item) => item.id === providerId);
  const availability = provider?.availability ?? "available";

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      <Badge tone={availability === "available" ? "info" : "warning"}>
        {provider?.label ?? providerId ?? "No provider"}
      </Badge>
      {model ? <Badge appearance="outline">{model}</Badge> : null}
      <Badge appearance="outline">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck aria-hidden className="size-3" />
          {runtimeModeLabel(runtimeMode)}
        </span>
      </Badge>
      {thinkingLevel ? (
        <Badge appearance="outline">
          <span className="inline-flex items-center gap-1">
            <Sparkles aria-hidden className="size-3" />
            {thinkingLevel}
          </span>
        </Badge>
      ) : null}
    </div>
  );
};
