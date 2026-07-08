export const readableBytes = async function* (
  stream: NodeJS.ReadableStream,
): AsyncIterable<Uint8Array> {
  for await (const chunk of stream) {
    if (typeof chunk === "string") yield Buffer.from(chunk);
    else yield chunk as Uint8Array;
  }
};

export const readStderrLines = async (
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
): Promise<void> => {
  const decoder = new TextDecoder();
  let remainder = "";

  for await (const chunk of stream) {
    const text =
      typeof chunk === "string" ? chunk : decoder.decode(chunk as Uint8Array, { stream: true });
    const lines = (remainder + text).split("\n");
    remainder = lines.pop() ?? "";
    for (const line of lines) onLine(line.replace(/\r$/u, ""));
  }

  const finalLine = remainder + decoder.decode();
  if (finalLine.trim().length > 0) onLine(finalLine.replace(/\r$/u, ""));
};
