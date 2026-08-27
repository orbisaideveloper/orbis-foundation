// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runWorker } = require("../ai/foundation-file-capability-worker.cjs");

function createWorkerContext(executeFileOperation) {
  return {
    executeFileOperation,
    parentPort: { postMessage: vi.fn() },
    workerData: {
      capabilityId: "termux.file.read",
      input: { path: "README.md" },
    },
  };
}

describe("foundation file capability worker", () => {
  it("returns a successful worker result", async () => {
    const context = createWorkerContext(
      vi.fn().mockResolvedValue({ content: "safe content" }),
    );

    await runWorker(context);

    expect(context.executeFileOperation).toHaveBeenCalledWith(
      "termux.file.read",
      { path: "README.md" },
    );
    expect(context.parentPort.postMessage).toHaveBeenCalledWith({
      success: true,
      output: { content: "safe content" },
    });
  });

  it("preserves allow-listed worker errors", async () => {
    const context = createWorkerContext(
      vi.fn().mockRejectedValue({ code: "XLSX_PARSE_FAILED" }),
    );

    await runWorker(context);

    expect(context.parentPort.postMessage).toHaveBeenCalledWith({
      success: false,
      code: "XLSX_PARSE_FAILED",
    });
  });

  it("normalizes unknown worker errors", async () => {
    const context = createWorkerContext(
      vi.fn().mockRejectedValue(new Error("private parser detail")),
    );

    await runWorker(context);

    expect(context.parentPort.postMessage).toHaveBeenCalledWith({
      success: false,
      code: "CAPABILITY_UNAVAILABLE",
    });
  });
});
