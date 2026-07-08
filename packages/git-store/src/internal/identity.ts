import type { Identity } from "../GitStoreSchemas.ts";
import { identityLinePattern } from "./patterns.ts";

export const formatIdentity = (identity: Identity): string =>
  `${identity.name} <${identity.email}> ${identity.timestamp} ${identity.timezone}`;

export const parseIdentity = (raw: string): Identity | undefined => {
  const match = identityLinePattern.exec(raw);

  if (match === null) return undefined;

  const timestamp = Number.parseInt(match[3] ?? "0", 10);

  return {
    date: new Date(timestamp * 1000).toISOString(),
    email: match[2] ?? "",
    name: match[1] ?? "",
    timestamp,
    timezone: match[4] ?? "+0000",
  };
};
