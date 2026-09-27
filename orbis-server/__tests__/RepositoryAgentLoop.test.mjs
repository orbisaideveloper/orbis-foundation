// @vitest-environment node

import { createRequire } from "node:module";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

const require = createRequire(import.meta.url);

const {
  RepositoryAgentLoop,
} = require("../ai/agent/RepositoryAgentLoop.cjs");

const EXAMPLE_SOURCE_PATH = "src/example.ts";
const UPDATED_VALUE_LINE = "const value = 2;";

const PROVIDER = {
  name: "Hugging Face",
  type: "cloud",
  model: "coder-model",
  routing: {
    task: "coding",
    registryModelId: "coder-model",
    codename: "Forge",
    source: "model-registry",
    attempts: [],
  },
};

function response(content) {
  return {
    content,
    provider: PROVIDER,
  };
}

function fakeTools() {
  return {
    getGitState: vi.fn(),
    listFiles: vi.fn(),
    search: vi.fn(),
    readFile: vi.fn(),
  };
}

describe("Phase 4B RepositoryAgentLoop", () => {
  it("keeps general chat on the normal provider path without repository tools", async () => {
    const manager = {
      generateChat: vi.fn().mockResolvedValue(
        response("hello"),
      ),
    };

    const tools = fakeTools();
    const loop = new RepositoryAgentLoop({
      manager,
      tools,
    });

    const result = await loop.run([
      {
        role: "user",
        content: "Hello, how are you?",
      },
    ]);

    expect(result.content).toBe("hello");
    expect(manager.generateChat).toHaveBeenCalledTimes(1);
    expect(tools.search).not.toHaveBeenCalled();
    expect(tools.readFile).not.toHaveBeenCalled();
  });

  it("lets a coding worker request a bounded repository search and then finish", async () => {
    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "repository.search",
              query: "calculateTotal",
              limit: 5,
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: "Found the relevant implementation.",
            }),
          ),
        ),
    };

    const tools = fakeTools();

    tools.search.mockReturnValue({
      matches: [
        {
          path: EXAMPLE_SOURCE_PATH,
          line: 10,
          text: "PRIVATE SOURCE CONTENT",
        },
      ],
    });

    const loop = new RepositoryAgentLoop({
      manager,
      tools,
    });

    const result = await loop.run([
      {
        role: "user",
        content: "Debug this repository function calculateTotal",
      },
    ]);

    expect(tools.search).toHaveBeenCalledWith(
      "calculateTotal",
      { limit: 5 },
    );

    expect(result.content).toBe(
      "Found the relevant implementation.",
    );

    expect(result.agent).toMatchObject({
      task: "coding",
      status: "completed",
      iterations: 2,
      toolBudget: 3,
    });

    expect(result.agent.tools).toEqual([
      expect.objectContaining({
        name: "repository.search",
        status: "success",
      }),
    ]);

    expect(JSON.stringify(result.agent)).not.toContain(
      "PRIVATE SOURCE CONTENT",
    );
  });

  it("rejects an unsupported model-requested action without executing it", async () => {
    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "shell.exec",
              command: "rm -rf /",
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: "I cannot use that action.",
            }),
          ),
        ),
    };

    const tools = fakeTools();
    const loop = new RepositoryAgentLoop({
      manager,
      tools,
    });

    const result = await loop.run([
      {
        role: "user",
        content: "Debug this repository",
      },
    ]);

    expect(tools.getGitState).not.toHaveBeenCalled();
    expect(tools.listFiles).not.toHaveBeenCalled();
    expect(tools.search).not.toHaveBeenCalled();
    expect(tools.readFile).not.toHaveBeenCalled();

    expect(result.agent.tools).toEqual([
      expect.objectContaining({
        name: "agent.protocol",
        status: "rejected",
        errorCode: "AGENT_ACTION_NOT_ALLOWED",
      }),
    ]);
  });

  it("passes only a sanitized repository-tool error back into agent metadata", async () => {
    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "repository.read",
              path: ".env",
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: "The requested path is not available.",
            }),
          ),
        ),
    };

    const tools = fakeTools();

    tools.readFile.mockImplementation(() => {
      const error = new Error(
        "PRIVATE INTERNAL ERROR DETAIL",
      );
      error.code = "REPOSITORY_PATH_NOT_ALLOWED";
      throw error;
    });

    const loop = new RepositoryAgentLoop({
      manager,
      tools,
    });

    const result = await loop.run([
      {
        role: "user",
        content: "Debug repository configuration",
      },
    ]);

    expect(result.agent.tools).toEqual([
      expect.objectContaining({
        name: "repository.read",
        status: "failed",
        errorCode: "REPOSITORY_PATH_NOT_ALLOWED",
      }),
    ]);

    expect(JSON.stringify(result.agent)).not.toContain(
      "PRIVATE INTERNAL ERROR DETAIL",
    );
  });

  it("turns a model patch proposal into an approval-bound capability request without writing directly", async () => {
    const manager = {
      generateChat: vi.fn().mockResolvedValue(
        response(
          JSON.stringify({
            action: "repository.patch",
            path: EXAMPLE_SOURCE_PATH,
            edits: [
              {
                oldText: "const value = 1;",
                newText: UPDATED_VALUE_LINE,
              },
            ],
            verifyTargets: [
              "src/example.test.ts",
            ],
          }),
        ),
      ),
    };

    const tools = fakeTools();
    const loop = new RepositoryAgentLoop({
      manager,
      tools,
    });

    const result = await loop.run([
      {
        role: "user",
        content: "Fix this repository code and verify it",
      },
    ]);

    expect(result.capabilityRequest).toEqual({
      capabilityId: "termux.repository.patch",
      input: {
        path: EXAMPLE_SOURCE_PATH,
        edits: [
          {
            oldText: "const value = 1;",
            newText: UPDATED_VALUE_LINE,
          },
        ],
      },
      followUpVerification: {
        targets: [
          "src/example.test.ts",
        ],
      },
    });

    expect(result.agent).toMatchObject({
      task: "coding",
      status: "capability-requested",
    });

    expect(tools.getGitState).not.toHaveBeenCalled();
    expect(tools.listFiles).not.toHaveBeenCalled();
    expect(tools.search).not.toHaveBeenCalled();
    expect(tools.readFile).not.toHaveBeenCalled();

    expect(JSON.stringify(result.agent)).not.toContain(
      UPDATED_VALUE_LINE,
    );
  });

  it("turns a model verify proposal into a separate approval-bound capability request", async () => {
    const manager = {
      generateChat: vi.fn().mockResolvedValue(
        response(
          JSON.stringify({
            action: "repository.verify",
            targets: [
              "orbis-server/__tests__/RepositoryAgentLoop.test.mjs",
            ],
          }),
        ),
      ),
    };

    const loop = new RepositoryAgentLoop({
      manager,
      tools: fakeTools(),
    });

    const result = await loop.run([
      {
        role: "user",
        content: "Verify the changed repository area",
      },
    ]);

    expect(result.capabilityRequest).toEqual({
      capabilityId: "termux.repository.verify",
      input: {
        targets: [
          "orbis-server/__tests__/RepositoryAgentLoop.test.mjs",
        ],
      },
    });

    expect(result.agent.status).toBe(
      "capability-requested",
    );
  });

  it("rejects a patch proposal that has no bounded targeted verification plan", async () => {
    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "repository.patch",
              path: EXAMPLE_SOURCE_PATH,
              edits: [
                {
                  oldText: "old",
                  newText: "new",
                },
              ],
              verifyTargets: [],
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer:
                "I cannot prepare that patch without a targeted verification plan.",
            }),
          ),
        ),
    };

    const loop = new RepositoryAgentLoop({
      manager,
      tools: fakeTools(),
    });

    const result = await loop.run([
      {
        role: "user",
        content: "Patch this without tests",
      },
    ]);

    expect(result.capabilityRequest).toBeUndefined();
    expect(result.agent.tools).toEqual([
      expect.objectContaining({
        name: "agent.protocol",
        status: "rejected",
        errorCode:
          "AGENT_CAPABILITY_REQUEST_INVALID",
      }),
    ]);
  });

});
