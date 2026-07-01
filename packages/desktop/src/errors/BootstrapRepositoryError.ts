import { Data } from "effect";

export class BootstrapRepositoryError extends Data.TaggedError("BootstrapRepositoryError")<{
  readonly message: string;
  readonly repositoryId: string;
}> {}
