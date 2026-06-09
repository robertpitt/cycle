import { Schema } from "effect";
import { Actor } from "./Actor.ts";
import { AgentProvenance } from "./AgentProvenance.ts";
import { ExternalLink } from "./ExternalLink.ts";

export class IssueFrontmatter extends Schema.Class<IssueFrontmatter>(
  "@cycle/ticket-db/IssueFrontmatter",
)({
  agentProvenance: Schema.optional(AgentProvenance),
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  children: Schema.optional(Schema.Array(Schema.String)),
  createdAt: Schema.String,
  createdBy: Actor,
  externalLinks: Schema.optional(Schema.Array(ExternalLink)),
  id: Schema.String,
  labels: Schema.optional(Schema.Array(Schema.String)),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  planAcceptedAt: Schema.optional(Schema.String),
  planAcceptedBy: Schema.optional(Actor),
  planningNotRequired: Schema.optional(Schema.Boolean),
  priority: Schema.String,
  repository: Schema.optional(Schema.String),
  status: Schema.String,
  title: Schema.String,
  type: Schema.String,
  updatedAt: Schema.String,
}) {
  readonly [key: string]: unknown;
}
