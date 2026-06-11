import {
  UseCasePayloadSchemasByAlias,
  UseCaseSuccessSchemasByAlias,
  type UseCasePayloadsByAlias,
  type UseCaseSuccessesByAlias,
} from "@cycle/contracts/contracts";
import type { Schema } from "effect";
import type { TicketRpcMethod } from "./Envelope.ts";

export const TicketRpcPayloadSchemas = UseCasePayloadSchemasByAlias as {
  readonly [Method in TicketRpcMethod]: Schema.Decoder<UseCasePayloadsByAlias[Method]>;
};

export const TicketRpcSuccessSchemas = UseCaseSuccessSchemasByAlias as {
  readonly [Method in TicketRpcMethod]: Schema.Decoder<UseCaseSuccessesByAlias[Method]>;
};

export type TicketRpcPayloads = UseCasePayloadsByAlias;
export type TicketRpcSuccesses = UseCaseSuccessesByAlias;
