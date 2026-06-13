import type { TicketDocument, UserProfileDocument } from "@cycle/contracts";
import type { MarkdownEditorTagSuggestion } from "@cycle/ui/molecules";
import type { RepositoryRecord } from "../../shared/AppConfig.ts";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";

type CreateMarkdownTagSuggestionsInput = {
  readonly agentProviders?: readonly DetectedAgentProvider[];
  readonly issues?: readonly TicketDocument[];
  readonly repositories?: readonly RepositoryRecord[];
  readonly users?: readonly UserProfileDocument[];
};

const issueDescription = (issue: TicketDocument): string =>
  [issue.frontmatter.status, issue.frontmatter.priority].filter(Boolean).join(" / ");

const repositorySearchText = (repository: RepositoryRecord): string =>
  [repository.id, repository.displayName, repository.path].join(" ");

export const createMarkdownTagSuggestions = ({
  agentProviders = [],
  issues = [],
  repositories = [],
  users = [],
}: CreateMarkdownTagSuggestionsInput): readonly MarkdownEditorTagSuggestion[] => [
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
    insertLabel: `@${provider.name}`,
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
