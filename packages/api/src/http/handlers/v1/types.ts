import type { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

type CycleHttpApiType = typeof import("../../CycleHttpApi.ts").CycleHttpApi;
type CycleHttpApiGroups =
  CycleHttpApiType extends HttpApi.HttpApi<string, infer Groups> ? Groups : never;
type V1Endpoints = HttpApiGroup.Endpoints<HttpApiGroup.WithName<CycleHttpApiGroups, "v1">>;
type V1HandlerRequest<Name extends V1EndpointName> = Parameters<
  HttpApiEndpoint.HandlerWithName<V1Endpoints, Name, never, never>
>[0];

export type V1EndpointName = HttpApiEndpoint.Name<V1Endpoints>;

export type V1Request<Name extends V1EndpointName> = Omit<
  V1HandlerRequest<Name>,
  "endpoint" | "group" | "headers"
>;
