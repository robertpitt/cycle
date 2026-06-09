import { Schema } from "effect";

export class RepositoryRef extends Schema.Class<RepositoryRef>("@cycle/rpc/RepositoryRef")({
  id: Schema.String,
}) {}
