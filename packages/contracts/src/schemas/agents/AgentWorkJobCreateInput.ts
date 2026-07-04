import { Schema } from "effect";
import { JsonObject } from "../components/JsonObject.ts";
import { AgentWorkAuthorityMode } from "./AgentWorkAuthorityMode.ts";
import { AgentWorkTrigger } from "./AgentWorkTrigger.ts";

export const AgentWorkJobCreateInput = Schema.Struct({
  agentId: Schema.String.pipe(Schema.annotateKey({ description: "Agent id assigned to the job." })),
  authorityMode: AgentWorkAuthorityMode.pipe(
    Schema.annotateKey({ description: "Workspace and authority mode to grant." }),
  ),
  dedupeKey: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional deduplication key for idempotent job creation." }),
  ),
  logicalJobKey: Schema.String.pipe(
    Schema.annotateKey({ description: "Stable logical key shared by retries." }),
  ),
  metadata: Schema.optional(JsonObject).pipe(
    Schema.annotateKey({ description: "Optional JSON metadata to attach to the job." }),
  ),
  model: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Optional model override, or null to use the provider default.",
    }),
  ),
  providerId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional provider id override." }),
  ),
  repositoryId: Schema.String.pipe(
    Schema.annotateKey({ description: "Repository id containing the ticket." }),
  ),
  requestedBy: Schema.String.pipe(
    Schema.annotateKey({ description: "User or system id requesting the job." }),
  ),
  ticketId: Schema.String.pipe(
    Schema.annotateKey({ description: "Ticket id the job operates on." }),
  ),
  trigger: AgentWorkTrigger.pipe(
    Schema.annotateKey({ description: "Reason the job is being created." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for creating an Agent Work job.",
    identifier: "@cycle/contracts/AgentWorkJobCreateInput",
    title: "AgentWorkJobCreateInput",
  }),
);
export type AgentWorkJobCreateInput = typeof AgentWorkJobCreateInput.Type;
