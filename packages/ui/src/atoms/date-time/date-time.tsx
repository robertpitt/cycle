import * as React from "react";
import { cn } from "../../lib/cn.ts";

export type DateTimeFormat =
  | "compactDate"
  | "compactDateTime"
  | "date"
  | "datetime"
  | "iso"
  | "relative"
  | "time";

export type DateTimeValue = Date | string | null | undefined;

export type DateTimeProps = Omit<
  React.TimeHTMLAttributes<HTMLTimeElement>,
  "children" | "dateTime"
> & {
  readonly dateStyle?: Intl.DateTimeFormatOptions["dateStyle"];
  readonly fallback?: React.ReactNode;
  readonly format?: DateTimeFormat;
  readonly locale?: Intl.LocalesArgument;
  readonly relativeBase?: Date | string;
  readonly timeStyle?: Intl.DateTimeFormatOptions["timeStyle"];
  readonly timeZone?: string;
  readonly value: DateTimeValue;
};

const parseDate = (value: DateTimeValue): Date | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim().length === 0) return undefined;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const formatRelative = (
  date: Date,
  {
    locale,
    relativeBase,
  }: {
    readonly locale?: Intl.LocalesArgument;
    readonly relativeBase?: Date | string;
  },
): string => {
  const base = parseDate(relativeBase) ?? new Date();
  const diffSeconds = Math.round((date.getTime() - base.getTime()) / 1000);
  const units = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ] as const;
  const [unit, seconds] =
    units.find(([, unitSeconds]) => Math.abs(diffSeconds) >= unitSeconds) ?? units.at(-1)!;

  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    Math.round(diffSeconds / seconds),
    unit,
  );
};

const presetOptions = (
  format: Exclude<DateTimeFormat, "iso" | "relative">,
  dateStyle?: Intl.DateTimeFormatOptions["dateStyle"],
  timeStyle?: Intl.DateTimeFormatOptions["timeStyle"],
): Intl.DateTimeFormatOptions => {
  switch (format) {
    case "compactDate":
      return {
        day: "numeric",
        month: "short",
      };
    case "compactDateTime":
      return {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
      };
    case "date":
      return {
        dateStyle: dateStyle ?? "medium",
      };
    case "datetime":
      return {
        dateStyle: dateStyle ?? "medium",
        timeStyle: timeStyle ?? "short",
      };
    case "time":
      return {
        timeStyle: timeStyle ?? "short",
      };
  }
};

const formatDateTime = (
  date: Date,
  {
    dateStyle,
    format,
    locale,
    relativeBase,
    timeStyle,
    timeZone,
  }: Pick<
    DateTimeProps,
    "dateStyle" | "format" | "locale" | "relativeBase" | "timeStyle" | "timeZone"
  >,
): string | undefined => {
  try {
    if (format === "iso") return date.toISOString();
    if (format === "relative") return formatRelative(date, { locale, relativeBase });

    return new Intl.DateTimeFormat(locale, {
      ...presetOptions(format ?? "datetime", dateStyle, timeStyle),
      timeZone,
    }).format(date);
  } catch {
    return undefined;
  }
};

export const DateTime = React.forwardRef<HTMLTimeElement, DateTimeProps>(function DateTime(
  {
    className,
    dateStyle,
    fallback = "--",
    format = "datetime",
    locale,
    relativeBase,
    timeStyle,
    timeZone,
    value,
    ...props
  },
  ref,
) {
  const date = parseDate(value);
  const formatted =
    date === undefined
      ? undefined
      : formatDateTime(date, { dateStyle, format, locale, relativeBase, timeStyle, timeZone });

  if (date === undefined || formatted === undefined) {
    return fallback === null || fallback === undefined ? null : (
      <span className={className}>{fallback}</span>
    );
  }

  return (
    <time {...props} ref={ref} className={cn(className)} dateTime={date.toISOString()}>
      {formatted}
    </time>
  );
});
