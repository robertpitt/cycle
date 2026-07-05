import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export const ApiErrorEnvelope = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    // Error details preserve redacted adapter/usecase diagnostics as extension data.
    details: Schema.Record(Schema.String, Schema.Unknown),
    message: Schema.String,
    requestId: Schema.String,
    retryable: Schema.Boolean,
  }),
});
export type ApiErrorEnvelope = typeof ApiErrorEnvelope.Type;

export const ApiBadRequestErrorEnvelope = ApiErrorEnvelope.pipe(HttpApiSchema.status("BadRequest"));
export const ApiUnauthorizedErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("Unauthorized"),
);
export const ApiForbiddenErrorEnvelope = ApiErrorEnvelope.pipe(HttpApiSchema.status("Forbidden"));
export const ApiNotFoundErrorEnvelope = ApiErrorEnvelope.pipe(HttpApiSchema.status("NotFound"));
export const ApiConflictErrorEnvelope = ApiErrorEnvelope.pipe(HttpApiSchema.status("Conflict"));
export const ApiUnprocessableEntityErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("UnprocessableEntity"),
);
export const ApiInternalServerErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("InternalServerError"),
);
export const ApiNotImplementedErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("NotImplemented"),
);
export const ApiServiceUnavailableErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("ServiceUnavailable"),
);
export const ApiGatewayTimeoutErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("GatewayTimeout"),
);
export const ApiErrorEnvelopes = [
  ApiBadRequestErrorEnvelope,
  ApiUnauthorizedErrorEnvelope,
  ApiForbiddenErrorEnvelope,
  ApiNotFoundErrorEnvelope,
  ApiConflictErrorEnvelope,
  ApiUnprocessableEntityErrorEnvelope,
  ApiInternalServerErrorEnvelope,
  ApiNotImplementedErrorEnvelope,
  ApiServiceUnavailableErrorEnvelope,
  ApiGatewayTimeoutErrorEnvelope,
] as const;
