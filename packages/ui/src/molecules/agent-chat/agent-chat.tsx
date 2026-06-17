import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  Copy,
  HelpCircle,
  Info,
  LoaderCircle,
  MessageSquare,
  Radio,
  RefreshCw,
  Sparkles,
  Terminal,
  UserRound,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback } from "../../atoms/avatar/index.ts";
import { Badge } from "../../atoms/badge/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { DateTime } from "../../atoms/date-time/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { Select, type SelectItem } from "../../atoms/select/index.ts";
import { Text } from "../../atoms/text/index.ts";
import { cn } from "../../lib/cn.ts";
import type { ComponentTone } from "../../lib/contracts.ts";
import { typography } from "../../lib/styles.ts";
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
  readonly providerId?: string | null;
  readonly status: AgentChatThreadStatus;
  readonly summary?: string | null;
  readonly thinkingLevel?: string | null;
  readonly title: string;
  readonly unreadCount?: number;
  readonly updatedAt?: string | null;
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

export type AgentChatActivityStatus =
  | "cancelled"
  | "completed"
  | "failed"
  | "pending"
  | "running";

export type AgentChatActivityPayload = Record<string, unknown>;

export type AgentChatActivity = {
  readonly createdAt: string;
  readonly detail?: string | null;
  readonly id: string;
  readonly kind: AgentChatActivityKind;
  readonly payload?: AgentChatActivityPayload | null;
  readonly status?: AgentChatActivityStatus | null;
  readonly title: string;
  readonly turnId?: string | null;
  readonly updatedAt?: string | null;
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

const turnStatusTone = {
  cancelled: "neutral",
  completed: "success",
  failed: "danger",
  queued: "neutral",
  running: "info",
  waiting_for_user: "warning",
} satisfies Record<AgentChatTurnStatus, ComponentTone>;

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

const initialsForRole = (role: AgentChatMessageRole) => {
  if (role === "assistant") return "AI";
  if (role === "system") return "SY";
  return "ME";
};

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

const formatPayloadValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
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
  readonly onThreadSelect?: (threadId: string) => void;
  readonly relativeBase?: Date | string;
  readonly selected?: boolean;
  readonly thread: AgentChatThreadListEntry;
};

