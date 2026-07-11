import { ArrowUp, Paperclip, Plus } from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../../atoms/avatar/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { MarkdownRenderer, type MarkdownReferenceHandlers } from "../markdown-renderer/index.ts";
import { cn } from "../../lib/cn.ts";
import { typography } from "../../lib/styles.ts";
import { MarkdownEditor } from "../markdown-editor/index.ts";
import type { MarkdownEditorTagSuggestion } from "../markdown-editor/index.ts";

export type IssueAuthor = {
  readonly avatarSrc?: string;
  readonly initials: string;
  readonly name: React.ReactNode;
};

export type IssueActivityEventProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly author: IssueAuthor;
  readonly children: React.ReactNode;
  readonly showAuthor?: boolean;
  readonly timestamp?: React.ReactNode;
};

export type IssueCommentCardProps = React.HTMLAttributes<HTMLDivElement> &
  MarkdownReferenceHandlers & {
    readonly author: IssueAuthor;
    readonly body: React.ReactNode;
    readonly replyAction?: React.ReactNode;
    readonly replyPlaceholder?: string;
    readonly timestamp?: React.ReactNode;
  };

export type IssueCommentComposerProps = Omit<
  React.HTMLAttributes<HTMLFormElement>,
  "defaultValue" | "onSubmit"
> & {
  readonly author?: IssueAuthor;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly onAttach?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onSubmit?: (value: string) => void;
  readonly onTagQueryChange?: (query: string) => void;
  readonly onTagSelect?: (suggestion: MarkdownEditorTagSuggestion) => void;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly submitting?: boolean;
  readonly tagSuggestions?: readonly MarkdownEditorTagSuggestion[];
  readonly value?: string;
};

const IssueAvatar = ({
  author,
  className,
}: {
  readonly author: IssueAuthor;
  readonly className?: string;
}) => (
  <Avatar className={cn("size-7", className)}>
    {author.avatarSrc ? <AvatarImage alt="" src={author.avatarSrc} /> : null}
    <AvatarFallback className="text-[10px]">{author.initials}</AvatarFallback>
  </Avatar>
);

export const IssueActivityEvent = React.forwardRef<HTMLDivElement, IssueActivityEventProps>(
  function IssueActivityEvent(
    { author, children, className, showAuthor = true, timestamp, ...props },
    ref,
  ) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 text-muted-foreground",
          typography.control,
          className,
        )}
      >
        {showAuthor ? <IssueAvatar author={author} /> : <span aria-hidden className="w-7" />}
        <span className="min-w-0 truncate">
          {showAuthor ? <span className="font-medium text-foreground">{author.name} </span> : null}
          {!showAuthor ? (
            <Plus
              aria-hidden
              className="mr-2 inline size-3.5 text-muted-foreground/70"
              strokeWidth={2}
            />
          ) : null}
          {children}
        </span>
        {timestamp ? <span className="shrink-0 text-right">{timestamp}</span> : null}
      </div>
    );
  },
);

export const IssueCommentCard = React.forwardRef<HTMLDivElement, IssueCommentCardProps>(
  function IssueCommentCard(
    {
      author,
      body,
      className,
      onAgentReferenceClick,
      onCommitReferenceClick,
      onCycleReferenceClick,
      onExternalLinkClick,
      onIssueReferenceClick,
      onPageReferenceClick,
      onRepositoryReferenceClick,
      onUserReferenceClick,
      replyAction,
      replyPlaceholder = "Leave a reply...",
      timestamp,
      ...props
    },
    ref,
  ) {
    return (
      <article
        {...props}
        ref={ref}
        className={cn(
          "grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-3 text-elevated-foreground",
          className,
        )}
      >
        <IssueAvatar author={author} />
        <span className={cn("min-w-0 truncate text-muted-foreground", typography.control)}>
          <span className="font-medium text-foreground">{author.name}</span> commented
        </span>
        {timestamp ? (
          <span className={cn("shrink-0 text-right text-muted-foreground", typography.control)}>
            {timestamp}
          </span>
        ) : null}
        <div className="col-start-2 col-end-4 min-w-0 overflow-hidden rounded-lg border border-border bg-elevated">
          <div className="grid gap-3 p-4">
            <div className="text-foreground">
              {typeof body === "string" ? (
                <MarkdownRenderer
                  markdown={body}
                  onAgentReferenceClick={onAgentReferenceClick}
                  onCommitReferenceClick={onCommitReferenceClick}
                  onCycleReferenceClick={onCycleReferenceClick}
                  onExternalLinkClick={onExternalLinkClick}
                  onIssueReferenceClick={onIssueReferenceClick}
                  onPageReferenceClick={onPageReferenceClick}
                  onRepositoryReferenceClick={onRepositoryReferenceClick}
                  onUserReferenceClick={onUserReferenceClick}
                />
              ) : (
                body
              )}
            </div>
          </div>
          {replyAction ? (
            <div className="flex min-h-14 items-center gap-3 border-t border-border px-4">
              <span className={cn("min-w-0 flex-1 text-muted-foreground", typography.bodyCompact)}>
                {replyPlaceholder}
              </span>
              {replyAction}
            </div>
          ) : null}
        </div>
      </article>
    );
  },
);

