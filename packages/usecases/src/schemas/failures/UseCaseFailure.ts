import { Schema } from "effect";
import { UseCaseFailureTag } from "./UseCaseFailureTag.ts";

export const UseCaseFailure = Schema.Struct({
  _tag: UseCaseFailureTag.pipe(Schema.annotateKey({ description: "Failure category." })),
  code: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional machine-readable code within the failure category.",
    }),
  ),
  details: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)).pipe(
    Schema.annotateKey({
      description: "Redacted diagnostic details preserved as explicit extension data.",
    }),
  ),
  field: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional field or path associated with invalid input." }),
  ),
  message: Schema.String.pipe(
    Schema.annotateKey({ description: "Human-readable failure message." }),
  ),
  pageId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Page id related to the failure." }),
  ),
  repositoryId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Repository id related to the failure." }),
  ),
  requestId: Schema.String.pipe(
    Schema.annotateKey({ description: "Request id associated with the usecase invocation." }),
  ),
  retryable: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether retrying the operation may succeed." }),
  ),
  ticketId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Ticket id related to the failure." }),
  ),
  useCase: Schema.String.pipe(
    Schema.annotateKey({ description: "Usecase name that produced the failure." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Canonical failure returned by usecase boundaries.",
    identifier: "@cycle/usecases/UseCaseFailure",
    title: "UseCaseFailure",
  }),
);
export type UseCaseFailure = typeof UseCaseFailure.Type;
