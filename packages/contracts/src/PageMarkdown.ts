import { Effect, Schema } from "effect";
import { isScalar, parseDocument, stringify, visit } from "yaml";
import { hasUnsafeObjectKey } from "./internal/pageValidation.ts";
import type { Actor } from "./schemas/components/Actor.ts";
import { PageFrontmatter } from "./schemas/entities/PageFrontmatter.ts";
import {
  PageMarkdownDocument,
  type PageMarkdownDocument as PageMarkdownDocumentType,
} from "./schemas/entities/PageMarkdownDocument.ts";

export class PageMarkdownError extends Schema.TaggedErrorClass<PageMarkdownError>(
  "@cycle/contracts/PageMarkdownError",
)("PageMarkdownError", {
  message: Schema.String,
  reason: Schema.Literals([
    "aliases-not-supported",
    "invalid-document",
    "invalid-frontmatter",
    "invalid-yaml",
    "missing-frontmatter",
    "serialization-failed",
    "tags-not-supported",
    "unsafe-key",
  ]),
}) {}

const knownFrontmatterKeys = new Set([
  "archivedAt",
  "archivedBy",
  "createdAt",
  "createdBy",
  "id",
  "schemaVersion",
  "title",
  "updatedAt",
  "updatedBy",
]);

const normalizeLineEndings = (value: string): string => value.replace(/\r\n?/gu, "\n");

const markdownError = (reason: PageMarkdownError["reason"], message: string): PageMarkdownError =>
  new PageMarkdownError({ message, reason });

const splitMarkdown = (
  source: string,
): Effect.Effect<{ readonly body: string; readonly yaml: string }, PageMarkdownError> => {
  const normalized = normalizeLineEndings(source);
  if (!normalized.startsWith("---\n")) {
    return Effect.fail(
      markdownError("missing-frontmatter", "Page Markdown must start with YAML frontmatter."),
    );
  }

  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) {
    return Effect.fail(
      markdownError("missing-frontmatter", "Page Markdown frontmatter is not closed."),
    );
  }

  const yaml = normalized.slice(4, closing);
  const remainder = normalized.slice(closing + 5);
  return Effect.succeed({
    body: remainder.startsWith("\n") ? remainder.slice(1) : remainder,
    yaml,
  });
};

const parseYaml = (source: string): Effect.Effect<unknown, PageMarkdownError> =>
  Effect.try({
    try: () => {
      const document = parseDocument(source, {
        customTags: [],
        merge: false,
        prettyErrors: false,
        resolveKnownTags: false,
        schema: "core",
        strict: true,
        stringKeys: true,
        uniqueKeys: true,
        version: "1.2",
      });

      if (document.errors.length > 0) {
        throw markdownError("invalid-yaml", "Page frontmatter is not valid strict YAML.");
      }

      let hasAlias = false;
      let hasExplicitTag = false;
      let hasUnsafeKey = false;
      visit(document, {
        Alias: () => {
          hasAlias = true;
          return visit.BREAK;
        },
        Node: (_key, node) => {
          if (node.tag !== undefined) hasExplicitTag = true;
        },
        Pair: (_key, pair) => {
          if (
            isScalar(pair.key) &&
            typeof pair.key.value === "string" &&
            ["__proto__", "constructor", "prototype"].includes(pair.key.value)
          ) {
            hasUnsafeKey = true;
            return visit.BREAK;
          }
        },
      });

      if (hasAlias) {
        throw markdownError("aliases-not-supported", "Page frontmatter aliases are not supported.");
      }
      if (hasExplicitTag) {
        throw markdownError(
          "tags-not-supported",
          "Explicit Page frontmatter tags are not supported.",
        );
      }
      if (hasUnsafeKey) {
        throw markdownError("unsafe-key", "Page frontmatter contains an unsafe object key.");
      }

      const value = document.toJS({ maxAliasCount: 0 });
      if (hasUnsafeObjectKey(value)) {
        throw markdownError("unsafe-key", "Page frontmatter contains an unsafe object key.");
      }
      return value;
    },
    catch: (error) =>
      error instanceof PageMarkdownError
        ? error
        : markdownError("invalid-yaml", "Page frontmatter is not valid strict YAML."),
  });

export const parsePageMarkdown = Effect.fn("parsePageMarkdown")(function* (source: string) {
  const parts = yield* splitMarkdown(source);
  const rawFrontmatter = yield* parseYaml(parts.yaml);
  const frontmatter = yield* Schema.decodeUnknownEffect(PageFrontmatter)(rawFrontmatter).pipe(
    Effect.mapError(() =>
      markdownError("invalid-frontmatter", "Page frontmatter does not satisfy the Page schema."),
    ),
  );

  return PageMarkdownDocument.make({
    body: parts.body,
    bodyFormat: "markdown",
    frontmatter,
  });
});

const canonicalActor = (actor: Actor): Readonly<Record<string, unknown>> => ({
  name: actor.name,
  type: actor.type,
  ...(actor.email === undefined ? {} : { email: actor.email }),
  ...(actor.provider === undefined ? {} : { provider: actor.provider }),
});

const canonicalJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [key, canonicalJson(child)]),
  );
};

const canonicalFrontmatter = (
  frontmatter: typeof PageFrontmatter.Type,
): Readonly<Record<string, unknown>> => {
  const extensionEntries = Object.entries(frontmatter)
    .filter(([key]) => !knownFrontmatterKeys.has(key))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => [key, canonicalJson(value)] as const);

  return {
    id: frontmatter.id,
    title: frontmatter.title,
    schemaVersion: frontmatter.schemaVersion,
    createdAt: frontmatter.createdAt,
    createdBy: canonicalActor(frontmatter.createdBy),
    updatedAt: frontmatter.updatedAt,
    updatedBy: canonicalActor(frontmatter.updatedBy),
    ...(frontmatter.archivedAt === undefined ? {} : { archivedAt: frontmatter.archivedAt }),
    ...(frontmatter.archivedBy === undefined
      ? {}
      : { archivedBy: canonicalActor(frontmatter.archivedBy) }),
    ...Object.fromEntries(extensionEntries),
  };
};

export const serializePageMarkdown = Effect.fn("serializePageMarkdown")(function* (
  input: PageMarkdownDocumentType,
) {
  const document = yield* Schema.decodeUnknownEffect(PageMarkdownDocument)(input).pipe(
    Effect.mapError(() =>
      markdownError("invalid-document", "Page Markdown document does not satisfy the schema."),
    ),
  );

  const yaml = yield* Effect.try({
    try: () =>
      stringify(canonicalFrontmatter(document.frontmatter), {
        aliasDuplicateObjects: false,
        lineWidth: 0,
        schema: "core",
        sortMapEntries: false,
        version: "1.2",
      }).trimEnd(),
    catch: () => markdownError("serialization-failed", "Page frontmatter could not be serialized."),
  });

  return `---\n${yaml}\n---\n\n${normalizeLineEndings(document.body)}`;
});
