import type { DraftNotCommittableError } from "./DraftNotCommittableError.ts";
import type { DraftNotFoundError } from "./DraftNotFoundError.ts";
import type { IssueNotFoundError } from "./IssueNotFoundError.ts";
import type { PlanImmutabilityError } from "./PlanImmutabilityError.ts";
import type { StorageConflictError } from "./StorageConflictError.ts";
import type { StorageError } from "./StorageError.ts";
import type { ValidationError } from "./ValidationError.ts";
import type { WorkflowError } from "./WorkflowError.ts";

export type TicketDbFailure =
  | DraftNotCommittableError
  | DraftNotFoundError
  | IssueNotFoundError
  | PlanImmutabilityError
  | StorageConflictError
  | StorageError
  | ValidationError
  | WorkflowError;
