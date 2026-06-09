import { Schema } from "effect";
import { TicketRpcError } from "./TicketRpcError.ts";

export const TicketRpcMethod = Schema.Literals([
  "ticket.draft.commit",
  "ticket.draft.create",
  "ticket.draft.update",
  "ticket.issue.create",
  "ticket.issue.get",
  "ticket.issue.history",
  "ticket.issue.list",
  "ticket.issue.transition",
  "ticket.issue.update",
  "ticket.record.add",
  "ticket.record.listForIssue",
]);
export type TicketRpcMethod = typeof TicketRpcMethod.Type;

export class TicketRpcRequest extends Schema.Class<TicketRpcRequest>("@cycle/rpc/TicketRpcRequest")(
  {
    id: Schema.String,
    method: TicketRpcMethod,
    payload: Schema.Unknown,
  },
) {}

export class TicketRpcSuccessResponse extends Schema.Class<TicketRpcSuccessResponse>(
  "@cycle/rpc/TicketRpcSuccessResponse",
)({
  id: Schema.String,
  ok: Schema.Literal(true),
  value: Schema.Unknown,
}) {}

export class TicketRpcFailureResponse extends Schema.Class<TicketRpcFailureResponse>(
  "@cycle/rpc/TicketRpcFailureResponse",
)({
  error: TicketRpcError,
  id: Schema.String,
  ok: Schema.Literal(false),
}) {}

export const TicketRpcResponse = Schema.Union([TicketRpcSuccessResponse, TicketRpcFailureResponse]);
export type TicketRpcResponse = typeof TicketRpcResponse.Type;
