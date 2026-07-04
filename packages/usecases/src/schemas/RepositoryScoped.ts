import { Schema } from "effect";
import { RepositoryRef } from "@cycle/contracts/schemas";

export const RepositoryScoped = <A extends Schema.Top>(input: A) =>
  Schema.Struct({
    input: input.pipe(Schema.annotateKey({ description: "Usecase-specific input payload." })),
    repository: RepositoryRef.pipe(
      Schema.annotateKey({ description: "Repository context for the usecase invocation." }),
    ),
  }).pipe(
    Schema.annotate({
      description: "Wrapper for usecase inputs that must be evaluated in a repository context.",
      identifier: "@cycle/usecases/RepositoryScoped",
      title: "RepositoryScoped",
    }),
  );

export type RepositoryScoped<A> = {
  readonly input: A;
  readonly repository: RepositoryRef;
};
