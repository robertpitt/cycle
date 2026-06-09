import { Schema } from "effect";

export const objectIdPattern = /^[0-9a-fA-F]{40}$/u;
export const potentialObjectIdPattern = /^[0-9a-fA-F]{4,64}$/u;

export const ObjectId = Schema.String.check(
  Schema.isPattern(objectIdPattern, { expected: "a 40 character hexadecimal Git object id" }),
);
export type ObjectId = typeof ObjectId.Type;

export const PotentialObjectId = Schema.String.check(
  Schema.isPattern(potentialObjectIdPattern, {
    expected: "a 4 to 64 character hexadecimal Git object id or prefix",
  }),
);
export type PotentialObjectId = typeof PotentialObjectId.Type;

export const isPotentialObjectId = (value: string): boolean => potentialObjectIdPattern.test(value);
