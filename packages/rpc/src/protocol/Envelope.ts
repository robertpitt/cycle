import { Schema } from "effect";
import { TicketRpcError } from "./TicketRpcError.ts";

export const TicketRpcMethod = Schema.Literals([
  "repository.history.list",
  "repository.materializationWarnings",
  "repository.status.get",
  "repository.status.list",
  "repository.push",
  "repository.sync",
  "ticket.draft.commit",
  "ticket.draft.create",
  "ticket.draft.update",
  "ticket.issue.archive",
  "ticket.issue.create",
  "ticket.issue.delete",
  "ticket.issue.diff",
  "ticket.issue.get",
  "ticket.issue.history",
  "ticket.issue.list",
  "ticket.issue.relation.add",
  "ticket.issue.relation.remove",
  "ticket.issue.restore",
  "ticket.issue.revision.get",
  "ticket.issue.search",
  "ticket.issue.transition",
  "ticket.issue.update",
  "ticket.initiative.create",
  "ticket.initiative.progress",
  "ticket.initiative.update.add",
  "ticket.label.archive",
  "ticket.label.list",
  "ticket.label.upsert",
  "ticket.record.add",
  "ticket.record.listForIssue",
  "ticket.template.archive",
  "ticket.template.create",
  "ticket.template.get",
  "ticket.template.list",
  "ticket.template.update",
  "ticket.user.get",
  "ticket.user.list",
  "ticket.user.upsert",
  "ticket.view.create",
  "ticket.view.delete",
  "ticket.view.get",
  "ticket.view.list",
  "ticket.view.update",
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
