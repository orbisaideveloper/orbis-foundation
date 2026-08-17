import { afterEach, describe, expect, it, vi } from "vitest";
import { TermuxRuntime } from "../runtimes/TermuxRuntime";

afterEach(() => vi.unstubAllGlobals());

const CAPABILITY_ID = "termux.file.read";
const FILE_KEY = "package.json";

describe("TASK-019 TermuxRuntime input forwarding", () => {
  it("sends the allow-list input to bridge.cjs", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith("/api/termux/handshake")) {
          return new Response(
            JSON.stringify({
              identity: { valid: true },
              capabilities: ["termux.system.info", CAPABILITY_ID],
              status: "CAPABILITIES_VERIFIED",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: { path: FILE_KEY, content: "{}", sizeBytes: 2 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const runtime = new TermuxRuntime();
    await runtime.performHandshake();
    const result = await runtime.execute({
      requestId: "brain-req-task019",
      capability: CAPABILITY_ID,
      input: { path: FILE_KEY },
      requestedRuntime: "TermuxRuntime",
    } as any);

    expect(result.success).toBe(true);
    const executionCall = calls.find((c) =>
      c.url.endsWith("/api/termux/capability"),
    );
    expect(executionCall).toBeDefined();
    expect(JSON.parse(String(executionCall?.init?.body))).toEqual({
      capability: CAPABILITY_ID,
      input: { path: FILE_KEY },
    });
  });
});
