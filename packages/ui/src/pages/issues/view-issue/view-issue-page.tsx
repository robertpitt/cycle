import * as React from "react";
import { ThemeProvider } from "../../../theme/index.ts";
import { ViewIssue, type ViewIssueProps } from "../../../organisms/view-issue/index.ts";
import { cn } from "../../../lib/cn.ts";

export type ViewIssuePageProps = ViewIssueProps & {
  readonly mode?: "dark" | "light" | "system";
};

export const viewIssueComponentBreakdown = {
  atoms: [
    "Button",
    "IconButton",
    "Avatar",
    "Badge",
    "Input/Textarea styling",
    "Status and label dots",
  ],
  molecules: [
    "EditableText",
    "IssueEditor",
    "IssueEditorToolbar",
    "IssueEditorSlashMenu",
    "IssueResourceLink",
    "IssueSubIssueComposer",
    "IssueActivityEvent",
    "IssueCommentCard",
    "IssueCommentComposer",
    "IssueSidebarSection",
  ],
  organisms: ["ViewIssue"],
  pageExamples: [
    "Default issue detail",
    "Selection formatting toolbar",
    "Slash command menu",
    "Inline sub-issue composer",
    "Activity with comments",
    "Collapsed right sidebar sections",
  ],
} as const;

export const ViewIssuePage = React.forwardRef<HTMLDivElement, ViewIssuePageProps>(
  function ViewIssuePage({ className, mode = "dark", ...props }, ref) {
    return (
      <ThemeProvider mode={mode}>
        <div
          ref={ref}
          className={cn("min-h-screen overflow-auto bg-background text-foreground", className)}
        >
          <ViewIssue {...props} />
        </div>
      </ThemeProvider>
    );
  },
);
