import { Schema } from "effect";

export const RepositoryStatusEnum = Schema.Literals([
  "degraded",
  "empty",
  "failed",
  "ready",
  "syncing",
]).pipe(
  Schema.annotate({
    description: "Projection status for an opened repository.",
    identifier: "@cycle/contracts/RepositoryStatusEnum",
    title: "RepositoryStatusEnum",
  }),
);
export type RepositoryStatusEnum = typeof RepositoryStatusEnum.Type;
