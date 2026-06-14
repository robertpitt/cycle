import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  IssueAssigneeMark,
  IssuePriorityMark,
  IssuePropertyOptionMenu,
  IssuePropertyPopover,
  IssueStatusMark,
  type IssuePropertyMenuOption,
} from "./index.ts";
import { Button } from "../../atoms/button/index.ts";
import { Input } from "../../atoms/input/index.ts";

const statusOptions = [
  { icon: <IssueStatusMark status="backlog" />, label: "Backlog", value: "backlog" },
  { icon: <IssueStatusMark status="todo" />, label: "Todo", value: "todo" },
  { icon: <IssueStatusMark status="in-progress" />, label: "In Progress", value: "in-progress" },
  { icon: <IssueStatusMark status="done" />, label: "Done", value: "done" },
] satisfies readonly IssuePropertyMenuOption[];

const meta = {
  args: {
    disabled: false,
  },
  component: IssuePropertyOptionMenu,
  tags: ["autodocs"],
  title: "Molecules/Issue Property Control",
} satisfies Meta<typeof IssuePropertyOptionMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Marks: Story = {
  args: {
    label: "Preview issue marks",
    onChange: () => undefined,
    options: statusOptions,
    trigger: <IssueStatusMark status="todo" />,
    value: "todo",
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-5">
      <IssuePriorityMark priority="none" />
      <IssuePriorityMark priority="low" />
      <IssuePriorityMark priority="medium" />
      <IssuePriorityMark priority="high" />
      <IssuePriorityMark priority="urgent" />
      <IssueStatusMark status="backlog" />
      <IssueStatusMark status="in-progress" />
      <IssueStatusMark status="done" />
      <IssueAssigneeMark />
      <IssueAssigneeMark name="Robert Pitt" />
      <IssueAssigneeMark name="Amelia Lee" size="md" />
    </div>
  ),
};

export const OptionMenu: Story = {
  args: {
    label: "Change status",
    onChange: () => undefined,
    options: statusOptions,
    trigger: <IssueStatusMark status="in-progress" />,
    value: "in-progress",
  },
};

export const Popover: Story = {
  args: {
    label: "Preview popover",
    onChange: () => undefined,
    options: statusOptions,
    trigger: <IssueStatusMark status="todo" />,
    value: "todo",
  },
  render: () => {
    const [value, setValue] = React.useState("2026-06-14");

    return (
      <IssuePropertyPopover label="Change due date" trigger={<IssueStatusMark status="todo" />}>
        {(close) => (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              close();
            }}
          >
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              <span>Due date</span>
              <Input
                aria-label="Due date"
                onChange={(event) => setValue(event.currentTarget.value)}
                type="date"
                value={value}
              />
            </label>
            <div className="flex items-center justify-end">
              <Button size="sm" type="submit">
                Apply
              </Button>
            </div>
          </form>
        )}
      </IssuePropertyPopover>
    );
  },
};
