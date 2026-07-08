import type { TicketDocument, UserProfileDocument } from "@cycle/contracts/schemas";
import type { MarkdownEditorTagSuggestion } from "@cycle/ui/molecules";
import type { ProfileConfig, RepositoryRecord } from "@cycle/contracts/schemas/app";
import type { DetectedAgentProvider } from "@cycle/contracts/schemas/agents";

type CreateMarkdownTagSuggestionsInput = {
  readonly agentProviders?: readonly DetectedAgentProvider[];
  readonly issues?: readonly TicketDocument[];
  readonly profile?: ProfileConfig;
  readonly repositories?: readonly RepositoryRecord[];
  readonly users?: readonly UserProfileDocument[];
};

const issueDescription = (issue: TicketDocument): string =>
  [issue.frontmatter.status, issue.frontmatter.priority].filter(Boolean).join(" / ");

const repositorySearchText = (repository: RepositoryRecord): string =>
  [repository.id, repository.displayName, repository.path].join(" ");

const profileTagSuggestion = (
  profile: ProfileConfig | undefined,
  users: readonly UserProfileDocument[],
): MarkdownEditorTagSuggestion[] => {
  const displayName = profile?.displayName.trim() ?? "";
  const email = profile?.email.trim() ?? "";
  if (!profile || (displayName.length === 0 && email.length === 0)) return [];
  if (email.length > 0 && users.some((user) => user.email === email)) return [];

  const label = displayName || email;
  const id = email || label;

  return [
    {
      description: email,
      id,
      insertLabel: `@${label}`,
      kind: "user",
      label,
      searchText: [displayName, email].join(" "),
    },
  ];
};

export const createMarkdownTagSuggestions = ({
  agentProviders = [],
  issues = [],
  profile,
  repositories = [],
  users = [],
}: CreateMarkdownTagSuggestionsInput): readonly MarkdownEditorTagSuggestion[] => [
  ...profileTagSuggestion(profile, users),
  ...users.map((user) => ({
    description: user.email,
    id: user.id,
    insertLabel: `@${user.displayName}`,
    kind: "user" as const,
    label: user.displayName,
    searchText: [user.id, user.displayName, user.email, ...(user.aliases ?? [])].join(" "),
  })),
  ...agentProviders.map((provider) => ({
    description:
      provider.status === "available"
        ? (provider.executablePath ?? provider.executable)
        : `${provider.executable} not installed`,
    id: provider.id,
    insertLabel: `[${provider.name}](cycle-agent:${provider.id})`,
    kind: "agent" as const,
    label: provider.name,
    searchText: [provider.id, provider.name, provider.executable, provider.status].join(" "),
  })),
  ...issues.map((issue) => ({
    description: issueDescription(issue),
    id: issue.id,
    insertLabel: `#${issue.id}`,
    kind: "issue" as const,
    label: `#${issue.id}`,
    searchText: [
      issue.id,
      issue.frontmatter.title,
      issue.frontmatter.status,
      issue.frontmatter.priority,
      issue.frontmatter.assignee ?? "",
      ...(issue.frontmatter.labels ?? []),
    ].join(" "),
  })),
  ...repositories.map((repository) => ({
    description: repository.path,
    id: repository.id,
    insertLabel: `repo:${repository.displayName}`,
    kind: "repository" as const,
    label: repository.displayName,
    searchText: repositorySearchText(repository),
  })),
];
