type OpenApiDocument = Record<string, any>;

type OperationDoc = {
  readonly description: string;
  readonly summary: string;
};

const httpMethods = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

const operationDocs: Readonly<Record<string, OperationDoc>> = {
  addInitiativeUpdate: {
    summary: "Add an initiative update",
    description:
      "Appends a progress update record to an initiative issue in the selected repository.",
  },
  addIssueComment: {
    summary: "Add an issue comment",
    description:
      "Creates a comment record for an issue and triggers mention handling for the comment body.",
  },
  addIssueRecord: {
    summary: "Add an issue record",
    description:
      "Adds a linked record to an issue, such as a note, comment, or integration-owned record payload.",
  },
  addIssueRelation: {
    summary: "Add an issue relation",
    description: "Adds a typed relationship from one issue to another issue in the repository.",
  },
  appendAgentTaskInput: {
    summary: "Append agent task input",
    description: "Adds user input to a waiting agent task and returns the updated task resource.",
  },
  archiveInbox: {
    summary: "Archive inbox items",
    description: "Archives one or more inbox items for the requested user.",
  },
  archiveIssue: {
    summary: "Archive an issue",
    description: "Archives an issue and optionally records a human-readable reason.",
  },
  archiveLabel: {
    summary: "Archive a label",
    description: "Archives a label definition in the selected repository.",
  },
  archiveTemplate: {
    summary: "Archive a template",
    description: "Archives an issue template so it is no longer offered for new issues.",
  },
  archiveView: {
    summary: "Archive a saved view",
    description: "Archives a saved view in the selected repository.",
  },
  autocomplete: {
    summary: "Autocomplete repositories and tickets",
    description: "Returns repository and ticket suggestions matching a short free-text query.",
  },
  cancelAgentTask: {
    summary: "Cancel an agent task",
    description: "Requests cancellation for an active agent task and returns the updated task.",
  },
  commitDraft: {
    summary: "Commit a draft",
    description: "Converts an editable issue draft into a committed issue document.",
  },
  completeOnboarding: {
    summary: "Complete onboarding",
    description:
      "Stores the local profile, theme, and enabled agent providers chosen during onboarding.",
  },
  createAgentTask: {
    summary: "Create an agent task",
    description: "Starts a generic local agent task from the supplied agent task request.",
  },
  createDraft: {
    summary: "Create an issue draft",
    description: "Creates an editable draft issue document in the selected repository.",
  },
  createInitiative: {
    summary: "Create an initiative",
    description: "Creates an initiative issue in the selected repository.",
  },
  createIssue: {
    summary: "Create an issue",
    description: "Creates a committed issue document in the selected repository.",
  },
  createIssueAgentTask: {
    summary: "Create an issue agent task",
    description: "Starts an agent task with issue-specific repository and ticket context.",
  },
  createTemplate: {
    summary: "Create an issue template",
    description: "Creates an issue template in the selected repository.",
  },
  createView: {
    summary: "Create a saved view",
    description: "Creates a saved issue view in the selected repository.",
  },
  diffIssue: {
    summary: "Diff issue revisions",
    description: "Returns file and frontmatter differences between two issue snapshots.",
  },
  evaluateAutomation: {
    summary: "Evaluate automation",
    description:
      "Runs repository, issue, or query-scoped automation checks and returns the evaluation result.",
  },
  getAgentTask: {
    summary: "Read an agent task",
    description: "Returns one agent task by task id.",
  },
  getAppConfig: {
    summary: "Read app configuration",
    description: "Returns local profile, theme, API, repository, and agent provider configuration.",
  },
  getInitiativeProgress: {
    summary: "Read initiative progress",
    description: "Returns aggregated progress details for an initiative issue.",
  },
  getIssue: {
    summary: "Read an issue",
    description: "Returns one issue document by issue id.",
  },
  getIssueRevision: {
    summary: "Read an issue revision",
    description: "Returns an issue document as it existed at a specific snapshot.",
  },
  getRepository: {
    summary: "Read repository status",
    description: "Returns the current projection and synchronization status for one repository.",
  },
  getTemplate: {
    summary: "Read an issue template",
    description: "Returns one issue template by template id.",
  },
  getUser: {
    summary: "Read a user profile",
    description: "Returns one user profile by user id.",
  },
  getView: {
    summary: "Read a saved view",
    description: "Returns one saved view by view id.",
  },
  health: {
    summary: "Read service health",
    description: "Returns unauthenticated health information for the local API service.",
  },
  inboxSummary: {
    summary: "Read inbox summary",
    description: "Returns aggregate inbox counts for the requested user and filters.",
  },
  listAgentProviders: {
    summary: "List agent providers",
    description:
      "Returns local agent providers, capabilities, availability, and active run counts.",
  },
  listAgentTaskEvents: {
    summary: "List agent task events",
    description: "Returns visible events for one agent task in ascending sequence order.",
  },
  listAgentTasks: {
    summary: "List agent tasks",
    description: "Returns agent tasks filtered by origin, repository, ticket, status, and page.",
  },
  listInbox: {
    summary: "List inbox items",
    description:
      "Returns paginated inbox entries for the requested user, including repository snapshot metadata.",
  },
  listIssueComments: {
    summary: "List issue comments",
    description: "Returns paginated comment records attached to an issue.",
  },
  listIssueHistory: {
    summary: "List issue history",
    description: "Returns paginated history commits associated with one issue.",
  },
  listIssueRecords: {
    summary: "List issue records",
    description: "Returns paginated linked records attached to an issue.",
  },
  listIssues: {
    summary: "List issues",
    description:
      "Returns paginated issues or search results filtered by issue fields, repository ids, text, and sort order.",
  },
  listLabels: {
    summary: "List labels",
    description: "Returns paginated label definitions for the selected repository.",
  },
  listRepositories: {
    summary: "List repositories",
    description: "Returns paginated repository statuses filtered by id, path, status, or text.",
  },
  listRepositoryHistory: {
    summary: "List repository history",
    description: "Returns paginated repository history commits, optionally scoped to a ticket.",
  },
  listRepositoryWarnings: {
    summary: "List repository warnings",
    description: "Returns paginated materialization warnings for the selected repository.",
  },
  listTemplates: {
    summary: "List issue templates",
    description: "Returns paginated issue templates filtered by kind, active state, or text.",
  },
  listUsers: {
    summary: "List user profiles",
    description: "Returns paginated user profiles filtered by disabled state or text.",
  },
  listViews: {
    summary: "List saved views",
    description: "Returns paginated saved views filtered by kind, pinned state, or text.",
  },
  markInboxRead: {
    summary: "Mark inbox items read",
    description: "Marks one or more inbox items as read for the requested user.",
  },
  markInboxUnread: {
    summary: "Mark inbox items unread",
    description: "Marks one or more inbox items as unread for the requested user.",
  },
  openRepository: {
    summary: "Open a repository",
    description: "Mounts or initializes a repository and returns its current status.",
  },
  pushRepository: {
    summary: "Push repository changes",
    description: "Pushes repository synchronization changes and returns accepted sync metadata.",
  },
  removeIssueRelation: {
    summary: "Remove an issue relation",
    description: "Removes a typed relationship from one issue to another issue.",
  },
  removeRepository: {
    summary: "Remove a repository",
    description: "Removes a repository from the local workspace configuration.",
  },
  restoreIssue: {
    summary: "Restore an issue",
    description: "Restores an archived issue and optionally records a human-readable reason.",
  },
  retryAgentTask: {
    summary: "Retry an agent task",
    description: "Retries a failed or retryable agent task and returns the updated task.",
  },
  setInterfaceDensity: {
    summary: "Set interface density",
    description: "Updates the local interface density preference.",
  },
  setThemePreference: {
    summary: "Set theme preference",
    description: "Updates the local theme preference.",
  },
  status: {
    summary: "Read API status",
    description:
      "Returns authenticated runtime status for the local API service and mounted repositories.",
  },
  syncRepository: {
    summary: "Sync a repository",
    description: "Starts repository synchronization and returns the accepted repository status.",
  },
  transitionIssue: {
    summary: "Transition an issue",
    description: "Moves an issue to a new workflow status and optionally records a reason.",
  },
  updateAgentProviderPreference: {
    summary: "Update agent provider preferences",
    description: "Updates local preferences for one agent provider and returns app configuration.",
  },
  updateDraft: {
    summary: "Update an issue draft",
    description: "Updates editable body, frontmatter, or status fields on an issue draft.",
  },
  updateIssue: {
    summary: "Update an issue",
    description: "Updates mutable body and frontmatter fields on an issue document.",
  },
  updateProfile: {
    summary: "Update profile",
    description: "Updates local profile fields and returns the updated profile resource.",
  },
  updateRepositoryPreferences: {
    summary: "Update repository preferences",
    description: "Updates local preferences for one repository record.",
  },
  updateTemplate: {
    summary: "Update an issue template",
    description: "Updates mutable fields on an issue template.",
  },
  updateView: {
    summary: "Update a saved view",
    description: "Updates mutable fields on a saved view.",
  },
  upsertLabel: {
    summary: "Upsert a label",
    description: "Creates or updates a label definition using the path label id.",
  },
  upsertUser: {
    summary: "Upsert a user profile",
    description: "Creates or updates a user profile using the path user id.",
  },
};

