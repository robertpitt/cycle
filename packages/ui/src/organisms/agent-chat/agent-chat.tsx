import {
  AtSign,
  CornerDownLeft,
  HelpCircle,
  MessageSquare,
  Plus,
  SendHorizontal,
  Square,
} from "lucide-react";
import * as React from "react";
import { Badge } from "../../atoms/badge/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { Kbd } from "../../atoms/kbd/index.ts";
import { Text } from "../../atoms/text/index.ts";
import { cn } from "../../lib/cn.ts";
import { PanelState } from "../../molecules/panel-state/index.ts";
import {
  MarkdownEditor,
  type MarkdownEditorTagSuggestion,
} from "../../molecules/markdown-editor/index.ts";
import { WorkspaceSurface } from "../workspace-shell/index.ts";
import {
  AgentChatActivityRow,
  AgentChatActivityStrip,
  AgentChatConnectionStatusBanner,
  AgentChatMessageRow,
  AgentChatProviderModelPicker,
  AgentChatProviderSummary,
  AgentChatQuestionCard,
  AgentChatRuntimeModePicker,
  AgentChatThinkingSelector,
  AgentChatThreadListItem,
  AgentChatTurnStatusIndicator,
  isAgentChatApprovalActivity,
  originDescription,
  originLabel,
  type AgentChatActivity,
  type AgentChatApprovalDecisionInput,
  type AgentChatConnectionStatus,
  type AgentChatMessage,
  type AgentChatProviderProfile,
  type AgentChatQuestionAnswer,
  type AgentChatQuestionDraft,
  type AgentChatRuntimeMode,
  type AgentChatThreadDetail,
  type AgentChatThreadListEntry,
  type AgentChatTimelineEntry,
  type AgentChatTurnStatus,
} from "../../molecules/agent-chat/index.ts";

export type AgentChatQuestionDraftState = Record<string, AgentChatQuestionDraft>;

export type AgentChatTurnSettings = {
  readonly model?: string | null;
  readonly providerId?: string | null;
  readonly runtimeMode?: AgentChatRuntimeMode | null;
  readonly thinkingLevel?: string | null;
};

export type AgentChatThreadListProps = {
  readonly className?: string;
  readonly emptyMessage?: React.ReactNode;
  readonly onCreateThread?: () => void;
  readonly onThreadDelete?: (threadId: string) => void;
  readonly onThreadSelect?: (threadId: string) => void;
  readonly relativeBase?: Date | string;
  readonly selectedThreadId?: string | null;
  readonly threads: readonly AgentChatThreadListEntry[];
};

export type AgentChatTimelineProps = {
  readonly className?: string;
  readonly entries: readonly AgentChatTimelineEntry[];
  readonly onApprovalDecision?: (input: AgentChatApprovalDecisionInput) => void;
  readonly onCopyMessage?: (message: AgentChatMessage) => void;
  readonly onQuestionAnswer?: (answer: AgentChatQuestionAnswer) => void;
  readonly onQuestionDraftChange?: (
    questionId: string,
    itemId: string,
    selectedOptionValues: readonly string[],
  ) => void;
  readonly questionDrafts?: AgentChatQuestionDraftState;
  readonly relativeBase?: Date | string;
};

export type AgentChatComposerProps = {
  readonly activeTurnId?: string | null;
  readonly className?: string;
  readonly connectionStatus?: AgentChatConnectionStatus;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly model?: string | null;
  readonly onCancelTurn?: (turnId: string) => void;
  readonly onMessageSend?: (text: string, settings: AgentChatTurnSettings) => void;
  readonly onModelChange?: (model: string | null) => void;
  readonly onProviderChange?: (providerId: string | null) => void;
  readonly onRuntimeModeChange?: (runtimeMode: AgentChatRuntimeMode | null) => void;
  readonly onTagQueryChange?: (query: string) => void;
  readonly onTagSelect?: (suggestion: MarkdownEditorTagSuggestion) => void;
  readonly onThinkingLevelChange?: (thinkingLevel: string | null) => void;
  readonly onValueChange?: (value: string) => void;
  readonly pendingQuestionCount?: number;
  readonly pendingApprovalCount?: number;
  readonly placeholder?: string;
  readonly providerId?: string | null;
  readonly providers: readonly AgentChatProviderProfile[];
  readonly runtimeMode?: AgentChatRuntimeMode | null;
  readonly tagSuggestions?: readonly MarkdownEditorTagSuggestion[];
  readonly thinkingLevel?: string | null;
  readonly turnStatus?: AgentChatTurnStatus | null;
  readonly value?: string;
};

