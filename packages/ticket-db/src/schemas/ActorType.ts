import { Schema } from "effect";

export const ActorType = Schema.Literals(["agent", "human", "importer", "system"]);
export type ActorType = typeof ActorType.Type;
