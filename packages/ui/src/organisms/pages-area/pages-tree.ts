export type PagesAreaPage = {
  readonly archived?: boolean;
  readonly body: string;
  readonly id: string;
  readonly path: string;
  readonly revisionId: string;
  readonly title: string;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
};

export type PagesAreaDraft = Pick<PagesAreaPage, "body" | "path" | "title">;

export type PagesTreePageEntry = {
  readonly fileName: string;
  readonly page: PagesAreaPage;
};

export type PagesTreeDirectory = {
  readonly cover?: PagesAreaPage;
  readonly directories: readonly PagesTreeDirectory[];
  readonly name: string;
  readonly pages: readonly PagesTreePageEntry[];
  readonly path: string;
};

type MutablePagesTreeDirectory = {
  cover?: PagesAreaPage;
  readonly directories: Map<string, MutablePagesTreeDirectory>;
  readonly name: string;
  readonly pages: PagesTreePageEntry[];
  readonly path: string;
};

const compareText = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const mutableDirectory = (name: string, path: string): MutablePagesTreeDirectory => ({
  directories: new Map(),
  name,
  pages: [],
  path,
});

const childDirectory = (
  parent: MutablePagesTreeDirectory,
  name: string,
): MutablePagesTreeDirectory => {
  const existing = parent.directories.get(name);
  if (existing !== undefined) return existing;

  const directory = mutableDirectory(
    name,
    parent.path.length === 0 ? name : `${parent.path}/${name}`,
  );
  parent.directories.set(name, directory);
  return directory;
};

const immutableDirectory = (directory: MutablePagesTreeDirectory): PagesTreeDirectory => ({
  ...(directory.cover === undefined ? {} : { cover: directory.cover }),
  directories: [...directory.directories.values()]
    .sort((left, right) => compareText(left.name, right.name))
    .map(immutableDirectory),
  name: directory.name,
  pages: [...directory.pages].sort(
    (left, right) =>
      compareText(left.fileName, right.fileName) || compareText(left.page.id, right.page.id),
  ),
  path: directory.path,
});

export const buildPagesTree = (
  pages: readonly PagesAreaPage[],
  includeArchived = false,
): PagesTreeDirectory => {
  const root = mutableDirectory("", "");

  for (const page of pages) {
    if (page.archived && !includeArchived) continue;

    const segments = page.path.split("/");
    const fileName = segments.pop();
    if (fileName === undefined || fileName.length === 0 || segments.some((segment) => !segment)) {
      continue;
    }

    const directory = segments.reduce(childDirectory, root);
    if (fileName === "index.md") {
      if (directory.cover === undefined || (directory.cover.archived && !page.archived)) {
        directory.cover = page;
      }
      continue;
    }

    directory.pages.push({ fileName, page });
  }

  return immutableDirectory(root);
};

export const findPagesTreeDirectory = (
  root: PagesTreeDirectory,
  path: string,
): PagesTreeDirectory | undefined => {
  if (path.length === 0) return root;

  let current: PagesTreeDirectory | undefined = root;
  for (const segment of path.split("/")) {
    current = current?.directories.find((directory) => directory.name === segment);
    if (current === undefined) return undefined;
  }
  return current;
};

export const pageDraftFrom = (page: PagesAreaPage): PagesAreaDraft => ({
  body: page.body,
  path: page.path,
  title: page.title,
});

export const isPageDraftDirty = (draft: PagesAreaDraft, page: PagesAreaPage | undefined): boolean =>
  page !== undefined &&
  (draft.body !== page.body || draft.path !== page.path || draft.title !== page.title);
