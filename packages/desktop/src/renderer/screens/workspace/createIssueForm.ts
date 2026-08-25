import type { CreateIssueDialogPriority, CreateIssueDialogStatus } from "@cycle/ui/organisms";
import type {
  CreateDraftInput,
  ExternalLinkInput,
  TicketDraftDocument,
  UpdateDraftInput,
} from "@cycle/contracts/schemas";
import * as React from "react";
import {
  isTicketTypeSelection,
  resolveManualTicketType,
  type TicketTypeId,
  type TicketTypeSelectionId,
} from "../../lib/ticketTypes.ts";

export type CreateIssueFormMode = "agent" | "manual";

export type CreateIssueFormValues = {
  readonly assignee: string | null;
  readonly createMore: boolean;
  readonly description: string;
  readonly draftInstructions: string;
  readonly dueDate: string;
  readonly error?: React.ReactNode;
  readonly estimate: string;
  readonly externalLinks: readonly ExternalLinkInput[];
  readonly labels: readonly string[];
  readonly mode: CreateIssueFormMode;
  readonly parent: string | null;
  readonly priority: CreateIssueDialogPriority;
  readonly project: string | null;
  readonly repositoryId: string;
  readonly status: CreateIssueDialogStatus;
  readonly template: string | null;
  readonly title: string;
  readonly type: TicketTypeSelectionId | "";
};

const initialCreateIssueFormValues = (): CreateIssueFormValues => ({
  assignee: null,
  createMore: false,
  description: "",
  draftInstructions: "",
  dueDate: "",
  error: undefined,
  estimate: "",
  externalLinks: [],
  labels: [],
  mode: "agent",
  parent: null,
  priority: "none",
  project: null,
  repositoryId: "",
  status: "todo",
  template: null,
  title: "",
  type: "auto",
});

export type CreateIssueFormDraft = {
  readonly body?: string;
  readonly dueDate?: string;
  readonly estimate?: number | string;
  readonly title: string;
  readonly type: TicketTypeId;
};

export const getCreateIssueRepositorySelectionPatch = (
  repositoryId: string | null,
): Pick<
  CreateIssueFormValues,
  "assignee" | "externalLinks" | "labels" | "parent" | "project" | "repositoryId" | "template"
> => ({
  assignee: null,
  externalLinks: [],
  labels: [],
  parent: null,
  project: null,
  repositoryId: repositoryId ?? "",
  template: null,
});

export const getCreateIssueFormDraft = (
  values: CreateIssueFormValues,
): CreateIssueFormDraft | undefined => {
  const title = values.title.trim();

  if (title.length === 0 || !isTicketTypeSelection(values.type)) {
    return undefined;
  }

  const body = values.description.trim();

  return {
    body: body.length > 0 ? body : undefined,
    dueDate: values.dueDate.length > 0 ? values.dueDate : undefined,
    estimate: values.estimate.trim().length > 0 ? values.estimate.trim() : undefined,
    title,
    type: resolveManualTicketType(values.type),
  };
};

const agentDraftTitle = (instructions: string): string => {
  const firstLine = instructions
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const title = firstLine ?? "Agent-authored ticket draft";
  return title.length > 100 ? `${title.slice(0, 97).trimEnd()}...` : title;
};

const createDraftInput = (
  values: CreateIssueFormValues,
  title: string,
  type: TicketTypeId,
  body: string | undefined,
  source: unknown,
): CreateDraftInput => ({
  assignee: values.assignee,
  body,
  dueDate: values.dueDate.length > 0 ? values.dueDate : undefined,
  estimate: values.estimate.trim().length > 0 ? values.estimate.trim() : undefined,
  externalLinks: [...values.externalLinks],
  labels: [...values.labels],
  parent: values.parent,
  priority: values.priority,
  project: values.project,
  repository: values.repositoryId,
  source,
  status: values.status,
  title,
  type,
});

export const getManualCreateDraftInput = (
  values: CreateIssueFormValues,
): CreateDraftInput | undefined => {
  const draft = getCreateIssueFormDraft(values);
  if (!draft) return undefined;

  return createDraftInput(values, draft.title, draft.type, draft.body, {
    kind: "desktop-manual-draft",
    templateId: values.template,
  });
};

