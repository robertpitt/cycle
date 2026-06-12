import type { TreeEntry } from "../schemas/index.ts";

const encoder = new TextEncoder();

const treeSortName = (entry: TreeEntry): Uint8Array =>
  encoder.encode(entry.type === "tree" ? `${entry.name}/` : entry.name);

export const compareTreeEntries = (left: TreeEntry, right: TreeEntry): number => {
  const leftName = treeSortName(left);
  const rightName = treeSortName(right);
  const length = Math.min(leftName.byteLength, rightName.byteLength);

  for (let index = 0; index < length; index += 1) {
    const diff = leftName[index] - rightName[index];

    if (diff !== 0) return diff;
  }

  return leftName.byteLength - rightName.byteLength;
};
