export { GitAdapterError } from "./GitAdapterError.ts";
export { GitRepositoryError } from "./GitRepositoryError.ts";
export { RemoteFetchError } from "./RemoteFetchError.ts";
export { RemotePushError } from "./RemotePushError.ts";

import type { GitAdapterError } from "./GitAdapterError.ts";
import type { GitRepositoryError } from "./GitRepositoryError.ts";
import type { RemoteFetchError } from "./RemoteFetchError.ts";
import type { RemotePushError } from "./RemotePushError.ts";

export type GitError = GitAdapterError | GitRepositoryError | RemoteFetchError | RemotePushError;
export type GitTransportError = RemoteFetchError | RemotePushError;
