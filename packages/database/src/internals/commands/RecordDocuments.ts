import {
  CURRENT_SCHEMA_VERSION,
  normalizeKey,
  updatedDateKey,
  type LinkedRecord,
} from "../../domain/index.ts";
export const parseRecord = (input: unknown): LinkedRecord => {
  if (input === null || typeof input !== "object") throw new Error("record must be an object");

  const value = input as Partial<LinkedRecord>;

  if (
    typeof value.id !== "string" ||
    typeof value.issueId !== "string" ||
    typeof value.recordType !== "string" ||
    typeof value.createdAt !== "string" ||
    value.createdBy === undefined
  ) {
    throw new Error("record is missing required fields");
  }

  return {
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    createdDate: value.createdDate ?? updatedDateKey(value.createdAt),
    id: value.id,
    issueId: value.issueId,
    payload: value.payload,
    recordType: normalizeKey(value.recordType),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
};

export const makeRecordId = (ticketId: string, recordType: string, recordId: string): string =>
  `${ticketId}_${normalizeKey(recordType)}_${recordId}`;

export const ticketIdFromRecordId = (recordId: string): string | undefined => {
  const marker = recordId.indexOf("_");

  if (marker === -1) return undefined;

  return recordId.slice(0, marker);
};
