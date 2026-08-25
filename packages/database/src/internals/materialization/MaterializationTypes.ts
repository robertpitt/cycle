import type { ProjectionCatalogStoreShape } from "../projection/ProjectionCatalogStore.ts";
import type { ProjectionPageStoreShape } from "../projection/ProjectionPageStore.ts";
import type { ProjectionRepositoryStoreShape } from "../projection/ProjectionRepositoryStore.ts";
import type { ProjectionTicketStoreShape } from "../projection/ProjectionTicketStore.ts";

export type MaterializationProjectionReader = {
  readonly catalog: Pick<ProjectionCatalogStoreShape, "usersByRecipientLookupKeys">;
  readonly pages: Pick<ProjectionPageStoreShape, "getPage">;
  readonly repositories: Pick<ProjectionRepositoryStoreShape, "maxCommitSequence" | "status">;
  readonly tickets: Pick<ProjectionTicketStoreShape, "getTicket">;
};
