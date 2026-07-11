const unsafeObjectKeys = new Set(["__proto__", "constructor", "prototype"]);
const reservedPageFrontmatterKeys = new Set([
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

export const normalizeUnicode = (value: string): string => value.normalize("NFC");

const hasAsciiControl = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

const validSegments = (value: string): boolean =>
  value
    .split("/")
    .every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        Array.from(segment).length <= 256,
    );

const isSafeRelativePath = (value: string): boolean =>
  value.isWellFormed() &&
  !value.startsWith("/") &&
  !value.endsWith("/") &&
  !value.includes("\\") &&
  !hasAsciiControl(value) &&
  validSegments(value);

export const isPagePath = (value: string): boolean =>
  value.length > 3 && value.endsWith(".md") && isSafeRelativePath(value);

export const isPageDirectoryPath = (value: string): boolean =>
  value.length === 0 || isSafeRelativePath(value);

export const isSafeCycleIdentifier = (value: string): boolean =>
  value.length > 0 &&
  value.isWellFormed() &&
  Array.from(value).length <= 256 &&
  !value.includes("/") &&
  !value.includes("\\") &&
  !hasAsciiControl(value);

export const hasUnsafeObjectKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasUnsafeObjectKey);
  if (typeof value !== "object" || value === null) return false;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) return true;

  return Object.entries(value).some(
    ([key, child]) => unsafeObjectKeys.has(key) || hasUnsafeObjectKey(child),
  );
};

export const hasReservedPageFrontmatterKey = (value: Readonly<Record<string, unknown>>): boolean =>
  Object.keys(value).some((key) => reservedPageFrontmatterKeys.has(key));

export const isIsoDateTimeString = (value: string): boolean => {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (daysInMonth[month - 1] ?? 0) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  );
};

export const isUuidV7 = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
