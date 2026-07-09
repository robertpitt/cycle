export const normalizeOtpLength = (length: number): number =>
  Number.isFinite(length) ? Math.max(1, Math.floor(length)) : 1;

export const normalizeOtpValue = (value: string, length: number): string =>
  value.replace(/\D/g, "").slice(0, normalizeOtpLength(length));

export const replaceOtpDigit = (
  value: string,
  index: number,
  input: string,
  length: number,
): string => {
  const resolvedLength = normalizeOtpLength(length);
  const chars = normalizeOtpValue(value, resolvedLength).split("");
  const digits = normalizeOtpValue(input, resolvedLength);

  if (digits.length === 0) {
    chars.splice(index, 1);
    return chars.join("");
  }

  chars[index] = digits.at(-1)!;
  return chars.join("");
};

export const pasteOtpDigits = (
  value: string,
  index: number,
  input: string,
  length: number,
): string => {
  const resolvedLength = normalizeOtpLength(length);
  const chars = normalizeOtpValue(value, resolvedLength).split("");
  const digits = normalizeOtpValue(input, resolvedLength - index).split("");

  digits.forEach((digit, offset) => {
    chars[index + offset] = digit;
  });

  return chars.join("").slice(0, resolvedLength);
};

export const removeOtpDigit = (value: string, index: number, length: number): string => {
  const chars = normalizeOtpValue(value, length).split("");
  chars.splice(index, 1);
  return chars.join("");
};
