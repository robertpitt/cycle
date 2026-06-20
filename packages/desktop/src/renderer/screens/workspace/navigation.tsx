import type { ApplicationSettingsSection, AppShellNavSection } from "@cycle/ui/organisms";
import {
  History,
  Inbox,
  Keyboard,
  ListTodo,
  MessageSquare,
  Monitor,
  Plug,
  PanelsTopLeft,
  Server,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareKanban,
  User,
  Wrench,
} from "lucide-react";
import type { RepositoryRecord } from "../../../shared/AppConfig.ts";

const createRepositoryNavItems = (repositories: readonly RepositoryRecord[]) =>
  repositories.flatMap((repository) => {
    const expanded = repository.preferences.sidebarExpanded;
    const repositoryItem = {
      className: "h-7 px-2 text-xs font-medium text-muted-foreground",
      expanded,
      id: `repository:${repository.id}`,
      label: repository.displayName,
      showDisclosure: true,
    };

    if (!expanded) return [repositoryItem];

    return [
      repositoryItem,
      {
        className: "h-7 text-xs",
        depth: 1 as const,
        icon: <ListTodo aria-hidden className="size-3.5" />,
        id: `repository:${repository.id}:issues`,
        label: "Issues",
      },
      {
        className: "h-7 text-xs",
        depth: 1 as const,
        icon: <PanelsTopLeft aria-hidden className="size-3.5" />,
        id: `repository:${repository.id}:views`,
        label: "Views",
      },
      {
        className: "h-7 text-xs",
        depth: 1 as const,
        icon: <History aria-hidden className="size-3.5" />,
        id: `repository:${repository.id}:history`,
        label: "History",
      },
      {
        className: "h-7 text-xs",
        depth: 1 as const,
        icon: <Settings aria-hidden className="size-3.5" />,
        id: `repository:${repository.id}:settings`,
        label: "Settings",
      },
    ];
  });

type RendererNavOptions = {
  readonly inboxUnreadCount?: number;
  readonly repositoryAction?: AppShellNavSection["action"];
};

export const createRendererNavSections = (
  repositories: readonly RepositoryRecord[],
  options: RendererNavOptions = {},
) =>
  [
    {
      id: "workspace",
      items: [
        {
          badge:
            options.inboxUnreadCount === undefined || options.inboxUnreadCount === 0
              ? undefined
              : String(options.inboxUnreadCount),
          icon: <Inbox aria-hidden className="size-4" />,
          id: "inbox",
          label: "Inbox",
        },
        {
          icon: <MessageSquare aria-hidden className="size-4" />,
          id: "chat",
          label: "Chat",
        },
        {
          icon: <ListTodo aria-hidden className="size-4" />,
          id: "issues",
          label: "Issues",
        },
        {
          icon: <SquareKanban aria-hidden className="size-4" />,
          id: "projects",
          label: "Initiatives",
        },
        {
          icon: <PanelsTopLeft aria-hidden className="size-4" />,
          id: "views",
          label: "Views",
        },
      ],
      title: "Workspace",
    },
    {
      action: options.repositoryAction,
      id: "repositories",
      items: createRepositoryNavItems(repositories),
      title: "Repositories",
    },
  ] satisfies readonly AppShellNavSection[];

export const defaultApplicationSettingsSection = "general" satisfies ApplicationSettingsSection;

const applicationSettingsSections = new Set<ApplicationSettingsSection>([
  "appearance",
  "configuration",
  "connectors",
  "general",
  "keyboard-shortcuts",
  "mcp-servers",
  "personalisation",
  "profile",
  "skills",
]);

const applicationSettingsNavItemPrefix = "settings:application:";

export const isApplicationSettingsSection = (
  value: string | null | undefined,
): value is ApplicationSettingsSection =>
  value !== null &&
  value !== undefined &&
  applicationSettingsSections.has(value as ApplicationSettingsSection);

export const settingsNavItemIdForApplicationSection = (
  section: ApplicationSettingsSection,
): string => `${applicationSettingsNavItemPrefix}${section}`;

export const applicationSettingsSectionFromNavItemId = (
  itemId: string,
): ApplicationSettingsSection | undefined => {
  if (!itemId.startsWith(applicationSettingsNavItemPrefix)) return undefined;

  const section = itemId.slice(applicationSettingsNavItemPrefix.length);
  return isApplicationSettingsSection(section) ? section : undefined;
};

export const createRendererSettingsNavSections = () =>
  [
    {
      id: "settings-personal",
      items: [
        {
          icon: <Settings aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("general"),
          label: "General",
        },
        {
          icon: <User aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("profile"),
          label: "Profile",
        },
        {
          icon: <Monitor aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("appearance"),
          label: "Appearance",
        },
        {
          icon: <SlidersHorizontal aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("configuration"),
          label: "Configuration",
        },
        {
          icon: <Sparkles aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("personalisation"),
          label: "Personalisation",
        },
        {
          icon: <Keyboard aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("keyboard-shortcuts"),
          label: "Keyboard Shortcuts",
        },
      ],
      title: "Personal",
    },
    {
      id: "settings-integrations",
      items: [
        {
          icon: <Plug aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("connectors"),
          label: "Connectors",
        },
        {
          icon: <Server aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("mcp-servers"),
          label: "MCP Servers",
        },
        {
          icon: <Wrench aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("skills"),
          label: "Skills",
        },
      ],
      title: "Integrations",
    },
  ] satisfies readonly AppShellNavSection[];

export const repositoryIdFromNavItem = (itemId: string): string | undefined => {
  const [scope, repositoryId, child] = itemId.split(":");
  if (scope !== "repository" || !repositoryId || child !== undefined) {
    return undefined;
  }

  return repositoryId;
};

type RepositoryPageKind = "history" | "issues" | "settings" | "views";

const repositoryPageFromNavItem = (
  itemId: string,
  repositories: readonly RepositoryRecord[],
): { readonly kind: RepositoryPageKind; readonly repository: RepositoryRecord } | undefined => {
  const [scope, repositoryId, child] = itemId.split(":");
  if (scope !== "repository" || !repositoryId) return undefined;

  const repository = repositories.find((candidate) => candidate.id === repositoryId);
  if (!repository) return undefined;

  if (child === "history" || child === "settings" || child === "views") {
    return {
      kind: child,
      repository,
    };
  }

  return {
    kind: "issues",
    repository,
  };
};

const repositoryPageLabel = {
  history: "History",
  issues: "Issues",
  settings: "Settings",
  views: "Views",
} satisfies Record<RepositoryPageKind, string>;

export const activePageTitleForNavItem = (
  activeItemId: string,
  repositories: readonly RepositoryRecord[],
): string => {
  const selectedRepositoryPage = repositoryPageFromNavItem(activeItemId, repositories);

  if (selectedRepositoryPage !== undefined) {
    return `${selectedRepositoryPage.repository.displayName} > ${
      repositoryPageLabel[selectedRepositoryPage.kind]
    }`;
  }

  if (repositories.length === 0) {
    return "Add Repository";
  }

  switch (activeItemId) {
    case "chat":
      return "Chat";
    case "issues":
      return "Issues";
    case "projects":
      return "Initiatives";
    case "settings":
      return "Settings";
    case "views":
      return "Views";
    default:
      return "Inbox";
  }
};
