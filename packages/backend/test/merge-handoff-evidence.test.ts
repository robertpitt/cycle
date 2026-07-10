import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { mergeHandoffEvidenceFromSummary } from "../src/internal/merge-handoff-evidence.ts";

describe("merge handoff evidence", () => {
  it("extracts tests, artifacts, and limitations from common completion headings", () => {
    const evidence = mergeHandoffEvidenceFromSummary(
      [
        "**Tests**",
        "- `pnpm test` — 12 passed",
        "Artifacts:",
        "- artifacts/screenshot.png",
        "## Known limitations",
        "- Manual browser validation remains.",
      ].join("\n"),
    );

    assert.deepEqual(evidence.tests, [
      { command: "pnpm test", result: "`pnpm test` — 12 passed", status: "passed" },
    ]);
    assert.deepEqual(evidence.artifacts, ["artifacts/screenshot.png"]);
    assert.deepEqual(evidence.knownLimitations, ["Manual browser validation remains."]);
  });

  it("preserves failed and not-run test outcomes", () => {
    const evidence = mergeHandoffEvidenceFromSummary(
      [
        "### Validation",
        "- `pnpm lint` failed with one error",
        "- Browser smoke test not run",
      ].join("\n"),
    );

    assert.deepEqual(
      evidence.tests.map((test) => test.status),
      ["failed", "not_run"],
    );
  });
});
