import { Schema } from "effect";

export const AutomationViolation = Schema.Struct({
  code: Schema.String.pipe(Schema.annotateKey({ description: "Machine-readable violation code." })),
  field: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional field or path associated with the violation." }),
  ),
  message: Schema.String.pipe(
    Schema.annotateKey({ description: "Human-readable violation message." }),
  ),
  remediation: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional suggested remediation." }),
  ),
  severity: Schema.Literals(["error", "fatal", "warning"]).pipe(
    Schema.annotateKey({ description: "Violation severity." }),
  ),
  ticketId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional ticket id associated with the violation." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Single automation policy violation.",
    identifier: "@cycle/contracts/AutomationViolation",
    title: "AutomationViolation",
  }),
);
export type AutomationViolation = typeof AutomationViolation.Type;
