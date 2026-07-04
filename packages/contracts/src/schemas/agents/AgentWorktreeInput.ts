import { Schema } from "effect";

export const AgentWorktreeInput = Schema.Struct({
  baseRef: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional base git ref used to create the worktree." }),
  ),
  baseSha: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional base commit sha used to create the worktree." }),
  ),
  branchName: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional branch name checked out in the worktree." }),
  ),
  branchRef: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional full branch ref checked out in the worktree." }),
  ),
  cleanedAt: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "ISO timestamp when cleanup finished." }),
  ),
  createdAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the worktree record was created." }),
  ),
  jobId: Schema.String.pipe(
    Schema.annotateKey({ description: "Job id that owns or created the worktree." }),
  ),
  mode: Schema.Literals(["disposable", "implementation"]).pipe(
    Schema.annotateKey({ description: "Worktree mode." }),
  ),
  path: Schema.String.pipe(Schema.annotateKey({ description: "Filesystem path to the worktree." })),
  repositoryId: Schema.String.pipe(
    Schema.annotateKey({ description: "Repository id the worktree belongs to." }),
  ),
  retentionReason: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional reason the worktree was retained after completion.",
    }),
  ),
  status: Schema.Literals(["creating", "ready", "cleaning", "cleaned", "failed", "retained"]).pipe(
    Schema.annotateKey({ description: "Current worktree lifecycle status." }),
  ),
  updatedAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the worktree record last changed." }),
  ),
  worktreeId: Schema.String.pipe(Schema.annotateKey({ description: "Stable worktree id." })),
}).pipe(
  Schema.annotate({
    description: "Worktree record payload for Agent Work persistence boundaries.",
    identifier: "@cycle/contracts/AgentWorktreeInput",
    title: "AgentWorktreeInput",
  }),
);
export type AgentWorktreeInput = typeof AgentWorktreeInput.Type;
