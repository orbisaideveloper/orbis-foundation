// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const memory = require("../ai/brain/MemoryEngine.cjs");

describe("server conversational memory privacy", () => {
  it("never retrieves or learns personal chat content on the server", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const raw = "my private phone is 555-0100";
    await expect(memory.retrieveMemory(raw)).resolves.toEqual({
      brainKnowledge: null,
      memoryContext: "",
    });
    await expect(memory.learnFromUser(raw)).resolves.toEqual({
      stored: false,
      reason: "SERVER_CHAT_MEMORY_DISABLED",
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
