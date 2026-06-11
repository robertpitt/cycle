import { Schema } from "effect";
import { isValidPathSegment } from "./Identifier.ts";

const filter = (expected: string, predicate: (value: string) => boolean) =>
  Schema.makeFilter<string>((value) => predicate(value) || expected, { expected });

export const isValidStorePath = (path: string): boolean =>
  path === "" ||
  (!path.includes("\\") && !path.includes("\0") && path.split("/").every(isValidPathSegment));

export const StorePath = Schema.String.check(filter("a normalized store path", isValidStorePath));
export type StorePath = typeof StorePath.Type;

export const MutationPath = StorePath.check(
  filter("a non-root mutation path", (path) => path !== ""),
);
export type MutationPath = typeof MutationPath.Type;

export const joinStorePath = (...parts: ReadonlyArray<string>): string =>
  parts.filter(Boolean).join("/");
