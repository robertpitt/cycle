import type { CreateIssueDialogPriority, CreateIssueDialogStatus } from "@cycle/ui/organisms";
import * as React from "react";

export type CreateIssueFormValues = {
  readonly assignee: string | null;
  readonly createMore: boolean;
  readonly description: string;
  readonly dueDate: string;
  readonly error?: React.ReactNode;
  readonly estimate: string;
  readonly labels: readonly string[];
  readonly priority: CreateIssueDialogPriority;
  readonly project: string | null;
  readonly status: CreateIssueDialogStatus;
  readonly template: string | null;
  readonly title: string;
  readonly type: string;
};

const initialCreateIssueFormValues = (): CreateIssueFormValues => ({
  assignee: null,
  createMore: false,
  description: "",
  dueDate: "",
  error: undefined,
  estimate: "",
  labels: [],
  priority: "none",
  project: null,
  status: "todo",
  template: null,
  title: "",
  type: "issue",
});

export type CreateIssueFormDraft = {
  readonly body?: string;
  readonly dueDate?: string;
  readonly estimate?: number | string;
  readonly title: string;
  readonly type?: string;
};

export const getCreateIssueFormDraft = (
  values: CreateIssueFormValues,
): CreateIssueFormDraft | undefined => {
  const title = values.title.trim();

  if (title.length === 0) {
    return undefined;
  }

  const body = values.description.trim();

  return {
    body: body.length > 0 ? body : undefined,
    dueDate: values.dueDate.length > 0 ? values.dueDate : undefined,
    estimate: values.estimate.trim().length > 0 ? values.estimate.trim() : undefined,
    title,
    type: values.type,
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

  const openDialog = React.useCallback(() => {
    reset();
    setOpen(true);
  }, [reset]);

  const closeDialog = React.useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  return {
    closeDialog,
    createDisabled: values.title.trim().length === 0,
    open,
    openDialog,
    reset,
    setAssignee: React.useCallback((assignee: string | null) => update({ assignee }), [update]),
    setCreateMore: React.useCallback((createMore: boolean) => update({ createMore }), [update]),
    setDescription: React.useCallback((description: string) => update({ description }), [update]),
    setDueDate: React.useCallback((dueDate: string) => update({ dueDate }), [update]),
    setEstimate: React.useCallback((estimate: string) => update({ estimate }), [update]),
    setError: React.useCallback((error?: React.ReactNode) => update({ error }), [update]),
    setLabels: React.useCallback((labels: readonly string[]) => update({ labels }), [update]),
    setPriority: React.useCallback(
      (priority: CreateIssueDialogPriority) => update({ priority }),
      [update],
    ),
    setProject: React.useCallback((project: string | null) => update({ project }), [update]),
    setStatus: React.useCallback((status: CreateIssueDialogStatus) => update({ status }), [update]),
    setTemplate: React.useCallback((template: string | null) => update({ template }), [update]),
    setTitle: React.useCallback((title: string) => update({ title }), [update]),
    setType: React.useCallback((type: string) => update({ type }), [update]),
    values,
  };
};
