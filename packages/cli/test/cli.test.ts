import { strict as assert } from "node:assert";
import { Readable } from "node:stream";
import { describe, it } from "vitest";
import { runCycleCli, type CliIo } from "../src/index.ts";

const makeIo = (
  fetchImpl: typeof fetch,
): CliIo & { stderrText: () => string; stdoutText: () => string } => {
  let stdout = "";
  let stderr = "";

  return {
    cwd: "/tmp",
    env: {
      CYCLE_API_TOKEN: "token",
      CYCLE_API_URL: "http://cycle.test",
    },
    fetch: fetchImpl,
    stderr: {
      write: (chunk: string | Uint8Array) => {
        stderr += String(chunk);
        return true;
      },
    },
    stderrText: () => stderr,
    stdin: Readable.from([]) as NodeJS.ReadStream,
    stdout: {
      write: (chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      },
    },
    stdoutText: () => stdout,
  };
};

describe("@cycle/cli", () => {
  it("runs the status command through effect/unstable/cli", async () => {
    const io = makeIo(async (request, init) => {
      const requestObject = request instanceof Request ? request : new Request(request, init);

      assert.equal(String(requestObject.url), "http://cycle.test/v1/status");
      assert.equal(requestObject.headers.get("authorization"), "Bearer token");

      return Response.json({
        data: {
          status: "ok",
        },
        meta: {
          requestId: "req_cli",
        },
      });
    });

    const exitCode = await runCycleCli(["--json", "status"], io);

    assert.equal(exitCode, 0);
    assert.equal(io.stderrText(), "");
    const output = JSON.parse(io.stdoutText()) as { data?: { status?: string } };
    assert.equal(output.data?.status, "ok");
  });

  it("maps API authentication failures to exit code 3", async () => {
    const io = makeIo(async () =>
      Response.json(
        {
          error: {
            code: "UNAUTHORIZED",
            details: {},
            message: "Missing or invalid API credentials.",
            requestId: "req_cli",
            retryable: false,
          },
        },
        { status: 401 },
      ),
    );

    const exitCode = await runCycleCli(["--json", "status"], io);

    assert.equal(exitCode, 3);
    const output = JSON.parse(io.stderrText()) as { error?: { code?: string } };
    assert.equal(output.error?.code, "UNAUTHORIZED");
  });

  it("sends issue transition commands to the REST API", async () => {
    const requests: Array<{ body?: unknown; method: string; url: string }> = [];
    const io = makeIo(async (request, init) => {
      const requestObject = request instanceof Request ? request : new Request(request, init);
      const text = await requestObject.text();
      const body = text.length === 0 ? undefined : JSON.parse(text);
      requests.push({
        ...(body === undefined ? {} : { body }),
        method: requestObject.method,
        url: String(requestObject.url),
      });

      if (requestObject.method === "GET") {
        return Response.json({
          data: {
            repositoryId: "repo-1",
          },
        });
      }

      return Response.json({
        data: {
          id: "ISSUE-1",
          status: "done",
          title: "Finished",
        },
        meta: {
          requestId: "req_transition",
        },
      });
    });

    const exitCode = await runCycleCli(
      [
        "--json",
        "issue",
        "transition",
        "--repository",
        "repo-1",
        "--issue-id",
        "ISSUE-1",
        "--status",
        "done",
      ],
      io,
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(requests, [
      {
        method: "GET",
        url: "http://cycle.test/v1/repositories/repo-1",
      },
      {
        body: {
          status: "done",
        },
        method: "POST",
        url: "http://cycle.test/v1/repositories/repo-1/issues/ISSUE-1/transitions",
      },
    ]);
    const output = JSON.parse(io.stdoutText()) as { data?: { status?: string } };
    assert.equal(output.data?.status, "done");
  });
});
