import { Schema } from "effect";
import { SyncPointer } from "./SyncPointer.ts";

export const SyncResult = Schema.Struct({
  pointers: Schema.Array(SyncPointer).pipe(
    Schema.annotateKey({ description: "Per-pointer synchronization results." }),
  ),
  remote: Schema.String.pipe(
    Schema.annotateKey({ description: "Remote name or URL used for synchronization." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Result of pushing or synchronizing GitDB refs with a remote.",
    identifier: "@cycle/contracts/SyncResult",
    title: "SyncResult",
  }),
);
export type SyncResult = typeof SyncResult.Type;