const parameterDescriptions: Readonly<Record<string, string>> = {
  "path:commentId": "Stable comment record id.",
  "path:draftId": "Stable draft id.",
  "path:initiativeId": "Stable initiative issue id.",
  "path:issueId": "Stable issue id.",
  "path:labelId": "Stable label id.",
  "path:providerId": "Stable agent provider id.",
  "path:repositoryId": "Stable repository id.",
  "path:snapshotId": "Snapshot id identifying a historical revision.",
  "path:taskId": "Stable agent task id.",
  "path:templateId": "Stable issue template id.",
  "path:userId": "Stable user id.",
  "path:viewId": "Stable saved view id.",
  "query:page[cursor]": "Opaque cursor returned by the previous collection response.",
  "query:page[limit]": "Maximum number of collection entries to return.",
  "query:q": "Free-text search string.",
};

export const augmentOpenApiDocument = (
  document: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const spec = cloneDocument(document);

  applyOperationDocs(spec);
  applySchemaDocs(spec);
  hoistNestedDescriptions(spec);
  promoteReusableParameters(spec);

  return spec;
};

const cloneDocument = (document: Readonly<Record<string, unknown>>): OpenApiDocument =>
  JSON.parse(JSON.stringify(document)) as OpenApiDocument;

const applyOperationDocs = (spec: OpenApiDocument): void => {
  for (const operation of operations(spec)) {
    const operationId = typeof operation.operationId === "string" ? operation.operationId : "";
    const doc = operationDocs[operationId] ?? fallbackOperationDoc(operationId);
    operation.summary ??= doc.summary;
    operation.description ??= doc.description;
  }
};