export type AgentChatConversationProps = {
  readonly className?: string;
  readonly composerValue?: string;
  readonly connectionStatus: AgentChatConnectionStatus;
  readonly defaultComposerValue?: string;
  readonly model?: string | null;
  readonly onCancelTurn?: (turnId: string) => void;
  readonly onApprovalDecision?: (input: AgentChatApprovalDecisionInput) => void;
  readonly onComposerValueChange?: (value: string) => void;
  readonly onCopyMessage?: (message: AgentChatMessage) => void;
  readonly onMessageSend?: (text: string, settings: AgentChatTurnSettings) => void;
  readonly onModelChange?: (model: string | null) => void;
  readonly onProviderChange?: (providerId: string | null) => void;
  readonly onQuestionAnswer?: (answer: AgentChatQuestionAnswer) => void;
  readonly onQuestionDraftChange?: (
    questionId: string,
    itemId: string,
    selectedOptionValues: readonly string[],
  ) => void;
  readonly onTagQueryChange?: (query: string) => void;
  readonly onTagSelect?: (suggestion: MarkdownEditorTagSuggestion) => void;
  readonly onRuntimeModeChange?: (runtimeMode: AgentChatRuntimeMode | null) => void;
  readonly onThinkingLevelChange?: (thinkingLevel: string | null) => void;
  readonly providerId?: string | null;
  readonly providers: readonly AgentChatProviderProfile[];
  readonly questionDrafts?: AgentChatQuestionDraftState;
  readonly relativeBase?: Date | string;
  readonly selectedThread?: AgentChatThreadDetail | null;
  readonly tagSuggestions?: readonly MarkdownEditorTagSuggestion[];
  readonly runtimeMode?: AgentChatRuntimeMode | null;
  readonly thinkingLevel?: string | null;
};

export type AgentChatShellProps = Omit<AgentChatConversationProps, "selectedThread"> &
  Pick<
    AgentChatThreadListProps,
    | "emptyMessage"
    | "onCreateThread"
    | "onThreadDelete"
    | "onThreadSelect"
    | "selectedThreadId"
    | "threads"
  > & {
    readonly className?: string;
    readonly selectedThread?: AgentChatThreadDetail | null;
  };

const sortTimelineEntries = (
  entries: readonly AgentChatTimelineEntry[],
): readonly AgentChatTimelineEntry[] =>
  [...entries].sort((first, second) => {
    const firstSequence = first.sequence ?? Number.MAX_SAFE_INTEGER;
    const secondSequence = second.sequence ?? Number.MAX_SAFE_INTEGER;
    if (firstSequence !== secondSequence) return firstSequence - secondSequence;

    const firstTime = new Date(first.createdAt ?? entryCreatedAt(first)).getTime();
    const secondTime = new Date(second.createdAt ?? entryCreatedAt(second)).getTime();
    return firstTime - secondTime;
  });

const entryCreatedAt = (entry: AgentChatTimelineEntry): string => {
  if (entry.kind === "activity") return entry.activity.createdAt;
  if (entry.kind === "question") return entry.question.createdAt;
  return entry.message.createdAt;
};

const hiddenDuplicateProviderItemTypes = new Set([
  "agentMessage",
  "agent_message",
  "userMessage",
  "user_message",
]);

const shouldRenderTimelineEntry = (entry: AgentChatTimelineEntry): boolean => {
  if (entry.kind !== "activity") return true;
  const itemType = entry.activity.payload?.itemType;
  return typeof itemType === "string" ? !hiddenDuplicateProviderItemTypes.has(itemType) : true;
};

const isCompactActivityEntry = (
  entry: AgentChatTimelineEntry,
): entry is Extract<AgentChatTimelineEntry, { readonly kind: "activity" }> =>
  entry.kind === "activity" &&
  entry.activity.kind !== "error" &&
  !(isAgentChatApprovalActivity(entry.activity) && entry.activity.status === "pending");

type AgentChatTimelineRenderItem =
  | AgentChatTimelineEntry
  | {
      readonly activities: readonly AgentChatActivity[];
      readonly id: string;
      readonly kind: "activity-strip";
    };

