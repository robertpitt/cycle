import { Schema } from "effect";
import { PageFrontmatter } from "./PageFrontmatter.ts";

export const PageMarkdownDocument = Schema.Struct({
  body: Schema.String.pipe(Schema.annotateKey({ description: "Markdown Page body." })),
  bodyFormat: Schema.Literal("markdown").pipe(
    Schema.annotateKey({ description: "Page body format." }),
  ),
  frontmatter: PageFrontmatter.pipe(
    Schema.annotateKey({ description: "Canonical Page YAML frontmatter." }),
  ),
}).pipe(
  Schema.annotate({
    description: "A Page at the Markdown-with-YAML-frontmatter document boundary.",
    identifier: "@cycle/contracts/PageMarkdownDocument",
    title: "PageMarkdownDocument",
  }),
);
export type PageMarkdownDocument = typeof PageMarkdownDocument.Type;
