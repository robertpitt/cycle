export const focusRing =
  "outline-none transition focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

export const disabledControl =
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45";

export const typography = {
  body: "text-base leading-7 tracking-normal",
  bodyCompact: "text-sm leading-6 tracking-normal",
  control: "text-sm font-medium leading-5 tracking-normal",
  meta: "text-xs font-medium leading-4 tracking-normal",
  pageTitle: "text-2xl font-semibold leading-8 tracking-normal",
  panelTitle: "text-sm font-semibold leading-5 tracking-normal",
  sectionTitle: "text-base font-semibold leading-6 tracking-normal",
} as const;
