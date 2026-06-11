import { Schema } from "effect";

export class TicketRpcError extends Schema.TaggedErrorClass<TicketRpcError>(
  "@cycle/rpc/TicketRpcError",
)("TicketRpcError", {
  code: Schema.String,
  details: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  message: Schema.String,
  sourceTag: Schema.optional(Schema.String),
}) {}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const detailsFrom = (error: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const details: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(error)) {
    if (key === "_tag" || key === "cause" || key === "message" || key === "stack") continue;
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string" ||
      Array.isArray(value)
    ) {
      details[key] = value;
    }
  }

  return details;
};

export const ticketRpcError = (input: {
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly message: string;
  readonly sourceTag?: string;
}): TicketRpcError =>
  new TicketRpcError({
    code: input.code,
    details: input.details,
    message: input.message,
    sourceTag: input.sourceTag,
  });

export const invalidRpcRequest = (message: string, details?: Readonly<Record<string, unknown>>) =>
  ticketRpcError({
    code: "INVALID_RPC_REQUEST",
    details,
    message,
  });

export const unknownRpcMethod = (method: string) =>
  ticketRpcError({
    code: "UNKNOWN_RPC_METHOD",
    details: { method },
    message: `Unknown RPC method: ${method}`,
  });

export const databaseFailureToRpcError = (error: unknown): TicketRpcError => {
  if (!isRecord(error)) {
    return ticketRpcError({
      code: "DATABASE_FAILURE",
      message: "Database request failed.",
    });
  }

  const sourceTag = typeof error["_tag"] === "string" ? error["_tag"] : undefined;
  const message =
    typeof error["message"] === "string" ? error["message"] : "Database request failed.";
  const details = detailsFrom(error);

  return ticketRpcError({
    code: sourceTag ?? "DATABASE_FAILURE",
    details: Object.keys(details).length === 0 ? undefined : details,
    message,
    sourceTag,
  });
};
