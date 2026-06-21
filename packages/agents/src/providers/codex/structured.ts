import { Schema } from "effect";
import type { AgentResponseFormat } from "../../types.ts";

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const decodeStructuredValue = <TStructured>(
  schema: Schema.Codec<TStructured>,
  value: unknown,
): TStructured => Schema.decodeUnknownSync(schema, StrictDecodeOptions)(value) as TStructured;

export const parseStructured = <TStructured>(
  format: AgentResponseFormat<TStructured> | undefined,
  text: string,
): TStructured | undefined => {
  if (format?.type !== "json_schema") return undefined;

  if (format.effectSchema !== undefined) {
    const parsed = format.parse === undefined ? (JSON.parse(text) as unknown) : format.parse(text);
    return decodeStructuredValue(format.effectSchema, parsed);
  }

  return format.parse(text);
};