const groupTimelineActivities = (
  entries: readonly AgentChatTimelineEntry[],
): readonly AgentChatTimelineRenderItem[] => {
  const items: AgentChatTimelineRenderItem[] = [];
  let activityGroup: AgentChatActivity[] = [];

  const flushActivityGroup = () => {
    if (activityGroup.length === 0) return;

    items.push({
      activities: activityGroup,
      id: `activity-strip_${activityGroup[0]?.id ?? items.length}`,
      kind: "activity-strip",
    });
    activityGroup = [];
  };

  for (const entry of entries) {
    if (isCompactActivityEntry(entry)) {
      activityGroup.push(entry.activity);
      continue;
    }

    flushActivityGroup();
    items.push(entry);
  }

  flushActivityGroup();
  return items;
};

const isTurnActive = (status?: AgentChatTurnStatus | null) =>
  status === "queued" || status === "running" || status === "waiting_for_user";

const pendingQuestionCount = (thread?: AgentChatThreadDetail | null): number =>
  thread?.timeline.filter((entry) => entry.kind === "question" && entry.question.status === "open")
    .length ?? 0;

const pendingApprovalCount = (thread?: AgentChatThreadDetail | null): number =>
  thread?.timeline.filter(
    (entry) =>
      entry.kind === "activity" &&
      entry.activity.status === "pending" &&
      isAgentChatApprovalActivity(entry.activity),
  ).length ?? 0;

const resolveSelection = ({
  explicit,
  threadValue,
}: {
  readonly explicit?: string | null;
  readonly threadValue?: string | null;
}) => explicit ?? threadValue ?? null;

export const AgentChatThreadList = ({
  className,
  emptyMessage = "No chat threads yet",
  onCreateThread,
  onThreadDelete,
  onThreadSelect,
  relativeBase,
  selectedThreadId,
  threads,
}: AgentChatThreadListProps) => {
  const activeCount = threads.filter((thread) => thread.activeTurnId).length;
  const unreadCount = threads.reduce((count, thread) => count + (thread.unreadCount ?? 0), 0);

  return (
    <WorkspaceSurface className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <Text as="h2" truncate variant="sectionTitle">
              Threads
            </Text>
            <Text as="p" className="mt-0.5" tone="muted" variant="meta">
              {threads.length} total, {activeCount} active
            </Text>
          </div>
          <IconButton
            disabled={!onCreateThread}
            icon={<Plus aria-hidden className="size-4" />}
            label="Create thread"
            onClick={onCreateThread}
            size="sm"
            variant="outline"
          />
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap gap-2">
          <Badge appearance="outline">{unreadCount} unread</Badge>
          <Badge appearance="outline">
            {threads.filter((thread) => thread.status === "waiting").length} waiting
          </Badge>
          <Badge appearance="outline">
            {threads.filter((thread) => thread.status === "error").length} failed
          </Badge>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {threads.length === 0 ? (
          <PanelState
            className="min-h-60"
            icon={<MessageSquare aria-hidden className="size-4" />}
            message={emptyMessage}
          />
        ) : (
          threads.map((thread) => (
            <AgentChatThreadListItem
              key={thread.id}
              onThreadDelete={onThreadDelete}
              onThreadSelect={onThreadSelect}
              relativeBase={relativeBase}
              selected={thread.id === selectedThreadId}
              thread={thread}
            />
          ))
        )}
      </div>
    </WorkspaceSurface>
  );
};

export const AgentChatTimeline = ({
  className,
  entries,
  onApprovalDecision,
  onCopyMessage,
  onQuestionAnswer,
  onQuestionDraftChange,
  questionDrafts = {},
  relativeBase,
}: AgentChatTimelineProps) => {
  const renderItems = React.useMemo(
    () => groupTimelineActivities(sortTimelineEntries(entries).filter(shouldRenderTimelineEntry)),
    [entries],
  );

  if (renderItems.length === 0) {
    return (
      <PanelState
        className={cn("min-h-80", className)}
        icon={<MessageSquare aria-hidden className="size-4" />}
        message="Start the thread with a message"
      />
    );
  }

  return (
    <div className={cn("mx-auto grid w-full max-w-5xl gap-0 p-3", className)}>
      {renderItems.map((entry) => {
        if (entry.kind === "activity-strip") {
          return (
            <AgentChatActivityStrip
              activities={entry.activities}
              key={entry.id}
              relativeBase={relativeBase}
            />
          );
        }

        if (entry.kind === "message") {
          return (
            <AgentChatMessageRow
              key={entry.id}
              message={entry.message}
              onCopyMessage={onCopyMessage}
              relativeBase={relativeBase}
            />
          );
        }

        if (entry.kind === "question") {
          return (
            <AgentChatQuestionCard
              draft={questionDrafts[entry.question.id]}
              key={entry.id}
              onAnswer={onQuestionAnswer}
              onDraftChange={(itemId, values) =>
                onQuestionDraftChange?.(entry.question.id, itemId, values)
              }
              question={entry.question}
              relativeBase={relativeBase}
            />
          );
        }

        return (
          <AgentChatActivityRow
            activity={entry.activity}
            key={entry.id}
            onApprovalDecision={onApprovalDecision}
            relativeBase={relativeBase}
          />
        );
      })}
    </div>
  );
};

