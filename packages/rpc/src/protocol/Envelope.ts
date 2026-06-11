import { UseCaseAliasList, type UseCaseAlias } from "@cycle/contracts/contracts";
import { Schema } from "effect";
import { TicketRpcError } from "./TicketRpcError.ts";

const TicketRpcMethods = UseCaseAliasList as readonly [UseCaseAlias, ...Array<UseCaseAlias>];

export const TicketRpcMethod = Schema.Literals(TicketRpcMethods);
export type TicketRpcMethod = UseCaseAlias;

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