const applySchemaDocs = (spec: OpenApiDocument): void => {
  const schemas = spec.components?.schemas;
  if (!isRecord(schemas)) return;

  if (isRecord(schemas._cycle_contracts_JsonValue)) {
    schemas._cycle_contracts_JsonValue.description ??=
      "Any JSON value supported by the Cycle contract.";
  }
};

const hoistNestedDescriptions = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      hoistNestedDescriptions(entry);
    }
    return;
  }
  if (!isRecord(value)) return;

  const allOf = Array.isArray(value.allOf) ? value.allOf : [];
  for (const entry of allOf) {
    if (!isRecord(entry)) continue;
    value.description ??= stringValue(entry.description);
    value.title ??= stringValue(entry.title);
  }

  for (const entry of Object.values(value)) {
    hoistNestedDescriptions(entry);
  }
};

const promoteReusableParameters = (spec: OpenApiDocument): void => {
  spec.components ??= {};
  spec.components.parameters ??= {};
  const components = spec.components.parameters as Record<string, OpenApiDocument>;

  for (const operation of operations(spec)) {
    if (!Array.isArray(operation.parameters)) continue;

    operation.parameters = operation.parameters.map((parameter: OpenApiDocument) => {
      if (typeof parameter.$ref === "string") return parameter;

      const component = parameterWithDescription(parameter);
      const name = parameterComponentName(component, components);
      components[name] ??= component;

      return { $ref: `#/components/parameters/${name}` };
    });
  }
};

const operations = function* (spec: OpenApiDocument): Iterable<OpenApiDocument> {
  const paths = spec.paths;
  if (!isRecord(paths)) return;

  for (const pathItem of Object.values(paths)) {
    if (!isRecord(pathItem)) continue;
    for (const method of httpMethods) {
      const operation = pathItem[method];
      if (isRecord(operation)) yield operation;
    }
  }
};

const parameterWithDescription = (parameter: OpenApiDocument): OpenApiDocument => {
  const schema = isRecord(parameter.schema) ? parameter.schema : undefined;
  const description =
    stringValue(parameter.description) ??
    stringValue(schema?.description) ??
    parameterDescriptions[
      `${stringValue(parameter.in) ?? ""}:${stringValue(parameter.name) ?? ""}`
    ] ??
    parameterDescriptions[stringValue(parameter.name) ?? ""];

  return {
    ...parameter,
    ...(description === undefined ? {} : { description }),
  };
};

const parameterComponentName = (
  parameter: OpenApiDocument,
  components: Readonly<Record<string, OpenApiDocument>>,
): string => {
  const baseName = `${pascalCase(stringValue(parameter.in) ?? "parameter")}${pascalCase(
    stringValue(parameter.name) ?? "value",
  )}Parameter`;
  const existing = components[baseName];
  if (existing === undefined || stableJson(existing) === stableJson(parameter)) return baseName;

  return `${baseName}${shortHash(stableJson(parameter))}`;
};

const fallbackOperationDoc = (operationId: string): OperationDoc => {
  const summary = humanizeIdentifier(operationId === "" ? "operation" : operationId);
  return {
    summary,
    description: `${summary}.`,
  };
};

const humanizeIdentifier = (value: string): string => {
  const words = value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[-_]+/gu, " ")
    .trim()
    .toLocaleLowerCase();
  return words.length === 0
    ? "Operation"
    : `${words[0]?.toLocaleUpperCase() ?? ""}${words.slice(1)}`;
};

const pascalCase = (value: string): string => {
  const words = value.match(/[A-Za-z0-9]+/gu) ?? ["parameter"];
  return words.map((word) => `${word[0]?.toLocaleUpperCase() ?? ""}${word.slice(1)}`).join("");
};

const shortHash = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const stableJson = (value: unknown): string => JSON.stringify(sortJson(value));

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
};

const isRecord = (value: unknown): value is OpenApiDocument =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
