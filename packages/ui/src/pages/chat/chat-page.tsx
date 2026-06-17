import {
  GitBranch,
  History,
  Inbox,
  ListTodo,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
import * as React from "react";
import { Button } from "../../atoms/button/index.ts";
import { cn } from "../../lib/cn.ts";
import {
  AgentChatShell,
  type AgentChatShellProps,
} from "../../organisms/agent-chat/index.ts";
import {
  AppShellFrame,
  AppShellHeader,
  AppShellMain,
  AppShellRoot,
  AppShellSidebar,
  type AppShellNavSection,
} from "../../organisms/app-shell/index.ts";

export type ChatPageProps = Omit<AgentChatShellProps, "className"> & {
  readonly className?: string;
};

const shellNavSections: readonly AppShellNavSection[] = [
  {
    id: "workspace",
    items: [
      {
        badge: "4",
        icon: <Inbox aria-hidden className="size-4" />,
        id: "inbox",
        label: "Inbox",
      },
      {
        badge: "24",
        icon: <ListTodo aria-hidden className="size-4" />,
        id: "issues",
        label: "Issues",
      },
      {
        active: true,
        icon: <MessageSquare aria-hidden className="size-4" />,
        id: "chat",
        label: "Chat",
      },
      {
        icon: <History aria-hidden className="size-4" />,
        id: "history",
        label: "History",
      },
    ],
    title: "Workspace",
  },
  {
    id: "repositories",
    items: [
      {
        expanded: true,
        icon: <GitBranch aria-hidden className="size-4" />,
        id: "cycle",
        label: "cycle",
        showDisclosure: true,
      },
      {
        active: true,
        badge: "6",
        depth: 1,
        icon: <MessageSquare aria-hidden className="size-3.5" />,
        id: "cycle:chat",
        label: "Agent chats",
      },
      {
        badge: "18",
        depth: 1,
        icon: <ListTodo aria-hidden className="size-3.5" />,
        id: "cycle:issues",
        label: "Issues",
      },
      {
        depth: 1,
        icon: <GitBranch aria-hidden className="size-3.5" />,
        id: "cycle:branches",
        label: "Branches",
      },
    ],
    title: "Repositories",
  },
];

export const ChatPage = ({ className, onCreateThread, ...chatProps }: ChatPageProps) => {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <AppShellRoot className={cn("h-screen min-h-0", className)}>
      <AppShellFrame className="h-screen min-h-0" collapsed={collapsed}>
        <AppShellSidebar
          activeItemId="cycle:chat"
          brandLabel="Cycle"
          className="border-r border-border"
          collapsed={collapsed}
          createLabel="New chat"
          navSections={shellNavSections}
          onCreate={onCreateThread}
          onSearch={() => undefined}
          settingsLabel="Settings"
        />
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-surface">
          <AppShellHeader
            actions={
              <>
                <Button leftIcon={<Search aria-hidden className="size-4" />} size="sm" variant="outline">
                  Search
                </Button>
                <Button leftIcon={<Plus aria-hidden className="size-4" />} onClick={onCreateThread} size="sm">
                  New chat
                </Button>
              </>
            }
            breadcrumb="cycle"
            collapsed={collapsed}
            onToggleSidebar={() => setCollapsed((value) => !value)}
            subtitle="Realtime local agent conversations"
            title="Chat"
          />
          <AppShellMain className="grid min-h-0 overflow-hidden bg-background/70 p-4">
            <AgentChatShell {...chatProps} onCreateThread={onCreateThread} />
          </AppShellMain>
        </div>
      </AppShellFrame>
    </AppShellRoot>
  );
};
