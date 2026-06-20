import { ArrowUp, Paperclip } from "lucide-react";
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
  readonly timestamp?: React.ReactNode;
};

export type IssueCommentCardProps = React.HTMLAttributes<HTMLDivElement> &
  MarkdownReferenceHandlers & {
    readonly author: IssueAuthor;
    readonly body: React.ReactNode;
    readonly replyPlaceholder?: string;
    readonly timestamp?: React.ReactNode;
  };

export type IssueCommentComposerProps = Omit<
  React.HTMLAttributes<HTMLFormElement>,
  "defaultValue" | "onSubmit"
> & {
  readonly author?: IssueAuthor;
  readonly defaultValue?: string;
  readonly onAttach?: React.MouseEventHandler<HTMLButtonElement>;
  readonly onSubmit?: (value: string) => void;
  readonly onTagQueryChange?: (query: string) => void;
  readonly onTagSelect?: (suggestion: MarkdownEditorTagSuggestion) => void;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly tagSuggestions?: readonly MarkdownEditorTagSuggestion[];
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
  function IssueActivityEvent({ author, children, className, timestamp, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "flex min-w-0 items-center gap-3 text-muted-foreground",
          typography.control,
          className,
        )}
      >
        <IssueAvatar author={author} />
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{author.name}</span> {children}
          {timestamp ? <span> - {timestamp}</span> : null}
        </span>
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
      onIssueReferenceClick,
      onRepositoryReferenceClick,
      onUserReferenceClick,
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
          "overflow-hidden rounded-lg border border-border bg-elevated text-elevated-foreground",
          className,
        )}
      >
        <div className="grid gap-3 p-4">
          <div className={cn("flex min-w-0 items-center gap-3", typography.control)}>
            <IssueAvatar author={author} />
            <span className="font-semibold text-foreground">{author.name}</span>
            {timestamp ? <span className="text-muted-foreground">{timestamp}</span> : null}
          </div>
          <div className={cn("text-foreground", typography.bodyCompact)}>
            {typeof body === "string" ? (
              <MarkdownRenderer
                markdown={body}
                onAgentReferenceClick={onAgentReferenceClick}
                onCommitReferenceClick={onCommitReferenceClick}
                onCycleReferenceClick={onCycleReferenceClick}
                onIssueReferenceClick={onIssueReferenceClick}
                onRepositoryReferenceClick={onRepositoryReferenceClick}
                onUserReferenceClick={onUserReferenceClick}
              />
            ) : (
              body
            )}
          </div>
        </div>
        <div className="flex min-h-14 items-center gap-3 border-t border-border px-4">
          <IssueAvatar author={author} className="size-6 opacity-80" />
          <span className={cn("min-w-0 flex-1 text-muted-foreground", typography.bodyCompact)}>
            {replyPlaceholder}
          </span>
          <IconButton
            icon={<Paperclip aria-hidden className="size-4" />}
            label="Attach reply file"
            size="sm"
            title="Attach reply file"
          />
          <IconButton
            icon={<ArrowUp aria-hidden className="size-4" />}
            label="Send reply"
            size="sm"
            title="Send reply"
          />
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
      onAttach,
      onSubmit,
      onTagQueryChange,
      onTagSelect,
      placeholder = "Leave a comment...",
      submitLabel = "Send comment",
      tagSuggestions,
      ...props
    },
    ref,
  ) {
    const [value, setValue] = React.useState(defaultValue);
    const submitCurrentValue = React.useCallback(() => {
      const trimmed = value.trim();
      if (!trimmed) return;
      onSubmit?.(trimmed);
      setValue("");
    }, [onSubmit, value]);

    return (
      <form
        {...props}
        ref={ref}
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
          <IconButton
            icon={<Paperclip aria-hidden className="size-4" />}
            label="Attach comment file"
            onClick={onAttach}
            size="sm"
            title="Attach comment file"
          />
          <IconButton
            disabled={value.trim().length === 0}
            icon={<ArrowUp aria-hidden className="size-4" />}
            label={submitLabel}
            size="sm"
            title={submitLabel}
            type="submit"
          />
        </div>
      </form>
    );
  },
);
