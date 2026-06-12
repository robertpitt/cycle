import { Option } from "effect";
import { exitCodes } from "../services/CliRuntime.ts";
import { optionToUndefined } from "../services/command.ts";
import { cliFailure } from "../services/errors.ts";

export const issueUpdatePayload = (
  input: {
    readonly assignee: Option.Option<string>;
    readonly label: ReadonlyArray<string>;
    readonly message: Option.Option<string>;
    readonly priority: Option.Option<string>;
    readonly status: Option.Option<string>;
    readonly title: Option.Option<string>;
    readonly type: Option.Option<string>;
  },
  body: string | undefined,
): Record<string, unknown> => {
  const frontmatter = stripUndefined({
    assignee: optionToUndefined(input.assignee),
    labels: input.label.length === 0 ? undefined : input.label,
    priority: optionToUndefined(input.priority),
    status: optionToUndefined(input.status),
    title: optionToUndefined(input.title),
    type: optionToUndefined(input.type),
  });

  return stripUndefined({
    body,
    frontmatter: Object.keys(frontmatter).length === 0 ? undefined : frontmatter,
    message: optionToUndefined(input.message),
  });
};

export const automationEvaluatePayload = (input: {
  readonly failOnWarnings: boolean;
  readonly issueId: ReadonlyArray<string>;
  readonly label: ReadonlyArray<string>;
  readonly priority: Option.Option<string>;
  readonly q: Option.Option<string>;
  readonly requireFresh: boolean;
  readonly severityThreshold: Option.Option<string>;
  readonly status: Option.Option<string>;
}): Record<string, unknown> => {
  const base = stripUndefined({
    failOnWarnings: input.failOnWarnings ? true : undefined,
    requireFresh: input.requireFresh ? true : undefined,
    severityThreshold: severityThresholdFromOption(input.severityThreshold),
  });

  if (input.issueId.length > 0) {
    return {
      ...base,
      issueIds: input.issueId,
    };
  }

  const query = stripUndefined({
    labelIn: input.label.length === 0 ? undefined : input.label,
    priority: optionToUndefined(input.priority),
    status: optionToUndefined(input.status),
    text: optionToUndefined(input.q),
  });

  return Object.keys(query).length === 0
    ? base
    : {
        ...base,
        query,
      };
};

export const issueListQuery = (input: {
  readonly cursor: Option.Option<string>;
  readonly label: ReadonlyArray<string>;
  readonly limit: Option.Option<string>;
  readonly priority: Option.Option<string>;
  readonly q: Option.Option<string>;
  readonly sort: Option.Option<string>;
  readonly status: Option.Option<string>;
  readonly type: Option.Option<string>;
}): string => {
  const params = new URLSearchParams();

  setOptionalParam(params, "filter[priority]", input.priority);
  setOptionalParam(params, "filter[status]", input.status);
  setOptionalParam(params, "filter[type]", input.type);
  setOptionalParam(params, "q", input.q);
  setOptionalParam(params, "page[limit]", input.limit);
  setOptionalParam(params, "page[cursor]", input.cursor);
  setOptionalParam(params, "sort", input.sort);

  if (input.label.length > 0) {
    params.set("filter[label][in]", input.label.join(","));
  }

  const encoded = params.toString();
  return encoded.length === 0 ? "" : `?${encoded}`;
};

export const stripUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

const setOptionalParam = (
  params: URLSearchParams,
  key: string,
  value: Option.Option<string>,
): void => {
  if (Option.isSome(value)) params.set(key, value.value);
};

const severityThresholdFromOption = (
  option: Option.Option<string>,
): "error" | "fatal" | "warning" | undefined => {
  const value = optionToUndefined(option);
  if (value === undefined) return undefined;
  if (value === "error" || value === "fatal" || value === "warning") return value;

  throw cliFailure(
    exitCodes.invalidUsage,
    "INVALID_USAGE",
    "--severity-threshold must be warning, error, or fatal.",
  );
};
