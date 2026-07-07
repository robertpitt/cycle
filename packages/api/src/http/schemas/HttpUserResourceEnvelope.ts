import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";
import {
  CollectionEnvelopeOf,
  CollectionPaginationQueryParams,
  OptionalBooleanStringParam,
  OptionalSearchParam,
  ResourceEnvelopeOf,
  strictSchema,
} from "./shared.ts";

export const HttpUserCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.UserProfileDocument);
export const HttpUserResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.UserProfileDocument);
export const UserPayload = strictSchema(
  Schema.Struct({
    aliases: Schema.optional(Schema.Array(Schema.String)),
    avatarUrl: Schema.optional(Schema.String),
    disabledAt: Schema.optional(Schema.NullOr(Schema.String)),
    displayName: Schema.String,
    email: Schema.optional(Schema.String),
    source: Schema.optional(Schema.Literals(["import", "local-profile", "manual"])),
    timezone: Schema.optional(Schema.String),
  }),
);
export const UserQueryParams = {
  "filter[disabled]": OptionalBooleanStringParam("Disabled-state filter for user profiles."),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
};
export const UserParams = { repositoryId: Schema.String, userId: Schema.String };
