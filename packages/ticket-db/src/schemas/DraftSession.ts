import { Schema } from "effect";
import { CURRENT_SCHEMA_VERSION } from "../constants.ts";
import { Actor } from "./Actor.ts";
import { DraftStatus } from "./DraftStatus.ts";
import { IssueDocument } from "./IssueDocument.ts";
import { LinkedRecord } from "./LinkedRecord.ts";

export class DraftSession extends Schema.Class<DraftSession>("@cycle/ticket-db/DraftSession")({
  createdAt: Schema.String,
  createdBy: Actor,
  createdByKey: Schema.String,
  id: Schema.String,
  issue: IssueDocument,
  records: Schema.Array(LinkedRecord),
  schemaVersion: Schema.Literal(CURRENT_SCHEMA_VERSION),
  source: Schema.optional(Schema.Unknown),
  status: DraftStatus,
  updatedAt: Schema.String,
  updatedDate: Schema.String,
}) {}
