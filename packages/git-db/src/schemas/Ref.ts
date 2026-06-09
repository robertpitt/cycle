import { Schema } from "effect";
import { isValidPathSegment } from "./Identifier.ts";
import { ObjectId } from "./ObjectId.ts";

export const invalidRefChars = /[ ~^:?*[\\]/u;

const filter = (expected: string, predicate: (value: string) => boolean) =>
  Schema.makeFilter<string>((value) => predicate(value) || expected, { expected });

export const hasInvalidRefChar = (value: string): boolean =>
  value.includes("\u0000") || invalidRefChars.test(value);

export const isValidRefSegment = (segment: string): boolean =>
  isValidPathSegment(segment) && !segment.endsWith(".") && !segment.startsWith(".");

export const isValidRefPath = (ref: string): boolean =>
  !ref.includes("//") &&
  !ref.includes("@{") &&
  !hasInvalidRefChar(ref) &&
  ref.split("/").every(isValidRefSegment);

export const isValidNamespace = (namespace: string, allowBranchNamespace = false): boolean =>
  namespace.startsWith("refs/") &&
  (allowBranchNamespace || !namespace.startsWith("refs/heads")) &&
  isValidRefPath(namespace);

export const Namespace = Schema.String.check(
  filter("a Git ref namespace outside refs/heads", (value) => isValidNamespace(value, false)),
);
export type Namespace = typeof Namespace.Type;

export const BranchNamespace = Schema.String.check(
  filter("a Git ref namespace", (value) => isValidNamespace(value, true)),
);
export type BranchNamespace = typeof BranchNamespace.Type;

export const namespace = (allowBranchNamespace = false) =>
  allowBranchNamespace ? BranchNamespace : Namespace;

export const RefName = Schema.String.check(filter("a valid Git ref path", isValidRefPath));
export type RefName = typeof RefName.Type;

export const isValidPointerName = (pointer: string): boolean => {
  if (
    pointer.length === 0 ||
    pointer.startsWith("/") ||
    pointer.endsWith("/") ||
    pointer.startsWith("refs/") ||
    pointer.startsWith("remotes/") ||
    pointer.startsWith("transactions/") ||
    pointer.includes("//") ||
    pointer.includes("@{") ||
    hasInvalidRefChar(pointer) ||
    pointer.endsWith(".lock")
  ) {
    return false;
  }

  return pointer.split("/").every(isValidRefSegment);
};

export const PointerName = Schema.String.check(
  filter("a relative Git ref segment for a store pointer", isValidPointerName),
);
export type PointerName = typeof PointerName.Type;

export const Ref = Schema.Struct({
  name: RefName,
  target: ObjectId,
});
export type Ref = typeof Ref.Type;
