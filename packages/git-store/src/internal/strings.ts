import {
  leadingSlashesPattern,
  lineEndingPattern,
  trailingNewlinePattern,
  trailingSlashesPattern,
} from "./patterns.ts";

export const firstLine = (value: string): string => splitLines(value)[0] ?? "";

export const splitLines = (value: string): ReadonlyArray<string> => value.split(lineEndingPattern);

export const splitPath = (value: string): ReadonlyArray<string> =>
  value === "" ? [] : value.split("/");

export const splitSpacePair = (value: string): readonly [string, string | undefined] => {
  const index = value.indexOf(" ");

  return index === -1 ? [value, undefined] : [value.slice(0, index), value.slice(index + 1)];
};

export const stripLeadingSlashes = (value: string): string =>
  value.replace(leadingSlashesPattern, "");

export const stripTrailingNewline = (value: string): string =>
  value.replace(trailingNewlinePattern, "");

export const stripTrailingSlashes = (value: string): string =>
  value.replace(trailingSlashesPattern, "");

export const stripWrappingSlashes = (value: string): string =>
  stripTrailingSlashes(stripLeadingSlashes(value));

export const tailAfterLastHyphen = (value: string): string => {
  const index = value.lastIndexOf("-");

  return index === -1 ? value : value.slice(index + 1);
};

export const toSlashPath = (value: string, separator: string): string =>
  separator === "/" ? value : value.split(separator).join("/");
