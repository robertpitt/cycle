export { ConsistencyError } from "./ConsistencyError.ts";
export { EventFoldError } from "./EventFoldError.ts";
export { MaterializationError } from "./MaterializationError.ts";
export { RepositoryNotFoundError } from "./RepositoryNotFoundError.ts";
export { SqliteError } from "./SqliteError.ts";
export { StorageError } from "./StorageError.ts";
export { ValidationError } from "./ValidationError.ts";
export { WorkflowError } from "./WorkflowError.ts";

import type { ConsistencyError } from "./ConsistencyError.ts";
import type { MaterializationError } from "./MaterializationError.ts";
import type { RepositoryNotFoundError } from "./RepositoryNotFoundError.ts";
import type { SqliteError } from "./SqliteError.ts";
import type { StorageError } from "./StorageError.ts";
import type { ValidationError } from "./ValidationError.ts";
import type { WorkflowError } from "./WorkflowError.ts";

export type DatabaseFailure =
  | ConsistencyError
  | MaterializationError
  | RepositoryNotFoundError
  | SqliteError
  | StorageError
  | ValidationError
  | WorkflowError;
