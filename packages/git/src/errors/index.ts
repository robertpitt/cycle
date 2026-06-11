export { GitAdapterError, gitAdapterError } from "./GitAdapterError.ts";
export { GitRepositoryError, gitRepositoryError } from "./GitRepositoryError.ts";
export { RemoteFetchError, remoteFetchError } from "./RemoteFetchError.ts";
export { RemotePushError, remotePushError } from "./RemotePushError.ts";

import type { GitAdapterError } from "./GitAdapterError.ts";
import type { GitRepositoryError } from "./GitRepositoryError.ts";
import type { RemoteFetchError } from "./RemoteFetchError.ts";
import type { RemotePushError } from "./RemotePushError.ts";

export type GitError = GitAdapterError | GitRepositoryError | RemoteFetchError | RemotePushError;
export type GitTransportError = RemoteFetchError | RemotePushError;
