import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { SystemApiGroup } from "./endpoints/system.ts";
import { V1ApiGroup } from "./endpoints/v1.ts";
import { CycleApiTracing } from "./middleware/CycleApiTracing.ts";
import { CycleRequestContextMiddleware } from "./middleware/CycleRequestContextMiddleware.ts";

export class CycleHttpApi extends HttpApi.make("cycle-api")
  .add(SystemApiGroup)
  .add(V1ApiGroup)
  .middleware(CycleApiTracing)
  .middleware(CycleRequestContextMiddleware)
  .annotateMerge(
    OpenApi.annotations({
      title: "Cycle Local API",
      version: "0.1.0",
    }),
  ) {}

export const makeOpenApiDocument = (): Readonly<Record<string, unknown>> =>
  OpenApi.fromApi(CycleHttpApi) as unknown as Readonly<Record<string, unknown>>;
