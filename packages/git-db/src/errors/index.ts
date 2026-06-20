export { DocumentNotFoundError, documentNotFound } from "./DocumentNotFoundError.ts";
export { InvalidIdentifierError, invalidIdentifier } from "./InvalidIdentifierError.ts";
export { InvalidJsonDocumentError, invalidJsonDocument } from "./InvalidJsonDocumentError.ts";
export { InvalidNamespaceError, invalidNamespace } from "./InvalidNamespaceError.ts";
export { InvalidPathError, invalidPath } from "./InvalidPathError.ts";
export { InvalidPointerNameError, invalidPointerName } from "./InvalidPointerNameError.ts";
export { PointerConflictError, pointerConflict } from "./PointerConflictError.ts";
export { PointerNotFoundError, pointerNotFound } from "./PointerNotFoundError.ts";
export {
  RepositoryIdentityConflictError,
  repositoryIdentityConflict,
} from "./RepositoryIdentityConflictError.ts";
export { SnapshotNotFoundError, snapshotNotFound } from "./SnapshotNotFoundError.ts";
export { StoreNotFoundError, storeNotFound } from "./StoreNotFoundError.ts";
export { SyncConflictError, syncConflict } from "./SyncConflictError.ts";
export { TransactionInactiveError, transactionInactive } from "./TransactionInactiveError.ts";
import type { DocumentNotFoundError } from "./DocumentNotFoundError.ts";
import type { GitAdapterError, RemoteFetchError, RemotePushError } from "@cycle/git/errors";
import type { InvalidIdentifierError } from "./InvalidIdentifierError.ts";
import type { InvalidJsonDocumentError } from "./InvalidJsonDocumentError.ts";
import type { InvalidNamespaceError } from "./InvalidNamespaceError.ts";
import type { InvalidPathError } from "./InvalidPathError.ts";
import type { InvalidPointerNameError } from "./InvalidPointerNameError.ts";
import type { PointerConflictError } from "./PointerConflictError.ts";
import type { PointerNotFoundError } from "./PointerNotFoundError.ts";
import type { RepositoryIdentityConflictError } from "./RepositoryIdentityConflictError.ts";
import type { SnapshotNotFoundError } from "./SnapshotNotFoundError.ts";
import type { StoreNotFoundError } from "./StoreNotFoundError.ts";
import type { SyncConflictError } from "./SyncConflictError.ts";
import type { TransactionInactiveError } from "./TransactionInactiveError.ts";

export type GitDbError =
  | StoreNotFoundError
  | InvalidNamespaceError
  | InvalidIdentifierError
  | InvalidPointerNameError
  | InvalidPathError
  | PointerNotFoundError
  | SnapshotNotFoundError
  | DocumentNotFoundError
  | PointerConflictError
  | RepositoryIdentityConflictError
  | SyncConflictError
  | GitAdapterError
  | RemoteFetchError
  | RemotePushError
  | InvalidJsonDocumentError
  | TransactionInactiveError;
