import { Schema } from "effect";
import { CURRENT_SCHEMA_VERSION } from "../constants.ts";
import { IssueFrontmatter } from "./IssueFrontmatter.ts";

export class IssueDocument extends Schema.Class<IssueDocument>("@cycle/ticket-db/IssueDocument")({
  assignee: Schema.String,
  body: Schema.String,
  bodyFormat: Schema.Literal("markdown"),
  createdBy: Schema.String,
  externalSource: Schema.optional(Schema.String),
  frontmatter: IssueFrontmatter,
  id: Schema.String,
  labels: Schema.optional(Schema.Array(Schema.String)),
  parent: Schema.String,
  priority: Schema.String,
  repository: Schema.optional(Schema.String),
  schemaVersion: Schema.Literal(CURRENT_SCHEMA_VERSION),
  status: Schema.String,
  type: Schema.String,
  updatedDate: Schema.String,
}) {}
