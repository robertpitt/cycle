import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";
import {
  collectionResponse,
  errorResponse,
  requestIdFromHeaders,
  resourceResponse,
  urlFromRequest,
} from "../shared.ts";
import { launchAgentWorkJob } from "./agentWorkRunner.ts";

export const withAgentWorkHandlers = (handlers: any) =>
  handlers
    .handle("getAgentSettings", ({ request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const settings = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.getSettings(),
          "AGENT_SETTINGS_UNAVAILABLE",
          "Agent settings are unavailable.",
        );
        if (HttpServerResponse.isHttpServerResponse(settings)) return settings;

        return resourceResponse(requestId, 200, settings);
      }),
    )
    .handle("patchAgentSettings", ({ payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const settings = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.patchSettings(payload),
          "AGENT_SETTINGS_UPDATE_FAILED",
          "Agent settings could not be updated.",
        );
        if (HttpServerResponse.isHttpServerResponse(settings)) return settings;

        return resourceResponse(requestId, 200, settings);
      }),
    )
    .handle("getRepositoryAgentSettings", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const settings = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.getRepositorySettings(params.repositoryId),
          "REPOSITORY_AGENT_SETTINGS_UNAVAILABLE",
          "Repository agent settings are unavailable.",
        );
        if (HttpServerResponse.isHttpServerResponse(settings)) return settings;

        return resourceResponse(requestId, 200, settings);
      }),
    )
    .handle("patchRepositoryAgentSettings", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const settings = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.patchRepositorySettings(params.repositoryId, payload),
          "REPOSITORY_AGENT_SETTINGS_UPDATE_FAILED",
          "Repository agent settings could not be updated.",
        );
        if (HttpServerResponse.isHttpServerResponse(settings)) return settings;

        return resourceResponse(requestId, 200, settings);
      }),
    )
    .handle("getIssueAgentDelegate", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const delegate = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.getDelegate(params.repositoryId, params.issueId),
          "AGENT_DELEGATE_UNAVAILABLE",
          "Agent delegate is unavailable.",
        );
        if (HttpServerResponse.isHttpServerResponse(delegate)) return delegate;
        return resourceResponse(requestId, 200, delegate);
      }),
    )
    .handle("putIssueAgentDelegate", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const delegate = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.putDelegate(params.repositoryId, params.issueId, payload),
          "AGENT_DELEGATE_UPDATE_FAILED",
          "Agent delegate could not be updated.",
        );
        if (HttpServerResponse.isHttpServerResponse(delegate)) return delegate;

        return resourceResponse(requestId, 200, delegate);
      }),
    )
    .handle("deleteIssueAgentDelegate", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const current = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.getDelegate(params.repositoryId, params.issueId),
          "AGENT_DELEGATE_UNAVAILABLE",
          "Agent delegate is unavailable.",
        );
        if (HttpServerResponse.isHttpServerResponse(current)) return current;
        const deleted = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.deleteDelegate(params.repositoryId, params.issueId),
          "AGENT_DELEGATE_DELETE_FAILED",
          "Agent delegate could not be deleted.",
        );
        if (HttpServerResponse.isHttpServerResponse(deleted)) return deleted;

        return resourceResponse(requestId, 200, deleted ? current : null);
      }),
    )
    .handle("createIssueAgentDelegateJob", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const result = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.createDelegateJob(params.repositoryId, params.issueId, payload),
          "AGENT_DELEGATE_JOB_CREATE_FAILED",
          "Agent delegate job could not be created.",
        );
        if (HttpServerResponse.isHttpServerResponse(result)) return result;
        yield* Effect.sync(() =>
          launchAgentWorkJob({
            job: result.job,
            origin: urlFromRequest(request).origin,
            requestId,
            runtime,
          }),
        );

        return resourceResponse(requestId, 202, result);
      }),
    )
    .handle("listAgentJobs", ({ query, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const url = urlFromRequest(request);
        const jobs = yield* promiseOrError(
          requestId,
          () =>
            runtime.agentWork.listJobs({
              ...query,
              status: query.status ?? query["filter[status]"],
              ticketId: query.ticketId ?? query["filter[ticketId]"],
            }),
          "AGENT_JOBS_UNAVAILABLE",
          "Agent jobs are unavailable.",
        );
        if (HttpServerResponse.isHttpServerResponse(jobs)) return jobs;

        return collectionResponse(requestId, url, [...jobs], 100, null);
      }),
    )
    .handle("getAgentJob", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const job = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.getJob(params.jobId),
          "AGENT_JOB_UNAVAILABLE",
          "Agent job is unavailable.",
        );
        if (HttpServerResponse.isHttpServerResponse(job)) return job;
        if (job === null) return errorResponse(requestId, 404, "NOT_FOUND", "Agent job not found.");
        yield* Effect.sync(() =>
          launchAgentWorkJob({
            job,
            origin: urlFromRequest(request).origin,
            requestId,
            runtime,
          }),
        );

        return resourceResponse(requestId, 200, job);
      }),
    )
    .handle("getAgentJobLog", ({ params, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const log = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.getJobLog(params.jobId),
          "AGENT_JOB_LOG_UNAVAILABLE",
          "Agent job log is unavailable.",
        );
        if (HttpServerResponse.isHttpServerResponse(log)) return log;
        if (log === null) return errorResponse(requestId, 404, "NOT_FOUND", "Agent job not found.");

        return resourceResponse(requestId, 200, log);
      }),
    )
    .handle("resumeAgentJob", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const job = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.resumeJob(params.jobId, payload.requestedBy),
          "AGENT_JOB_RESUME_FAILED",
          "Agent job could not be resumed.",
        );
        if (HttpServerResponse.isHttpServerResponse(job)) return job;
        if (job === null) return errorResponse(requestId, 404, "NOT_FOUND", "Agent job not found.");
        yield* Effect.sync(() =>
          launchAgentWorkJob({
            job,
            origin: urlFromRequest(request).origin,
            requestId,
            runtime,
          }),
        );

        return resourceResponse(requestId, 200, job);
      }),
    )
    .handle("cancelAgentJob", ({ params, payload, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const job = yield* promiseOrError(
          requestId,
          () => runtime.agentWork.cancelJob(params.jobId, payload.reason, payload.requestedBy),
          "AGENT_JOB_CANCEL_FAILED",
          "Agent job could not be cancelled.",
        );
        if (HttpServerResponse.isHttpServerResponse(job)) return job;
        if (job === null) return errorResponse(requestId, 404, "NOT_FOUND", "Agent job not found.");

        return resourceResponse(requestId, 200, job);
      }),
    )
    .handle("listAgentActivity", ({ query, request }: any) =>
      Effect.gen(function* () {
        const requestId = yield* requestIdFromHeaders(request.headers);
        const runtime = yield* CycleApiRuntime;
        const url = urlFromRequest(request);
        const limit = query["page[limit]"] ?? 100;
        const events = yield* promiseOrError(
          requestId,
          () =>
            runtime.agentWork.listActivity({
              after: query.after,
              limit,
              repositoryId: query.repositoryId,
            }),
          "AGENT_ACTIVITY_UNAVAILABLE",
          "Agent activity is unavailable.",
        );
        if (HttpServerResponse.isHttpServerResponse(events)) return events;
        const nextCursor =
          events.length === limit ? String(events[events.length - 1]?.sequence) : null;

        return collectionResponse(requestId, url, [...events], limit, nextCursor);
      }),
    );

const promiseOrError = <A>(
  requestId: string,
  run: () => Promise<A>,
  code: string,
  message: string,
): Effect.Effect<A | HttpServerResponse.HttpServerResponse> =>
  Effect.tryPromise({
    try: run,
    catch: (error) =>
      errorResponse(requestId, 400, code, message, false, {
        cause: error instanceof Error ? error.message : String(error),
      }),
  }).pipe(Effect.catch((response) => Effect.succeed(response)));
