import { Schema } from "effect";
import { UpdateSavedViewInput } from "./UpdateSavedViewInput.ts";

export const UpdateViewRequestInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Saved-view id to update." })),
  patch: UpdateSavedViewInput.pipe(Schema.annotateKey({ description: "Saved-view patch." })),
}).pipe(
  Schema.annotate({
    description: "Saved-view update request with id and patch grouped together.",
    identifier: "@cycle/contracts/UpdateViewRequestInput",
    title: "UpdateViewRequestInput",
  }),
);
export type UpdateViewRequestInput = typeof UpdateViewRequestInput.Type;
