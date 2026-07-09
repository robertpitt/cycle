import type * as React from "react";

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

export const componentAppearances = ["soft", "solid", "outline"] as const;

export type ComponentAppearance = (typeof componentAppearances)[number];

export const componentActionVariants = [
  "primary",
  "secondary",
  "outline",
  "ghost",
  "link",
] as const;

export type ComponentActionVariant = (typeof componentActionVariants)[number];

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

export const isAriaInvalid = (value: React.AriaAttributes["aria-invalid"]): boolean =>
  value !== undefined && value !== false && value !== "false";
