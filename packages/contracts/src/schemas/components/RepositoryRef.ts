import { Schema } from "effect";

export class RepositoryRef extends Schema.Class<RepositoryRef>("@cycle/contracts/RepositoryRef")(
  {
    id: Schema.String.pipe(
      Schema.annotateKey({ description: "Stable repository id used by Cycle APIs and usecases." }),
    ),
    path: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({
        description:
          "Filesystem path to the repository worktree or project root when the caller has local path context.",
      }),
    ),
  },
  {
    description:
      "A repository reference carried by scoped requests. The id is stable; path is optional because many API/usecase calls only need repository identity.",
    title: "RepositoryRef",
  },
) {}
