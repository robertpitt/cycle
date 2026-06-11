import { Schema } from "effect";

export class RepositoryRef extends Schema.Class<RepositoryRef>("@cycle/contracts/RepositoryRef")({
  id: Schema.String,
}) {}
