import { Command, Flag } from "effect/unstable/cli";

export const optionalString = (name: string) => Flag.optional(Flag.string(name));
export const repeatedString = (name: string) => Flag.string(name).pipe(Flag.between(0, 100));

export const cycle = Command.make("cycle").pipe(
  Command.withSharedFlags({
    apiUrl: optionalString("api-url"),
    json: Flag.boolean("json"),
    requestId: optionalString("request-id"),
    token: optionalString("token"),
  }),
  Command.withDescription("Manage Cycle repositories, issues, comments, and automation checks."),
);
