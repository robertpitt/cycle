import { Effect } from "effect";
import { BranchCollisionError } from "../WorktreeErrors.ts";

export type BranchCollisionAssociation = {
  readonly branchName: string;
  readonly ticketId: string;
};

export type BranchCollisionResolution =
  | {
      readonly branchName: string;
      readonly branchRef: string;
      readonly type: "none";
    }
  | {
      readonly branchName: string;
      readonly branchRef: string;
      readonly type: "same-ticket";
    }
  | {
      readonly branchName: string;
      readonly branchRef: string;
      readonly desiredBranchName: string;
      readonly type: "renamed";
    };

export const refForBranch = (branchName: string): string => `refs/heads/${branchName}`;

const sanitizeSegment = (value: string, fallback: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");

  return normalized.length === 0 ? fallback : normalized;
};

export const branchTypeSegment = (ticketType: string | undefined): string => {
  switch (ticketType?.trim().toLowerCase()) {
    case "epic":
    case "initiative":
      return "epic";
    case "feature":
      return "feature";
    case "story":
      return "story";
    case "bug":
      return "bug";
    case "specification":
      return "specification";
    case "task":
    case "issue":
    case undefined:
    case "":
      return "task";
    default:
      return "task";
  }
};

export const implementationBranchName = (input: {
  readonly ticketId: string;
  readonly ticketSlugSource?: string | undefined;
  readonly ticketType?: string | undefined;
}): string => {
  const ticketId = sanitizeSegment(input.ticketId, "ticket").toUpperCase();
  const slug = sanitizeSegment(input.ticketSlugSource ?? "", "work");
  return `cycle/${branchTypeSegment(input.ticketType)}/${ticketId}-${slug}`;
};

export const backupBranchName = (input: {
  readonly timestamp: string;
  readonly worktreeId: string;
}): string => {
  const stamp = input.timestamp.replace(/[^0-9A-Za-z]+/gu, "-").replace(/^-+|-+$/gu, "");
  return `cycle/backup/worktrees/${input.worktreeId}-${stamp}`;
};

export const resolveBranchCollision = Effect.fn("resolveBranchCollision")(function* (input: {
  readonly desiredBranchName: string;
  readonly existingAssociations?: readonly BranchCollisionAssociation[] | undefined;
  readonly existingBranches: readonly string[];
  readonly maxAttempts?: number | undefined;
  readonly repositoryId?: string | undefined;
  readonly ticketId: string;
}) {
  const branches = new Set(input.existingBranches);
  const association = input.existingAssociations?.find(
    (candidate) => candidate.branchName === input.desiredBranchName,
  );

  if (!branches.has(input.desiredBranchName)) {
    return {
      branchName: input.desiredBranchName,
      branchRef: refForBranch(input.desiredBranchName),
      type: "none" as const,
    };
  }

  if (association?.ticketId === input.ticketId) {
    return {
      branchName: input.desiredBranchName,
      branchRef: refForBranch(input.desiredBranchName),
      type: "same-ticket" as const,
    };
  }

  const maxAttempts = input.maxAttempts ?? 100;
  for (let suffix = 2; suffix <= maxAttempts; suffix++) {
    const branchName = `${input.desiredBranchName}-${suffix}`;
    if (!branches.has(branchName)) {
      return {
        branchName,
        branchRef: refForBranch(branchName),
        desiredBranchName: input.desiredBranchName,
        type: "renamed" as const,
      };
    }
  }

  return yield* new BranchCollisionError({
    branchName: input.desiredBranchName,
    message: `Unable to find a non-conflicting branch name for ${input.desiredBranchName}.`,
    repositoryId: input.repositoryId,
    ticketId: input.ticketId,
  });
});

export const sanitizeCommitMessage = (message: string): string => {
  const lines = message.replace(/\r\n?/gu, "\n").split("\n");
  const withoutCoAuthors = lines.filter((line) => !/^Co-authored-by:/iu.test(line.trim()));
  const normalized = withoutCoAuthors.join("\n").trim();
  return normalized.length === 0 ? "Agent implementation update" : normalized;
};
