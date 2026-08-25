import type { AppShellNavSection } from "@cycle/ui/organisms";
import {
  Bot,
  BookOpen,
  History,
  Inbox,
  ListTodo,
  MessageSquare,
  PanelsTopLeft,
  Server,
  Settings,
  SquareKanban,
  User,
  Wrench,
} from "lucide-react";
import type { RepositoryRecord } from "@cycle/config";
import type { ApplicationSettingsSection } from "../../components/ApplicationSettingsPanel.tsx";

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
        icon: <BookOpen aria-hidden className="size-3.5" />,
        id: `repository:${repository.id}:pages`,
        label: "Pages",
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

const createRepositoryNavSections = (
  repositories: readonly RepositoryRecord[],
  repositoryAction: AppShellNavSection["action"] | undefined,
): readonly AppShellNavSection[] => {
  const activeGroups = new Map<string, RepositoryRecord[]>();
  const archived: RepositoryRecord[] = [];

  for (const repository of repositories) {
    if (repository.preferences.archived) {
      archived.push(repository);
      continue;
    }
    const group = repository.preferences.group?.trim() || "Repositories";
    activeGroups.set(group, [...(activeGroups.get(group) ?? []), repository]);
  }

  const groups = [...activeGroups.entries()].sort(([left], [right]) => {
    if (left === "Repositories") return -1;
    if (right === "Repositories") return 1;
    return left.localeCompare(right);
  });
  const sections: AppShellNavSection[] = groups.map(([title, groupedRepositories], index) => ({
    ...(index === 0 ? { action: repositoryAction } : {}),
    id: `repositories:${title.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
    items: createRepositoryNavItems(groupedRepositories),
    title,
  }));

  if (archived.length > 0) {
    sections.push({
      ...(sections.length === 0 ? { action: repositoryAction } : {}),
      id: "repositories:archived",
      items: createRepositoryNavItems(archived),
      title: "Archived repositories",
    });
  }

  if (sections.length === 0) {
    sections.push({
      action: repositoryAction,
      id: "repositories",
      items: [],
      title: "Repositories",
    });
  }

  return sections;
};

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
    ...createRepositoryNavSections(repositories, options.repositoryAction),
  ] satisfies readonly AppShellNavSection[];

export const defaultApplicationSettingsSection = "general" satisfies ApplicationSettingsSection;

const applicationSettingsSections = new Set<ApplicationSettingsSection>([
  "agents",
  "advanced",
  "endpoints",
  "general",
  "profile",
  "repositories",
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
      id: "settings-user",
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
      ],
      title: "User",
    },
    {
      id: "settings-automation",
      items: [
        {
          icon: <Bot aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("agents"),
          label: "Agents",
        },
      ],
      title: "Automation",
    },
    {
      id: "settings-workspace",
      items: [
        {
          icon: <SquareKanban aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("repositories"),
          label: "Repositories",
        },
      ],
      title: "Workspace",
    },
    {
      id: "settings-diagnostics",
      items: [
        {
          icon: <Server aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("endpoints"),
          label: "Endpoints",
        },
        {
          icon: <Wrench aria-hidden className="size-4" />,
          id: settingsNavItemIdForApplicationSection("advanced"),
          label: "Advanced",
        },
      ],
      title: "Diagnostics",
    },
  ] satisfies readonly AppShellNavSection[];

export const repositoryIdFromNavItem = (itemId: string): string | undefined => {
  const [scope, repositoryId, child] = itemId.split(":");
  if (scope !== "repository" || !repositoryId || child !== undefined) {
    return undefined;
  }

  return repositoryId;
};

type RepositoryPageKind = "history" | "issues" | "pages" | "settings" | "views";

const repositoryPageFromNavItem = (
  itemId: string,
  repositories: readonly RepositoryRecord[],
): { readonly kind: RepositoryPageKind; readonly repository: RepositoryRecord } | undefined => {
  const [scope, repositoryId, child] = itemId.split(":");
  if (scope !== "repository" || !repositoryId) return undefined;

  const repository = repositories.find((candidate) => candidate.id === repositoryId);
  if (!repository) return undefined;

  if (child === "history" || child === "pages" || child === "settings" || child === "views") {
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
  pages: "Pages",
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
