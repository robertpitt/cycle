export const componentTones = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
  "accent",
] as const;

export type ComponentTone = (typeof componentTones)[number];

export const componentDensities = ["compact", "comfortable"] as const;

export type ComponentDensity = (typeof componentDensities)[number];

export const componentSizes = ["sm", "md", "lg"] as const;

export type ComponentSize = (typeof componentSizes)[number];

export type LegacySemanticVariant = "destructive" | "neutral" | "primary" | "success" | "warning";

export const normalizeTone = (
  tone?: ComponentTone | LegacySemanticVariant | null,
): ComponentTone | undefined => {
  if (!tone) {
    return undefined;
  }

  if (tone === "destructive") {
    return "danger";
  }

  if (tone === "primary") {
    return "info";
  }

  return tone;
};

export const mergeIds = (...ids: readonly (string | undefined)[]) =>
  ids.filter(Boolean).join(" ") || undefined;
