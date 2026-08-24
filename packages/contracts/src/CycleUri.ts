import { Result, Schema } from "effect";
import { isSafeCycleIdentifier } from "./internal/pageValidation.ts";
import { PageId } from "./schemas/components/PageId.ts";

const CycleIdentifier = Schema.String.check(
  Schema.makeFilter<string>(
    (value) => isSafeCycleIdentifier(value) || "a safe Cycle URI identifier",
  ),
);

export const CycleUriTarget = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("repository"),
    repositoryId: CycleIdentifier,
  }),
  Schema.Struct({
    kind: Schema.Literal("ticket"),
    repositoryId: CycleIdentifier,
    ticketId: CycleIdentifier,
  }),
  Schema.Struct({
    kind: Schema.Literal("page"),
    pageId: PageId,
    repositoryId: CycleIdentifier,
  }),
]).pipe(
  Schema.annotate({
    description: "A canonical repository, ticket, or Page cycle:// navigation target.",
    identifier: "@cycle/contracts/CycleUriTarget",
    title: "CycleUriTarget",
  }),
);
export type CycleUriTarget = typeof CycleUriTarget.Type;

export class MalformedCycleUri extends Schema.TaggedErrorClass<MalformedCycleUri>(
  "@cycle/contracts/MalformedCycleUri",
)("MalformedCycleUri", {
  input: Schema.String,
  message: Schema.String,
  reason: Schema.String,
}) {}

export class UnsupportedCycleUriTarget extends Schema.TaggedErrorClass<UnsupportedCycleUriTarget>(
  "@cycle/contracts/UnsupportedCycleUriTarget",
)("UnsupportedCycleUriTarget", {
  input: Schema.String,
  message: Schema.String,
  targetKind: Schema.String,
}) {}

export type CycleUriParseError = MalformedCycleUri | UnsupportedCycleUriTarget;
export type CycleUriParseResult = Result.Result<CycleUriTarget, CycleUriParseError>;

export type LegacyCycleReferenceTarget =
  | { readonly agentId: string; readonly kind: "agent" }
  | { readonly commitId: string; readonly kind: "commit"; readonly repositoryId?: string }
  | { readonly kind: "issue"; readonly repositoryId?: string; readonly ticketId: string }
  | { readonly kind: "user"; readonly userId: string };

export type CycleReferenceTarget = CycleUriTarget | LegacyCycleReferenceTarget;
export type CycleReferenceParseResult = Result.Result<CycleReferenceTarget, CycleUriParseError>;

const malformed = (input: string, reason: string): Result.Result<never, MalformedCycleUri> =>
  Result.fail(
    new MalformedCycleUri({
      input,
      message: "Malformed Cycle resource URI.",
      reason,
    }),
  );

const unsupported = (
  input: string,
  targetKind: string,
): Result.Result<never, UnsupportedCycleUriTarget> =>
  Result.fail(
    new UnsupportedCycleUriTarget({
      input,
      message: "Unsupported Cycle resource target.",
      targetKind,
    }),
  );

const decodeIdentifier = (
  input: string,
  encoded: string,
): Result.Result<string, MalformedCycleUri> => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return malformed(input, "invalid-percent-encoding");
  }

  return isSafeCycleIdentifier(decoded)
    ? Result.succeed(decoded)
    : malformed(input, "unsafe-identifier");
};

const decodeLegacyIdentifier = (
  input: string,
  raw: string,
  allowSlash = false,
): Result.Result<string, MalformedCycleUri> => {
  const identifier = raw.trim();
  const validationValue = allowSlash ? identifier.replaceAll("/", "-") : identifier;
  return isSafeCycleIdentifier(validationValue)
    ? Result.succeed(identifier)
    : malformed(input, "unsafe-legacy-identifier");
};

