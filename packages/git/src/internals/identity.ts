import type { Identity, IdentityInput } from "../schemas/index.ts";

const defaultIdentityName = "Cycle Git";
const defaultIdentityEmail = "git@example.invalid";

export const normalizeIdentity = (identity: IdentityInput | undefined, now: number): Identity => {
  const date =
    identity?.date instanceof Date
      ? identity.date.toISOString()
      : (identity?.date ?? new Date(now).toISOString());
  const timestamp = Number.isFinite(Date.parse(date)) ? Math.floor(Date.parse(date) / 1000) : 0;

  return {
    date,
    email: identity?.email ?? defaultIdentityEmail,
    name: identity?.name ?? defaultIdentityName,
    timestamp,
    timezone: "+0000",
  };
};

export const formatIdentity = (identity: Identity): string =>
  `${identity.name} <${identity.email}> ${identity.timestamp} ${identity.timezone}`;