export const getAgentCreateDraftInput = (values: CreateIssueFormValues): CreateDraftInput => {
  const instructions = values.draftInstructions.trim();
  return createDraftInput(
    values,
    agentDraftTitle(instructions),
    isTicketTypeSelection(values.type) ? resolveManualTicketType(values.type) : "task",
    instructions,
    {
      authoringType: values.type || "auto",
      instructions,
      kind: "desktop-agent-draft",
      templateId: values.template,
    },
  );
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recoveredStatus = (status: string | undefined): CreateIssueDialogStatus =>
  status === "backlog" ||
  status === "canceled" ||
  status === "done" ||
  status === "in-progress" ||
  status === "todo"
    ? status
    : "todo";

const recoveredPriority = (priority: string | undefined): CreateIssueDialogPriority =>
  priority === "high" ||
  priority === "low" ||
  priority === "medium" ||
  priority === "urgent" ||
  priority === "none"
    ? priority
    : "none";

export const createIssueFormPatchFromDraft = (
  draft: TicketDraftDocument,
): Partial<CreateIssueFormValues> => {
  const source = isRecord(draft.input.source) ? draft.input.source : {};
  const templateId = typeof source.templateId === "string" ? source.templateId : null;
  const agentInstructions =
    typeof source.instructions === "string" ? source.instructions : (draft.input.body ?? "");

  return {
    assignee: draft.input.assignee ?? null,
    description: draft.input.body ?? "",
    draftInstructions: agentInstructions,
    dueDate: draft.input.dueDate ?? "",
    estimate: draft.input.estimate === undefined ? "" : String(draft.input.estimate),
    externalLinks: draft.input.externalLinks ?? [],
    labels: draft.input.labels ?? [],
    mode: "manual",
    parent: draft.input.parent ?? null,
    priority: recoveredPriority(draft.input.priority),
    project: draft.input.project ?? null,
    status: recoveredStatus(draft.input.status),
    template: templateId,
    title: draft.input.title,
    type: draft.input.type,
  };
};

export const createDraftUpdateInput = (
  draftId: string,
  input: CreateDraftInput,
): UpdateDraftInput => {
  const { body, status, ...frontmatter } = input;
  return {
    body,
    draftId,
    frontmatter,
    status,
  };
};

export const useCreateIssueForm = () => {
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<CreateIssueFormValues>(initialCreateIssueFormValues);

  const update = React.useCallback((patch: Partial<CreateIssueFormValues>) => {
    setValues((current) => ({
      ...current,
      ...patch,
    }));
  }, []);

  const reset = React.useCallback((nextValues?: Partial<CreateIssueFormValues>) => {
    setValues({
      ...initialCreateIssueFormValues(),
      ...nextValues,
    });
  }, []);

  const openDialog = React.useCallback(
    (nextValues?: Partial<CreateIssueFormValues>) => {
      reset(nextValues);
      setOpen(true);
    },
    [reset],
  );

  const closeDialog = React.useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  return {
    closeDialog,
    createDisabled: values.title.trim().length === 0 || !isTicketTypeSelection(values.type),
    draftDisabled: values.draftInstructions.trim().length === 0 || values.repositoryId.length === 0,
    open,
    openDialog,
    reset,
    selectRepository: React.useCallback(
      (repositoryId: string | null) => update(getCreateIssueRepositorySelectionPatch(repositoryId)),
      [update],
    ),
    setAssignee: React.useCallback((assignee: string | null) => update({ assignee }), [update]),
    setCreateMore: React.useCallback((createMore: boolean) => update({ createMore }), [update]),
    setDescription: React.useCallback((description: string) => update({ description }), [update]),
    setDraftInstructions: React.useCallback(
      (draftInstructions: string) => update({ draftInstructions }),
      [update],
    ),
    setDueDate: React.useCallback((dueDate: string) => update({ dueDate }), [update]),
    setEstimate: React.useCallback((estimate: string) => update({ estimate }), [update]),
    setError: React.useCallback((error?: React.ReactNode) => update({ error }), [update]),
    setLabels: React.useCallback((labels: readonly string[]) => update({ labels }), [update]),
    setExternalLinks: React.useCallback(
      (externalLinks: readonly ExternalLinkInput[]) => update({ externalLinks }),
      [update],
    ),
    setMode: React.useCallback((mode: CreateIssueFormMode) => update({ mode }), [update]),
    setParent: React.useCallback((parent: string | null) => update({ parent }), [update]),
    setPriority: React.useCallback(
      (priority: CreateIssueDialogPriority) => update({ priority }),
      [update],
    ),
    setProject: React.useCallback((project: string | null) => update({ project }), [update]),
    setRepositoryId: React.useCallback(
      (repositoryId: string) => update({ repositoryId }),
      [update],
    ),
    setStatus: React.useCallback((status: CreateIssueDialogStatus) => update({ status }), [update]),
    setTemplate: React.useCallback((template: string | null) => update({ template }), [update]),
    setTitle: React.useCallback((title: string) => update({ title }), [update]),
    setType: React.useCallback(
      (type: string) => update({ type: isTicketTypeSelection(type) ? type : "" }),
      [update],
    ),
    values,
  };
};
