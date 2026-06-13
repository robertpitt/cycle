const utf8Encoder = new TextEncoder();

export const bytesFromString = (value: string): Uint8Array => utf8Encoder.encode(value);

export const bytesToString = (bytes: Uint8Array, encoding = "utf-8"): string =>
  new TextDecoder(encoding).decode(bytes);
