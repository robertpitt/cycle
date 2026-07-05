import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { CycleHttpApi, makeOpenApiDocument } from "../CycleHttpApi.ts";
import { CycleRequestContext } from "../middleware/CycleRequestContextMiddleware.ts";
import { CycleApiRuntime } from "../runtime/CycleApiRuntime.ts";
import { resourceResponse } from "./responses.ts";

const redocHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>Redoc CE</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
    <style>
      body {
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <redoc spec-url="/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`;

const openApiJsonResponse = (): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(makeOpenApiDocument());

export const SystemApiHandlers = HttpApiBuilder.group(
  CycleHttpApi,
  "system",
  Effect.fn(function* (handlers) {
    const runtime = yield* CycleApiRuntime;

    return handlers
      .handle("openApiViewer", () => Effect.succeed(HttpServerResponse.html(redocHtml)))
      .handle("openApiJson", () => Effect.succeed(openApiJsonResponse()))
      .handle("specJson", () => Effect.succeed(openApiJsonResponse()))
      .handle("health", () =>
        Effect.gen(function* () {
          const { requestId } = yield* CycleRequestContext;

          return resourceResponse(requestId, 200, {
            apiVersion: runtime.apiVersion,
            startedAt: runtime.startedAt,
            status: "ok",
          });
        }),
      );
  }),
);
