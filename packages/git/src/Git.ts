import { Context } from "effect";
import type { GitError, GitTransportError } from "./GitErrors.ts";
import type { GitCommandsShape } from "./GitCommands.ts";

export type GitService = GitCommandsShape;
export type GitShape = GitCommandsShape;

export class Git extends Context.Service<Git, GitService>()("@cycle/git/Git") {}

export type { GitError, GitTransportError };
