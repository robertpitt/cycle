import { Schema } from "effect";

export const DefaultRecordType = Schema.Literals([
  "comment",
  "conflict",
  "execution",
  "import",
  "provenance",
  "review",
  "status-change",
]);
export type RecordType = typeof DefaultRecordType.Type | (string & {});
