import type { StorePath } from "../GitStoreSchemas.ts";
import { splitPath } from "./strings.ts";

export type DirectChild = {
  readonly name: string;
  readonly type: "blob" | "tree";
};

export const pathAncestors = (path: string): ReadonlyArray<string> => {
  const segments = splitPath(path);
  const output: Array<string> = [];

  for (let index = 1; index < segments.length; index += 1) {
    output.push(segments.slice(0, index).join("/"));
  }

  return output;
};

export const isPathOrDescendant = (path: string, parent: string): boolean =>
  path === parent || isDescendant(path, parent);

export const isDescendant = (path: string, parent: string): boolean =>
  path.startsWith(`${parent}/`);

export const directChildOf = (root: StorePath, path: string): DirectChild | null => {
  const prefix = root === "" ? "" : `${root}/`;

  if (root !== "" && !path.startsWith(prefix)) return null;

  const rest = root === "" ? path : path.slice(prefix.length);
  if (rest === "") return null;

  const separator = rest.indexOf("/");
  const name = separator === -1 ? rest : rest.slice(0, separator);

  return name === "" ? null : { name, type: separator === -1 ? "blob" : "tree" };
};
