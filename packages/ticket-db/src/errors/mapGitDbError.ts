import type { GitDbError } from "@cycle/git-db";
import { PointerConflictError } from "@cycle/git-db";
import { storageConflict } from "./StorageConflictError.ts";
import { storageError } from "./StorageError.ts";
import type { TicketDbFailure } from "./TicketDbFailure.ts";

export const mapGitDbError =
  (operation: string) =>
  (error: GitDbError): TicketDbFailure =>
    error instanceof PointerConflictError
      ? storageConflict({
          actual: error.actual,
          cause: error,
          expected: error.expected,
          operation,
          pointer: error.pointer,
        })
      : storageError(operation, error);
