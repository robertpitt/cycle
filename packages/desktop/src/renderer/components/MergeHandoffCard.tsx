import type { AgentTaskHandoff } from "@cycle/contracts/schemas/agents";
import { Button, StatusIndicator } from "@cycle/ui/atoms";
import * as React from "react";
import { getDesktopBridge } from "../lib/desktopBridge.ts";

export const mergeHandoffState = (
  state: AgentTaskHandoff["state"],
): { readonly label: string; readonly tone: "danger" | "success" | "warning" } => {
  switch (state) {
    case "merge_ready":
      return { label: "Merge ready", tone: "success" };
    case "needs_user_input":
      return { label: "Needs user input", tone: "warning" };
    case "abandoned":
      return { label: "Abandoned", tone: "warning" };
    case "failed":
      return { label: "Failed", tone: "danger" };
  }
};

const EvidenceList = ({
  empty,
  items,
}: {
  readonly empty: string;
  readonly items: readonly string[];
}) => (
  <ul className="grid gap-1 text-xs text-foreground">
    {items.length === 0 ? (
      <li className="text-muted-foreground">{empty}</li>
    ) : (
      items.map((item, index) => (
        <li className="break-all" key={`${item}:${index}`}>
          {item}
        </li>
      ))
    )}
  </ul>
);

export const MergeHandoffCard = ({ handoff }: { readonly handoff: AgentTaskHandoff }) => {
  const state = mergeHandoffState(handoff.state);
  const [copied, setCopied] = React.useState(false);
  const copyCommands = () => {
    void navigator.clipboard?.writeText(handoff.mergeCommands.join("\n")).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    });
  };

  return (
    <section aria-label="Merge handoff" className="grid gap-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Final handoff
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <StatusIndicator label={state.label} tone={state.tone} />
          {state.label}
        </span>
      </div>

      {handoff.failure ? (
        <div className="rounded-sm bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {handoff.failure.message}
        </div>
      ) : null}
      {handoff.pushError ? (
        <div className="rounded-sm bg-warning/10 px-2 py-1.5 text-xs text-warning">
          Push failed: {handoff.pushError}
        </div>
      ) : null}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Branch</dt>
        <dd className="break-all text-foreground">{handoff.branchName ?? "Not published"}</dd>
        <dt className="text-muted-foreground">Remote push</dt>
        <dd className="break-all text-foreground">
          {handoff.pushStatus.replaceAll("_", " ")}
          {handoff.remoteName ? ` · ${handoff.remoteName}` : ""}
        </dd>
        <dt className="text-muted-foreground">Commits</dt>
        <dd className="grid gap-0.5 font-mono text-foreground">
          {handoff.commits.length === 0
            ? "None"
            : handoff.commits.map((commit) => <span key={commit}>{commit.slice(0, 12)}</span>)}
        </dd>
      </dl>

      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">Changed files</span>
        <EvidenceList
          empty="No changed files recorded."
          items={handoff.changedFiles.map((file) => `${file.status}  ${file.path}`)}
        />
      </div>
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">Tests</span>
        <EvidenceList
          empty="No tests reported."
          items={handoff.tests.map((test) => `${test.status}: ${test.command ?? test.result}`)}
        />
      </div>
      {handoff.artifacts.length > 0 ? (
        <div className="grid gap-1">
          <span className="text-xs font-medium text-muted-foreground">Screenshots / artifacts</span>
          <EvidenceList empty="No artifacts." items={handoff.artifacts} />
        </div>
      ) : null}
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Risks, limitations &amp; follow-ups
        </span>
        <EvidenceList empty="None reported." items={handoff.knownLimitations} />
      </div>

      {handoff.mergeCommands.length > 0 ? (
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Merge commands</span>
          <pre className="overflow-x-auto rounded-sm bg-background p-2 text-[11px] text-foreground">
            {handoff.mergeCommands.join("\n")}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copyCommands} size="sm" variant="outline">
              {copied ? "Copied" : "Copy commands"}
            </Button>
            {handoff.branchUrl ? (
              <Button
                onClick={() => void getDesktopBridge()?.openExternal(handoff.branchUrl!)}
                size="sm"
                variant="outline"
              >
                Open branch
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};