export const parseCycleUri = (input: string): CycleUriParseResult => {
  if (!input.startsWith("cycle:")) return malformed(input, "wrong-scheme");
  if (input.includes("?") || input.includes("#")) {
    return malformed(input, "query-or-fragment-not-supported");
  }

  const match = /^cycle:\/\/([^/]+)(?:\/(.*))?$/u.exec(input);
  if (match === null) return malformed(input, "non-hierarchical-form");

  const authority = match[1] ?? "";
  if (authority.includes("@") || authority.includes(":")) {
    return malformed(input, "credentials-or-port-not-supported");
  }
  if (authority !== "repository") return unsupported(input, authority);

  const rawPath = match[2];
  if (rawPath === undefined || rawPath.length === 0) {
    return malformed(input, "missing-repository-id");
  }

  const segments = rawPath.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    return malformed(input, "empty-path-segment");
  }
  if (segments.length !== 1 && segments.length !== 3) {
    return malformed(input, "unexpected-path-segments");
  }

  const repositoryResult = decodeIdentifier(input, segments[0] ?? "");
  if (Result.isFailure(repositoryResult)) return Result.fail(repositoryResult.failure);
  const repositoryId = repositoryResult.success;

  if (segments.length === 1) {
    return Result.succeed({ kind: "repository", repositoryId });
  }

  const resourceKind = segments[1] ?? "";
  if (resourceKind !== "tickets" && resourceKind !== "pages") {
    return unsupported(input, resourceKind);
  }

  const resourceResult = decodeIdentifier(input, segments[2] ?? "");
  if (Result.isFailure(resourceResult)) return Result.fail(resourceResult.failure);

  if (resourceKind === "tickets") {
    return Result.succeed({
      kind: "ticket",
      repositoryId,
      ticketId: resourceResult.success,
    });
  }

  const pageIdResult = Schema.decodeUnknownResult(PageId)(resourceResult.success);
  return Result.isFailure(pageIdResult)
    ? malformed(input, "invalid-page-id")
    : Result.succeed({ kind: "page", pageId: pageIdResult.success, repositoryId });
};

export const serializeCycleUri = (
  target: CycleUriTarget,
): Result.Result<string, MalformedCycleUri> => {
  const decoded = Schema.decodeUnknownResult(CycleUriTarget)(target);
  if (Result.isFailure(decoded)) return malformed(String(target), "invalid-target");

  try {
    const repository = encodeURIComponent(decoded.success.repositoryId);
    switch (decoded.success.kind) {
      case "repository":
        return Result.succeed(`cycle://repository/${repository}`);
      case "ticket":
        return Result.succeed(
          `cycle://repository/${repository}/tickets/${encodeURIComponent(decoded.success.ticketId)}`,
        );
      case "page":
        return Result.succeed(
          `cycle://repository/${repository}/pages/${encodeURIComponent(decoded.success.pageId)}`,
        );
    }
  } catch {
    return malformed(String(target), "identifier-encoding-failed");
  }
};

const legacySchemes = [
  ["cycle-agent:", "agent"],
  ["cycle-commit:", "commit"],
  ["cycle-issue:", "issue"],
  ["cycle-repository:", "repository"],
  ["cycle-user:", "user"],
] as const;

export const parseCycleReference = (
  input: string,
  context: { readonly repositoryId?: string } = {},
): CycleReferenceParseResult => {
  if (input.startsWith("cycle://")) return parseCycleUri(input);

  for (const [scheme, kind] of legacySchemes) {
    if (!input.startsWith(scheme)) continue;

    const identifierResult = decodeLegacyIdentifier(
      input,
      input.slice(scheme.length),
      kind === "repository",
    );
    if (Result.isFailure(identifierResult)) return Result.fail(identifierResult.failure);
    const resourceId = identifierResult.success;

    let repositoryContext: string | undefined;
    if (context.repositoryId !== undefined) {
      const contextResult = decodeLegacyIdentifier(input, context.repositoryId, true);
      if (Result.isFailure(contextResult)) return Result.fail(contextResult.failure);
      repositoryContext = contextResult.success;
    }

    switch (kind) {
      case "repository":
        return Result.succeed({ kind: "repository", repositoryId: resourceId });
      case "issue":
        return repositoryContext === undefined
          ? Result.succeed({ kind: "issue", ticketId: resourceId })
          : Result.succeed({
              kind: "ticket",
              repositoryId: repositoryContext,
              ticketId: resourceId,
            });
      case "commit":
        return Result.succeed({
          commitId: resourceId,
          kind: "commit",
          ...(repositoryContext === undefined ? {} : { repositoryId: repositoryContext }),
        });
      case "agent":
        return Result.succeed({ agentId: resourceId, kind: "agent" });
      case "user":
        return Result.succeed({ kind: "user", userId: resourceId });
    }
  }

  const unknownLegacy = /^cycle-([^:]+):/u.exec(input);
  return unknownLegacy === null
    ? malformed(input, "unsupported-reference-scheme")
    : unsupported(input, unknownLegacy[1] ?? "unknown");
};
