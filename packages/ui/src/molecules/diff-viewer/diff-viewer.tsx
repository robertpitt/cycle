import { parseDiffFromFile, type FileContents, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff as PierreFileDiff } from "@pierre/diffs/react";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { typography } from "../../lib/styles.ts";

export type DiffViewerFile = {
  readonly language?: string;
  readonly newContent: string;
  readonly newPath: string;
  readonly oldContent: string;
  readonly oldPath: string;
};

export type DiffViewerProps = {
  readonly className?: string;
  readonly files: readonly DiffViewerFile[];
  readonly loading?: boolean;
  readonly maxContentLength?: number;
  readonly mode?: "split" | "unified";
};

const defaultMaxContentLength = 200_000;

const toFileContents = (
  name: string,
  contents: string,
  language?: string,
  suffix?: string,
): FileContents => ({
  cacheKey: `${name}:${suffix ?? ""}:${contents.length}`,
  contents,
  lang: language as FileContents["lang"],
  name,
});

const parseFiles = (files: readonly DiffViewerFile[]): ReadonlyArray<FileDiffMetadata> =>
  files.map((file, index) =>
    parseDiffFromFile(
      toFileContents(file.oldPath, file.oldContent, file.language, `old-${index}`),
      toFileContents(file.newPath, file.newContent, file.language, `new-${index}`),
    ),
  );

export const DiffViewer = ({
  className,
  files,
  loading = false,
  maxContentLength = defaultMaxContentLength,
  mode = "unified",
}: DiffViewerProps) => {
  const contentLength = files.reduce(
    (total, file) => total + file.oldContent.length + file.newContent.length,
    0,
  );
  const parsed = React.useMemo(() => {
    if (files.length === 0 || contentLength > maxContentLength) return [];

    try {
      return parseFiles(files);
    } catch {
      return [];
    }
  }, [contentLength, files, maxContentLength]);

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-subtle p-4",
          typography.bodyCompact,
          className,
        )}
      >
        Loading diff...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-subtle p-4 text-muted-foreground",
          typography.bodyCompact,
          className,
        )}
      >
        No changes.
      </div>
    );
  }

  if (contentLength > maxContentLength) {
    return (
      <div
        className={cn(
          "rounded-md border border-warning/40 bg-warning/10 p-4 text-warning-foreground",
          typography.bodyCompact,
          className,
        )}
      >
        Diff is too large to render.
      </div>
    );
  }

  if (parsed.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive",
          typography.bodyCompact,
          className,
        )}
      >
        Diff could not be rendered.
      </div>
    );
  }

  return (
    <div className={cn("grid gap-3 overflow-hidden rounded-md border border-border", className)}>
      {parsed.map((fileDiff) => (
        <PierreFileDiff
          disableWorkerPool
          fileDiff={fileDiff}
          key={fileDiff.cacheKey ?? `${fileDiff.prevName ?? fileDiff.name}:${fileDiff.name}`}
          options={{
            diffStyle: mode,
            overflow: "wrap",
            themeType: "system",
          }}
        />
      ))}
    </div>
  );
};
