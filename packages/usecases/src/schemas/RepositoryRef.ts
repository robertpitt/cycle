import { Schema } from "effect";

export class RepositoryRef extends Schema.Class<RepositoryRef>("@cycle/usecases/RepositoryRef")({
  id: Schema.String,
}) {}
