export { DocumentNotFoundError } from "./DocumentNotFoundError.ts";
export { InvalidIdentifierError } from "./InvalidIdentifierError.ts";
export { InvalidJsonDocumentError } from "./InvalidJsonDocumentError.ts";
export { InvalidNamespaceError } from "./InvalidNamespaceError.ts";
export { InvalidPathError } from "./InvalidPathError.ts";
export { InvalidPointerNameError } from "./InvalidPointerNameError.ts";
export { PointerConflictError } from "./PointerConflictError.ts";
export { PointerNotFoundError } from "./PointerNotFoundError.ts";
export { RepositoryIdentityConflictError } from "./RepositoryIdentityConflictError.ts";
export { SnapshotNotFoundError } from "./SnapshotNotFoundError.ts";
export { StoreNotFoundError } from "./StoreNotFoundError.ts";
export { SyncConflictError } from "./SyncConflictError.ts";
export { TransactionInactiveError } from "./TransactionInactiveError.ts";
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