export const AgentChatThreadListItem = ({
  className,
  onThreadSelect,
  relativeBase,
  selected = false,
  thread,
}: AgentChatThreadListItemProps) => (
  <button
    aria-current={selected ? "page" : undefined}
    className={cn(
      "group grid w-full grid-cols-[32px_minmax(0,1fr)] gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0",
      "hover:bg-subtle/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
      selected && "bg-primary/6",
      thread.status === "archived" && "text-muted-foreground",
      className,
    )}
    data-state={selected ? "selected" : "idle"}
    onClick={() => onThreadSelect?.(thread.id)}
    type="button"
  >
    <span
      className={cn(
        "mt-0.5 grid size-8 place-items-center rounded-md border border-border bg-subtle text-muted-foreground",
        selected && "border-primary/35 bg-primary/12 text-primary",
        thread.status === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        thread.status === "waiting" && "border-warning/30 bg-warning/12 text-warning",
      )}
    >
      {thread.activeTurnId ? icon(LoaderCircle, "size-4 animate-spin") : icon(MessageSquare)}
    </span>
    <span className="min-w-0">
      <span className="flex min-w-0 items-center gap-2">
        <Text as="span" className="min-w-0 flex-1" truncate variant="panelTitle">
          {thread.title}
        </Text>
        {thread.unreadCount ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
            {thread.unreadCount}
          </span>
        ) : null}
      </span>
      {thread.summary ? (
        <Text as="span" className="mt-1 block" tone="muted" truncate variant="meta">
          {thread.summary}
        </Text>
      ) : null}
      <span className="mt-2 flex min-w-0 items-center gap-2">
        <Badge appearance="outline" tone={statusTone[thread.status]}>
          {thread.status}
        </Badge>
        {thread.providerId ? (
          <Text as="span" className="min-w-0" tone="muted" truncate variant="meta">
            {thread.providerId}
            {thread.model ? ` / ${thread.model}` : ""}
          </Text>
        ) : null}
        <DateTime
          className="ml-auto shrink-0 text-xs text-muted-foreground"
          fallback=""
          format="relative"
          relativeBase={relativeBase}
          value={thread.updatedAt}
        />
      </span>
      {thread.lastError ? (
        <Text as="span" className="mt-2 block" tone="danger" truncate variant="meta">
          {thread.lastError}
        </Text>
      ) : null}
    </span>
  </button>
);

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
    <MarkdownRenderer markdown={text || (streaming ? " " : "")} />
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
    <div className={cn("grid grid-cols-[32px_minmax(0,1fr)] gap-3", className)}>
      <Avatar className={cn("size-8", assistant && "ring-1 ring-primary/25")}>
        <AvatarFallback
          className={cn(
            "text-[10px]",
            assistant && "bg-primary/10 text-primary",
            system && "bg-subtle text-muted-foreground",
          )}
        >
          {initialsForRole(message.role)}
        </AvatarFallback>
      </Avatar>
      <article
        className={cn(
          "min-w-0 rounded-lg border px-4 py-3",
          assistant && "border-primary/15 bg-elevated text-elevated-foreground",
          message.role === "user" && "border-border bg-surface text-foreground",
          system && "border-border bg-subtle/65 text-foreground",
        )}
      >
        <div className={cn("mb-2 flex min-w-0 items-center gap-2", typography.control)}>
          <span className="grid size-4 shrink-0 place-items-center text-muted-foreground">
            <Icon aria-hidden className="size-4" strokeWidth={1.8} />
          </span>
          <Text as="span" className="min-w-0 flex-1" truncate variant="control">
            {labelForRole(message.role)}
          </Text>
          {message.streaming ? <Badge tone="info">Streaming</Badge> : null}
          <DateTime
            className="shrink-0 text-xs font-normal text-muted-foreground"
            format="time"
            relativeBase={relativeBase}
            value={message.createdAt}
          />
          {onCopyMessage ? (
            <IconButton
              className="size-7"
              icon={icon(Copy, "size-3.5")}
              label="Copy message"
              onClick={() => onCopyMessage(message)}
              size="sm"
              variant="ghost"
            />
          ) : null}
        </div>
        <AgentChatStreamingText streaming={message.streaming} text={message.text} />
      </article>
    </div>
  );
};

export type AgentChatActivityRowProps = {
  readonly activity: AgentChatActivity;
  readonly className?: string;
  readonly relativeBase?: Date | string;
};

export const AgentChatActivityRow = ({
  activity,
  className,
  relativeBase,
}: AgentChatActivityRowProps) => {
  const Icon = activityKindIcon[activity.kind];
  const tone = activity.status ? activityStatusTone[activity.status] : "neutral";
  const payloadEntries = Object.entries(activity.payload ?? {})
    .map(([key, value]) => [key, formatPayloadValue(value)] as const)
    .filter(([, value]) => value !== undefined)
    .slice(0, 4);

  return (
    <div className={cn("grid grid-cols-[32px_minmax(0,1fr)] gap-3", className)}>
      <span
        className={cn(
          "grid size-8 place-items-center rounded-md border border-border bg-subtle text-muted-foreground",
          activity.kind === "thinking" && "text-primary",
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
                {activity.title}
              </Text>
              <Badge appearance="outline" tone={tone}>
                {activity.status ? activityStatusLabel[activity.status] : activity.kind}
              </Badge>
            </div>
            {activity.detail ? (
              <Text as="p" className="mt-1" tone="muted" variant="bodyCompact" wrap="break">
                {activity.detail}
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
          <div className="mt-3 flex flex-wrap gap-2">
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
        disabled={disabled}
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
        disabled={disabled || !providerId}
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
        disabled={disabled || levels.length === 0}
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
    <div className="grid gap-2" role={item.multiSelect ? "group" : "radiogroup"}>
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
            disabled={disabled || option.disabled}
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
                onValueChange={(values) => onDraftChange?.(item.id, values)}
                value={draft[item.id] ?? []}
              />
            </div>
          ))}
        </div>
        {question.status === "open" ? (
          <div className="mt-4 flex justify-end">
            <Button
              disabled={disabled || !canAnswer}
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
  readonly thinkingLevel?: string | null;
};

export const AgentChatProviderSummary = ({
  className,
  model,
  providerId,
  providers,
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
