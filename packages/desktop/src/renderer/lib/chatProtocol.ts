import { Schema } from "effect";

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

export const ChatProtocolMessage = Schema.Struct({
  commandId: Schema.optional(Schema.String),
  createdAt: Schema.optional(Schema.String),
  eventId: Schema.optional(Schema.String),
  payload: Schema.optional(Schema.Unknown),
  sequence: Schema.optional(Schema.Number),
  threadId: Schema.optional(Schema.String),
  type: Schema.String,
  version: Schema.Literal(1),
});
export type ChatProtocolMessage = typeof ChatProtocolMessage.Type;

export const decodeChatProtocolMessage = (value: unknown): ChatProtocolMessage =>
  Schema.decodeUnknownSync(ChatProtocolMessage, StrictDecodeOptions)(value);

export const parseChatProtocolMessage = (raw: string): ChatProtocolMessage => {
  const parsed = JSON.parse(raw) as unknown;
  return decodeChatProtocolMessage(parsed);
};
