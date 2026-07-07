import { makeSqliteLayer, type SqliteLayerOptions } from "../SqliteLive.ts";

export const makeInMemorySqliteLayer = <R = never>(
  options: Omit<SqliteLayerOptions<R>, "createParentDirectory" | "filename"> = {},
) =>
  makeSqliteLayer({
    ...options,
    createParentDirectory: false,
    filename: ":memory:",
  });