export const IssueCommentComposer = React.forwardRef<HTMLFormElement, IssueCommentComposerProps>(
  function IssueCommentComposer(
    {
      author,
      className,
      defaultValue = "",
      disabled = false,
      onAttach,
      onSubmit,
      onTagQueryChange,
      onTagSelect,
      onValueChange,
      placeholder = "Leave a comment...",
      submitLabel = "Send comment",
      submitting = false,
      tagSuggestions,
      value: controlledValue,
      ...props
    },
    ref,
  ) {
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    const value = controlledValue ?? uncontrolledValue;
    const setValue = React.useCallback(
      (nextValue: string) => {
        if (controlledValue === undefined) setUncontrolledValue(nextValue);
        onValueChange?.(nextValue);
      },
      [controlledValue, onValueChange],
    );
    const submitCurrentValue = React.useCallback(() => {
      const trimmed = value.trim();
      if (!trimmed || !onSubmit || disabled || submitting) return;
      onSubmit(trimmed);
      setValue("");
    }, [disabled, onSubmit, setValue, submitting, value]);

    return (
      <form
        {...props}
        ref={ref}
        aria-disabled={disabled || submitting || undefined}
        className={cn(
          "relative grid min-h-28 overflow-visible rounded-lg border border-border bg-elevated text-elevated-foreground",
          className,
        )}
        onSubmit={(event) => {
          event.preventDefault();
          submitCurrentValue();
        }}
      >
        <MarkdownEditor
          aria-label={placeholder}
          className="px-3 pt-3"
          contentClassName="px-1 py-1"
          defaultValue={defaultValue}
          disabled={disabled || submitting}
          editorClassName="border-transparent hover:bg-transparent focus-within:border-transparent focus-within:bg-transparent"
          minHeightClassName="min-h-20"
          mode="comment"
          onSubmit={submitCurrentValue}
          onTagQueryChange={onTagQueryChange}
          onTagSelect={onTagSelect}
          onValueChange={setValue}
          placeholder={placeholder}
          tagSuggestions={tagSuggestions}
          value={value}
        />
        <div className="flex items-center gap-2 px-4 pb-4">
          {author ? <IssueAvatar author={author} className="size-6 opacity-80" /> : null}
          <span className="flex-1" />
          {onAttach ? (
            <IconButton
              icon={<Paperclip aria-hidden className="size-4" />}
              label="Attach comment file"
              onClick={onAttach}
              size="sm"
              title="Attach comment file"
            />
          ) : null}
          {onSubmit ? (
            <IconButton
              disabled={disabled || submitting || value.trim().length === 0}
              icon={<ArrowUp aria-hidden className="size-4" />}
              label={submitLabel}
              loading={submitting}
              loadingLabel={submitLabel}
              size="sm"
              title={submitLabel}
              type="submit"
            />
          ) : null}
        </div>
      </form>
    );
  },
);

export type CommentAuthor = IssueAuthor;
export type CommentActivityEventProps = IssueActivityEventProps;
export type CommentCardProps = IssueCommentCardProps;
export type CommentComposerProps = IssueCommentComposerProps;

export const CommentActivityEvent = IssueActivityEvent;
export const CommentCard = IssueCommentCard;
export const CommentComposer = IssueCommentComposer;
