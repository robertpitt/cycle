import type { AppShellNavSection } from "@cycle/ui/organisms";
import { History, Inbox, ListTodo, PanelsTopLeft, Settings, SquareKanban } from "lucide-react";
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
          badge: "3",
          icon: <Inbox aria-hidden className="size-4" />,
          id: "inbox",
          label: "Inbox",
        },
        {
          icon: <ListTodo aria-hidden className="size-4" />,
          id: "issues",
          label: "Issues",
        },
        {
          icon: <SquareKanban aria-hidden className="size-4" />,
          id: "projects",
          label: "Projects",
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

export const repositoryIdFromNavItem = (itemId: string): string | undefined => {
  const [scope, repositoryId, child] = itemId.split(":");
  if (scope !== "repository" || !repositoryId || child !== undefined) {
    return undefined;
  }

  return repositoryId;
};

export type RepositoryPageKind = "history" | "issues" | "settings" | "views";

export const repositoryPageFromNavItem = (
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

export const repositoryPageLabel = {
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
    case "issues":
      return "Issues";
    case "projects":
      return "Projects";
    case "settings":
      return "Settings";
    case "views":
      return "Views";
    default:
      return "Inbox";
  }
};