export const AgentChatComposer = ({
  activeTurnId,
  className,
  connectionStatus = "connected",
  defaultValue = "",
  disabled = false,
  model,
  onCancelTurn,
  onMessageSend,
  onModelChange,
  onProviderChange,
  onRuntimeModeChange,
  onTagQueryChange,
  onTagSelect,
  onThinkingLevelChange,
  onValueChange,
  pendingApprovalCount = 0,
  pendingQuestionCount = 0,
  placeholder = "Ask the agent to inspect code, explain behavior, or make a change...",
  providerId,
  providers,
  runtimeMode,
  tagSuggestions,
  thinkingLevel,
  turnStatus,
  value: controlledValue,
}: AgentChatComposerProps) => {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;
  const active = isTurnActive(turnStatus) && activeTurnId;
  const disconnected = connectionStatus !== "connected";
  const sendBlocked =
    disabled ||
    disconnected ||
    Boolean(active) ||
    pendingApprovalCount > 0 ||
    pendingQuestionCount > 0 ||
    !onMessageSend;
  const sendDisabled = sendBlocked || value.trim().length === 0;

  const updateText = (nextText: string) => {
    if (controlledValue === undefined) {
      setUncontrolledValue(nextText);
    }
    onValueChange?.(nextText);
  };

  const send = (nextValue = value) => {
    const trimmed = nextValue.trim();
    if (sendBlocked || trimmed.length === 0) return;

    onMessageSend?.(trimmed, {
      model,
      providerId,
      runtimeMode,
      thinkingLevel,
    });

    if (controlledValue === undefined) {
      setUncontrolledValue("");
    }
  };

  return (
    <div className={cn("border-t border-border bg-elevated p-4", className)}>
      {pendingApprovalCount > 0 ? (
        <div className="mb-3 flex min-w-0 items-center gap-2 rounded-lg border border-warning/25 bg-warning/8 px-3 py-2">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-warning/16 text-warning">
            <HelpCircle aria-hidden className="size-3.5" strokeWidth={1.8} />
          </span>
          <Text className="min-w-0" tone="muted" variant="meta" wrap="break">
            Respond to the pending approval before sending a new message.
          </Text>
        </div>
      ) : null}
      {pendingQuestionCount > 0 ? (
        <div className="mb-3 flex min-w-0 items-center gap-2 rounded-lg border border-warning/25 bg-warning/8 px-3 py-2">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-warning/16 text-warning">
            <HelpCircle aria-hidden className="size-3.5" strokeWidth={1.8} />
          </span>
          <Text className="min-w-0" tone="muted" variant="meta" wrap="break">
            Answer the pending agent question before sending a new message.
          </Text>
        </div>
      ) : null}
      <div className="rounded-lg border border-input bg-popover shadow-sm focus-within:border-border focus-within:ring-1 focus-within:ring-ring">
        <MarkdownEditor
          className="gap-0"
          contentClassName="max-h-48 min-h-28 overflow-y-auto px-4 py-3"
          disabled={
            disabled ||
            disconnected ||
            Boolean(active) ||
            pendingApprovalCount > 0 ||
            pendingQuestionCount > 0
          }
          editorClassName="rounded-none border-0 hover:bg-transparent focus-within:border-transparent focus-within:bg-transparent"
          minHeightClassName="min-h-28"
          mode="comment"
          onSubmit={send}
          onTagQueryChange={onTagQueryChange}
          onTagSelect={onTagSelect}
          onValueChange={updateText}
          placeholder={placeholder}
          slashMenuOpen={false}
          tagSuggestions={tagSuggestions}
          toolbarOpen={false}
          value={value}
        />
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border/70 px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Kbd className="h-6 min-w-6 rounded-md px-1 text-xs">
                <AtSign aria-hidden className="size-3.5" />
              </Kbd>
              Add context
            </span>
            <AgentChatProviderModelPicker
              disabled={disabled || Boolean(active)}
              model={model}
              onModelChange={onModelChange}
              onProviderChange={onProviderChange}
              providerId={providerId}
              providers={providers}
            />
            <AgentChatRuntimeModePicker
              disabled={disabled || Boolean(active)}
              onRuntimeModeChange={onRuntimeModeChange}
              runtimeMode={runtimeMode}
            />
            <AgentChatThinkingSelector
              disabled={disabled || Boolean(active)}
              onThinkingLevelChange={onThinkingLevelChange}
              providerId={providerId}
              providers={providers}
              thinkingLevel={thinkingLevel}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {disconnected || active ? (
              <Text className="hidden sm:inline" tone="muted" variant="meta">
                {disconnected ? "Reconnect to send" : "Turn in progress"}
              </Text>
            ) : (
              <Kbd
                aria-label="Command Return sends"
                className="hidden gap-0.5 rounded-md px-1.5 sm:inline-flex"
                title="Command Return sends"
              >
                <span className="text-[0.75rem] leading-none">⌘</span>
                <CornerDownLeft aria-hidden className="size-3" />
              </Kbd>
            )}
            {active && activeTurnId ? (
              <Button
                leftIcon={<Square aria-hidden className="size-3.5" />}
                onClick={() => onCancelTurn?.(activeTurnId)}
                size="sm"
                tone="danger"
                variant="outline"
              >
                Cancel
              </Button>
            ) : null}
            <Button
              disabled={sendDisabled}
              leftIcon={<SendHorizontal aria-hidden className="size-3.5" />}
              onClick={() => send()}
              size="sm"
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AgentChatConversation = ({
  className,
  composerValue,
  connectionStatus,
  defaultComposerValue,
  model,
  onApprovalDecision,
  onCancelTurn,
  onComposerValueChange,
  onCopyMessage,
  onMessageSend,
  onModelChange,
  onProviderChange,
  onQuestionAnswer,
  onQuestionDraftChange,
  onRuntimeModeChange,
  onTagQueryChange,
  onTagSelect,
  onThinkingLevelChange,
  providerId,
  providers,
  questionDrafts,
  relativeBase,
  runtimeMode,
  selectedThread,
  tagSuggestions,
  thinkingLevel,
}: AgentChatConversationProps) => {
  const selectedProviderId = resolveSelection({
    explicit: providerId,
    threadValue: selectedThread?.providerId,
  });
  const selectedModel = resolveSelection({
    explicit: model,
    threadValue: selectedThread?.model,
  });
  const selectedRuntimeMode =
    runtimeMode ?? selectedThread?.runtimeMode ?? ("read-only" satisfies AgentChatRuntimeMode);
  const selectedThinkingLevel = resolveSelection({
    explicit: thinkingLevel,
    threadValue: selectedThread?.thinkingLevel,
  });
  const questionsPending = pendingQuestionCount(selectedThread);
  const approvalsPending = pendingApprovalCount(selectedThread);
  const sourceLabel = originLabel(selectedThread?.origin);
  const sourceDescription = originDescription(selectedThread?.origin);

  if (!selectedThread) {
    return (
      <WorkspaceSurface className={cn("grid h-full min-h-0 overflow-hidden", className)}>
        <PanelState
          icon={<MessageSquare aria-hidden className="size-4" />}
          message="Select a thread"
          description="Choose a chat thread or create a new one."
        />
      </WorkspaceSurface>
    );
  }

  return (
    <WorkspaceSurface className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge tone={selectedThread.status === "error" ? "danger" : "info"}>
                {selectedThread.status}
              </Badge>
              <AgentChatTurnStatusIndicator status={selectedThread.turnStatus} />
            </div>
            <Text as="h2" className="mt-2" truncate variant="pageTitle">
              {selectedThread.title}
            </Text>
            {sourceLabel ? (
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                <Badge appearance="outline">{sourceLabel}</Badge>
                {sourceDescription && sourceDescription !== sourceLabel ? (
                  <Text as="span" className="min-w-0" tone="muted" truncate variant="meta">
                    {sourceDescription}
                  </Text>
                ) : null}
              </div>
            ) : null}
            {selectedThread.summary ? (
              <Text
                as="p"
                className="mt-1 max-w-3xl"
                tone="muted"
                variant="bodyCompact"
                wrap="break"
              >
                {selectedThread.summary}
              </Text>
            ) : null}
            <AgentChatProviderSummary
              className="mt-3"
              model={selectedModel}
              providerId={selectedProviderId}
              providers={providers}
              runtimeMode={selectedRuntimeMode}
              thinkingLevel={selectedThinkingLevel}
            />
          </div>
          {selectedThread.lastError ? (
            <div className="hidden max-w-xs rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive lg:block">
              {selectedThread.lastError}
            </div>
          ) : null}
        </div>
      </div>
      <AgentChatConnectionStatusBanner status={connectionStatus} />
      <div className="min-h-0 flex-1 overflow-auto">
        <AgentChatTimeline
          entries={selectedThread.timeline}
          onApprovalDecision={connectionStatus === "connected" ? onApprovalDecision : undefined}
          onCopyMessage={onCopyMessage}
          onQuestionAnswer={onQuestionAnswer}
          onQuestionDraftChange={onQuestionDraftChange}
          questionDrafts={questionDrafts}
          relativeBase={relativeBase}
        />
      </div>
      <AgentChatComposer
        activeTurnId={selectedThread.activeTurnId}
        connectionStatus={connectionStatus}
        defaultValue={defaultComposerValue}
        model={selectedModel}
        onCancelTurn={onCancelTurn}
        onMessageSend={onMessageSend}
        onModelChange={onModelChange}
        onProviderChange={onProviderChange}
        onRuntimeModeChange={onRuntimeModeChange}
        onTagQueryChange={onTagQueryChange}
        onTagSelect={onTagSelect}
        onValueChange={onComposerValueChange}
        onThinkingLevelChange={onThinkingLevelChange}
        pendingApprovalCount={approvalsPending}
        pendingQuestionCount={questionsPending}
        providerId={selectedProviderId}
        providers={providers}
        runtimeMode={selectedRuntimeMode}
        tagSuggestions={tagSuggestions}
        thinkingLevel={selectedThinkingLevel}
        turnStatus={selectedThread.turnStatus}
        value={composerValue}
      />
    </WorkspaceSurface>
  );
};

export const AgentChatShell = ({
  className,
  composerValue,
  connectionStatus,
  defaultComposerValue,
  emptyMessage,
  model,
  onApprovalDecision,
  onCancelTurn,
  onComposerValueChange,
  onCopyMessage,
  onCreateThread,
  onMessageSend,
  onModelChange,
  onProviderChange,
  onQuestionAnswer,
  onQuestionDraftChange,
  onRuntimeModeChange,
  onTagQueryChange,
  onTagSelect,
  onThinkingLevelChange,
  onThreadDelete,
  onThreadSelect,
  providerId,
  providers,
  questionDrafts,
  relativeBase,
  runtimeMode,
  selectedThread,
  selectedThreadId,
  tagSuggestions,
  thinkingLevel,
  threads,
}: AgentChatShellProps) => {
  const resolvedSelectedThreadId = selectedThreadId ?? selectedThread?.id ?? null;

  return (
    <div
      className={cn(
        "grid h-full min-h-0 min-w-0 grid-rows-[minmax(220px,0.38fr)_minmax(0,1fr)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]",
        className,
      )}
    >
      <AgentChatThreadList
        emptyMessage={emptyMessage}
        onCreateThread={onCreateThread}
        onThreadDelete={onThreadDelete}
        onThreadSelect={onThreadSelect}
        relativeBase={relativeBase}
        selectedThreadId={resolvedSelectedThreadId}
        threads={threads}
      />
      <AgentChatConversation
        composerValue={composerValue}
        connectionStatus={connectionStatus}
        defaultComposerValue={defaultComposerValue}
        model={model}
        onApprovalDecision={onApprovalDecision}
        onCancelTurn={onCancelTurn}
        onComposerValueChange={onComposerValueChange}
        onCopyMessage={onCopyMessage}
        onMessageSend={onMessageSend}
        onModelChange={onModelChange}
        onProviderChange={onProviderChange}
        onQuestionAnswer={onQuestionAnswer}
        onQuestionDraftChange={onQuestionDraftChange}
        onRuntimeModeChange={onRuntimeModeChange}
        onTagQueryChange={onTagQueryChange}
        onTagSelect={onTagSelect}
        onThinkingLevelChange={onThinkingLevelChange}
        providerId={providerId}
        providers={providers}
        questionDrafts={questionDrafts}
        relativeBase={relativeBase}
        runtimeMode={runtimeMode}
        selectedThread={selectedThread}
        tagSuggestions={tagSuggestions}
        thinkingLevel={thinkingLevel}
      />
    </div>
  );
};
