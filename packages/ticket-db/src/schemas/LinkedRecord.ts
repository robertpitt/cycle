import { Schema } from "effect";
import { CURRENT_SCHEMA_VERSION } from "../constants.ts";
import { Actor } from "./Actor.ts";

export class LinkedRecord extends Schema.Class<LinkedRecord>("@cycle/ticket-db/LinkedRecord")({
  createdAt: Schema.String,
  createdBy: Actor,
  createdDate: Schema.String,
  id: Schema.String,
  issueId: Schema.String,
  payload: Schema.Unknown,
  recordType: Schema.String,
  schemaVersion: Schema.Literal(CURRENT_SCHEMA_VERSION),
}) {}
