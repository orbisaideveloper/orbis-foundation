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
  SemanticIntentConductor,
} = require("../ai/brain/SemanticIntentConductor.cjs");

const {
  RepositoryAgentLoop,
  repositoryAgentLoop,
} = require("../ai/agent/RepositoryAgentLoop.cjs");

const EXAMPLE_SOURCE_PATH = "src/example.ts";
const UPDATED_VALUE_LINE = "const value = 2;";
const GENERAL_CHAT_TASK = "general-chat";
const HF_PROVIDER_NAME = "Hugging Face";
const REPOSITORY_READ_ACTION = "repository.read";
const REPOSITORY_PATCH_ACTION = "repository.patch";
const ORIGINAL_VALUE_LINE = "const value = 1;";
const EXAMPLE_TEST_PATH = "src/example.test.ts";

const PROVIDER = {
  name: HF_PROVIDER_NAME,
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
  it("wires the production repository agent through the semantic conductor", () => {
    expect(repositoryAgentLoop.conductor).toBeTruthy();
    expect(
      typeof repositoryAgentLoop.conductor.interpret,
    ).toBe("function");
  });

  it("lets semantic intent keep a coding capability question on general chat", async () => {
    const messages = [
      {
        role: "user",
        content: "Can you do coding?",
      },
    ];

    const manager = {
      generateChat: vi.fn().mockResolvedValue(
        response("Yes, I can help with coding."),
      ),
    };

    const conductor = {
      interpret: vi.fn().mockResolvedValue({
        task: GENERAL_CHAT_TASK,
        interaction: "capability-question",
        responseLanguage: "same",
        confidence: "high",
        clarificationRequired: false,
        source: "semantic-model",
      }),
    };

    const tools = fakeTools();

    const loop = new RepositoryAgentLoop({
      manager,
      tools,
      conductor,
    });

    const result = await loop.run(messages);

    expect(
      conductor.interpret,
    ).toHaveBeenCalledWith(
      messages,
      {
        fallbackTask:
          GENERAL_CHAT_TASK,
        timeoutMs: undefined,
      },
    );

    expect(manager.generateChat).toHaveBeenCalledWith(
      messages,
      {
        task: GENERAL_CHAT_TASK,
      },
    );

    expect(result.content).toBe(
      "Yes, I can help with coding.",
    );

    expect(tools.getGitState).not.toHaveBeenCalled();
    expect(tools.listFiles).not.toHaveBeenCalled();
    expect(tools.search).not.toHaveBeenCalled();
    expect(tools.readFile).not.toHaveBeenCalled();
  });

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
              action: REPOSITORY_READ_ACTION,
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
        name: REPOSITORY_READ_ACTION,
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
            action: REPOSITORY_PATCH_ACTION,
            path: EXAMPLE_SOURCE_PATH,
            edits: [
              {
                oldText: ORIGINAL_VALUE_LINE,
                newText: UPDATED_VALUE_LINE,
              },
            ],
            verifyTargets: [
              EXAMPLE_TEST_PATH,
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
            oldText: ORIGINAL_VALUE_LINE,
            newText: UPDATED_VALUE_LINE,
          },
        ],
      },
      followUpVerification: {
        targets: [
          EXAMPLE_TEST_PATH,
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
              action: REPOSITORY_PATCH_ACTION,
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
        content: "Patch this repository code without tests",
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


  it("adds a Bengali exactness instruction to Bengali coding work", async () => {
    const manager = {
      generateChat: vi.fn().mockResolvedValue(
        response(
          JSON.stringify({
            action: "final",
            answer:
              "```javascript\\nfunction add(a, b) { return a + b; }\\n```\\nদুটি সংখ্যার যোগফল রিটার্ন করে।",
          }),
        ),
      ),
    };

    const loop = new RepositoryAgentLoop({
      manager,
      tools: fakeTools(),
    });

    await loop.run([
      {
        role: "user",
        content:
          "JavaScript-এ add(a, b) function লিখে বাংলায় বুঝিয়ে দাও",
      },
    ]);

    const workerMessages =
      manager.generateChat.mock.calls[0][0];

    expect(
      workerMessages.some(
        (message) =>
          message.role === "system" &&
          message.content.includes(
            "fluent, natural Bengali",
          ) &&
          message.content.includes(
            "Preserve code blocks",
          ) &&
          message.content.includes(
            "Do not insert Hindi/Devanagari",
          ),
      ),
    ).toBe(true);

    expect(
      manager.generateChat.mock.calls[0][1]
        .validateResponse,
    ).toBeUndefined();
  });


  it("uses general-chat Orbit composition only for a Bengali coding final", async () => {
    const forgeDraft =
      "ফুণশননাম add এবং return a + b অপরিবর্তিত।";

    const cleanAnswer =
      "```javascript\nfunction add(a, b) { return a + b; }\n```\nএই function দুটি সংখ্যার যোগফল রিটার্ন করে।";

    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: forgeDraft,
            }),
          ),
        )
        .mockResolvedValueOnce({
          content: cleanAnswer,
          provider: {
            name: HF_PROVIDER_NAME,
            type: "cloud",
            model:
              "Qwen/Qwen3-4B:featherless-ai",
          },
        }),
    };

    const loop = new RepositoryAgentLoop({
      manager,
      tools: fakeTools(),
    });

    const result = await loop.run([
      {
        role: "user",
        content:
          "JavaScript-এ ঠিক এই code রাখো: function add(a, b) { return a + b; } এবং বাংলায় বুঝিয়ে দাও",
      },
    ], {
      task: "coding",
    });

    expect(result.content).toBe(cleanAnswer);

    expect(manager.generateChat).toHaveBeenCalledTimes(2);

    expect(
      manager.generateChat.mock.calls[1][1],
    ).toEqual(
      expect.objectContaining({
        task: GENERAL_CHAT_TASK,
      }),
    );

    const composerMessages =
      manager.generateChat.mock.calls[1][0];

    expect(composerMessages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining(
          "Bengali final-response composer",
        ),
      }),
    );

    expect(composerMessages[1].content).toContain(
      "function add(a, b) { return a + b; }",
    );

    expect(composerMessages[1].content).toContain(
      forgeDraft,
    );
  });

  it("keeps the Forge final when Bengali composition fails", async () => {
    const forgeDraft =
      "মূল coding worker final answer";

    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: forgeDraft,
            }),
          ),
        )
        .mockRejectedValueOnce(
          new Error("composer unavailable"),
        ),
    };

    const loop = new RepositoryAgentLoop({
      manager,
      tools: fakeTools(),
    });

    const result = await loop.run([
      {
        role: "user",
        content:
          "এই JavaScript code বাংলায় বুঝিয়ে দাও",
      },
    ], {
      task: "coding",
    });

    expect(result.content).toBe(forgeDraft);
    expect(manager.generateChat).toHaveBeenCalledTimes(2);
  });

  it("does not invoke the Bengali composer for reasoning finals", async () => {
    const answer =
      "১২ - ৩ = ৯ লিটার।";

    const manager = {
      generateChat: vi.fn().mockResolvedValue(
        response(
          JSON.stringify({
            action: "final",
            answer,
          }),
        ),
      ),
    };

    const loop = new RepositoryAgentLoop({
      manager,
      tools: fakeTools(),
    });

    const result = await loop.run(
      [
        {
          role: "user",
          content:
            "বাংলায় বিশ্লেষণ করে বলো ১২ থেকে ৩ বাদ দিলে কত",
        },
      ],
      {
        task: "reasoning",
      },
    );

    expect(result.content).toBe(answer);
    expect(manager.generateChat).toHaveBeenCalledOnce();
  });


  it("restores explicit user code when the Bengali composer omits it", async () => {
    const exactCode =
      "function add(a, b) { return a + b; }";

    const forgeDraft =
      "দুটি সংখ্যা যোগ করার function।";

    const composerDraft =
      "ফাংশনটি দুটি সংখ্যা যোগ করে ফলাফল ফেরত দেয়।";

    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: forgeDraft,
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(composerDraft),
        ),
    };

    const loop = new RepositoryAgentLoop({
      manager,
      tools: fakeTools(),
    });

    const result = await loop.run(
      [
        {
          role: "user",
          content:
            "JavaScript-এ ঠিক এই function-টি লিখে বাংলায় বুঝিয়ে দাও: " +
            exactCode +
            " — code বদলাবে না।",
        },
      ],
      {
        task: "coding",
      },
    );

    expect(result.content).toContain(
      exactCode,
    );

    expect(result.content).toContain(
      composerDraft,
    );

    expect(
      result.content.indexOf(exactCode),
    ).toBeLessThan(
      result.content.indexOf(composerDraft),
    );

    expect(manager.generateChat).toHaveBeenCalledTimes(2);
  });


  it("retries one rejected structured worker turn with the same conversation and tool state", async () => {
    const statefulConversation = [
      {
        role: "system",
        content:
          "ORBIS_TOOL_RESULT repository.read: existing-bounded-state",
      },
      {
        role: "user",
        content:
          "আগের কাজের বাকি অংশ শেষ করো",
      },
    ];

    const rejected = Object.assign(
      new Error("PROVIDER_UNAVAILABLE"),
      {
        code: "PROVIDER_UNAVAILABLE",
        routingAttempts: [
          {
            provider: HF_PROVIDER_NAME,
            errorCode:
              "PROVIDER_RESPONSE_REJECTED",
          },
          {
            provider: "Ollama",
            errorCode:
              "PROVIDER_UNAVAILABLE",
          },
        ],
      },
    );

    const repaired = JSON.stringify({
      action: "final",
      answer: "আগের state থেকেই কাজ সম্পূর্ণ হয়েছে।",
    });

    const manager = {
      generateChat: vi
        .fn()
        .mockRejectedValueOnce(rejected)
        .mockResolvedValueOnce(
          response(repaired),
        ),
    };

    const loop = new RepositoryAgentLoop({
      manager,
      tools: fakeTools(),
    });

    const result = await loop.modelTurn(
      statefulConversation,
      "coding",
    );

    expect(result.content).toBe(repaired);
    expect(manager.generateChat).toHaveBeenCalledTimes(2);

    expect(
      manager.generateChat.mock.calls[0][0],
    ).toBe(statefulConversation);

    const repairMessages =
      manager.generateChat.mock.calls[1][0];

    expect(repairMessages).toEqual(
      expect.arrayContaining(
        statefulConversation,
      ),
    );

    expect(
      repairMessages.some(
        (message) =>
          message.role === "system" &&
          message.content.includes(
            "Continue from the complete conversation and tool-result state above.",
          ),
      ),
    ).toBe(true);

    expect(
      manager.generateChat.mock.calls[1][1],
    ).toEqual(
      expect.objectContaining({
        task: "coding",
        validateResponse:
          expect.any(Function),
      }),
    );
  });

  it("does not fan out to a second general-chat worker after pure provider availability failure", async () => {
    const unavailable =
      Object.assign(
        new Error(
          "PROVIDER_UNAVAILABLE_503",
        ),
        {
          code:
            "PROVIDER_UNAVAILABLE_503",
          routingAttempts: [
            {
              provider:
                HF_PROVIDER_NAME,
              errorCode:
                "PROVIDER_UNAVAILABLE_503",
            },
          ],
        },
      );

    const manager = {
      generateChat:
        vi.fn().mockRejectedValue(
          unavailable,
        ),
    };

    const loop =
      new RepositoryAgentLoop({
        manager,
        tools: fakeTools(),
      });

    await expect(
      loop.modelTurn(
        [
          {
            role: "user",
            content:
              "Fix this JavaScript function.",
          },
        ],
        "coding",
      ),
    ).rejects.toMatchObject({
      code:
        "PROVIDER_UNAVAILABLE_503",
    });

    expect(
      manager.generateChat,
    ).toHaveBeenCalledOnce();
  });

  it("does not hide provider authentication failures behind worker recovery", async () => {
    const authFailure = Object.assign(
      new Error("PROVIDER_AUTH_FAILED"),
      {
        code: "PROVIDER_AUTH_FAILED",
        routingAttempts: [
          {
            provider: HF_PROVIDER_NAME,
            errorCode:
              "PROVIDER_AUTH_FAILED",
          },
        ],
      },
    );

    const manager = {
      generateChat: vi
        .fn()
        .mockRejectedValue(authFailure),
    };

    const loop = new RepositoryAgentLoop({
      manager,
      tools: fakeTools(),
    });

    await expect(
      loop.modelTurn(
        [
          {
            role: "user",
            content: "fix this code",
          },
        ],
        "coding",
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_AUTH_FAILED",
    });

    expect(manager.generateChat).toHaveBeenCalledOnce();
  });

});


describe("RepositoryAgentLoop conductor failure integration", () => {
  it("production-like conductor failure keeps capability intent on general-chat without repository tools", async () => {
    const messages = [
      {
        role: "user",
        content:
          "তুমি coding করতে পারবে?",
      },
    ];

    const semanticGenerate =
      vi.fn().mockRejectedValue(
        Object.assign(
          new Error(
            "semantic provider unavailable",
          ),
          {
            code:
              "PROVIDER_UNAVAILABLE_503",
          },
        ),
      );

    const conductor =
      new SemanticIntentConductor({
        generate:
          semanticGenerate,
      });

    const manager = {
      generateChat:
        vi.fn().mockResolvedValue({
          content:
            "হ্যাঁ, coding নিয়ে সাহায্য করতে পারি।",
          provider: {
            name:
              HF_PROVIDER_NAME,
            type: "cloud",
            model:
              "fallback-general",
            routing: {
              task:
                GENERAL_CHAT_TASK,
              registryModelId:
                null,
              codename:
                null,
              source:
                "model-registry",
              attempts: [],
            },
          },
        }),
    };

    const tools =
      fakeTools();

    const loop =
      new RepositoryAgentLoop({
        manager,
        tools,
        conductor,
      });

    const result =
      await loop.run(
        messages,
      );

    expect(
      semanticGenerate,
    ).toHaveBeenCalledTimes(1);

    expect(
      manager.generateChat,
    ).toHaveBeenCalledTimes(1);

    const [
      providerMessages,
      providerOptions,
    ] =
      manager.generateChat.mock.calls[0];

    expect(
      providerOptions,
    ).toEqual({
      task:
        GENERAL_CHAT_TASK,
    });

    expect(
      providerMessages.at(-1),
    ).toEqual(
      messages[0],
    );

    expect(
      providerMessages.some(
        (message) =>
          message.role ===
            "system" &&
          message.content.includes(
            "fluent, natural Bengali",
          ),
      ),
    ).toBe(true);

    expect(
      result.content,
    ).toContain(
      "coding",
    );

    expect(
      tools.getGitState,
    ).not.toHaveBeenCalled();

    expect(
      tools.listFiles,
    ).not.toHaveBeenCalled();

    expect(
      tools.search,
    ).not.toHaveBeenCalled();

    expect(
      tools.readFile,
    ).not.toHaveBeenCalled();
  });
});


describe("RepositoryAgentLoop coding final constraint review", () => {
  it("performs one bounded repair when the verifier finds a missed explicit constraint", async () => {
    const incomplete =
      "function settleInvoice(totalPaise, payments) { return { paidPaise: payments.reduce((a, b) => a + b, 0) }; }";

    const corrected =
      "function settleInvoice(totalPaise, payments) { if (!Number.isSafeInteger(totalPaise) || totalPaise < 0 || !Array.isArray(payments) || payments.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new TypeError('Invalid input'); const paidPaise = payments.reduce((a, b) => a + b, 0); return { paidPaise, duePaise: Math.max(totalPaise - paidPaise, 0), advancePaise: Math.max(paidPaise - totalPaise, 0) }; }";

    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: incomplete,
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              status: "revise",
              feedback:
                "The answer does not validate non-negative integer inputs or throw TypeError.",
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: corrected,
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              status: "pass",
              feedback: "",
            }),
          ),
        ),
    };

    const loop =
      new RepositoryAgentLoop({
        manager,
        tools: fakeTools(),
      });

    const result =
      await loop.run(
        [
          {
            role: "user",
            content:
              "Write settleInvoice. totalPaise must be a non-negative integer. payments must contain only non-negative integers. Invalid input must throw TypeError.",
          },
        ],
        {
          task: "coding",
        },
      );

    expect(result.content).toBe(
      corrected,
    );

    expect(
      manager.generateChat.mock.calls[1][1],
    ).toEqual(
      expect.objectContaining({
        task: "reasoning",
      }),
    );

    expect(
      manager.generateChat.mock.calls[2][1],
    ).toEqual(
      expect.objectContaining({
        task: "coding",
        validateResponse:
          expect.any(Function),
      }),
    );
    expect(
      manager.generateChat.mock.calls[3][1],
    ).toEqual(
      expect.objectContaining({
        task: "reasoning",
      }),
    );

  });
});


describe("RepositoryAgentLoop execution-mode authority boundary", () => {
  it("accepts direct code-only output in answer-only mode without repository execution", async () => {
    const finalAnswer = [
      "function settleInvoice(totalPaise, payments) {",
      "  if (!Number.isInteger(totalPaise) || totalPaise < 0 ||",
      "      !Array.isArray(payments) ||",
      "      !payments.every((value) => Number.isInteger(value) && value >= 0)) {",
      '    throw new TypeError("Invalid input");',
      "  }",
      "  const paidPaise = payments.reduce((sum, value) => sum + value, 0);",
      "  return {",
      "    paidPaise,",
      "    duePaise: Math.max(totalPaise - paidPaise, 0),",
      "    advancePaise: Math.max(paidPaise - totalPaise, 0),",
      "  };",
      "}",
    ].join("\\n");

    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(finalAnswer),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              status: "pass",
              feedback: "",
            }),
          ),
        ),
    };

    const tools = fakeTools();

    const loop =
      new RepositoryAgentLoop({
        manager,
        tools,
      });

    const result =
      await loop.run([
        {
          role: "user",
          content:
            "Write a single JavaScript function declaration named settleInvoice(totalPaise, payments). " +
            "Return ONLY JavaScript code, no markdown and no explanation. " +
            "totalPaise must be a non-negative integer. " +
            "payments must be an array of non-negative integers. " +
            "Throw TypeError for invalid input. " +
            "Do not read or modify repository files.",
        },
      ]);

    expect(result.content).toBe(
      finalAnswer,
    );

    expect(
      result.capabilityRequest,
    ).toBeUndefined();

    expect(
      manager.generateChat,
    ).toHaveBeenCalledTimes(2);

    expect(
      manager.generateChat.mock.calls[0][0][0]
        .content,
    ).toContain(
      "answer-only",
    );

    expect(
      manager.generateChat.mock.calls[0][1],
    ).toEqual(
      expect.objectContaining({
        task: "coding",
      }),
    );

    expect(
      manager.generateChat.mock.calls[0][1]
        .validateResponse,
    ).toBeUndefined();

    expect(
      manager.generateChat.mock.calls[1][1],
    ).toEqual(
      expect.objectContaining({
        task: "reasoning",
      }),
    );

    expect(
      tools.getGitState,
    ).not.toHaveBeenCalled();

    expect(
      tools.listFiles,
    ).not.toHaveBeenCalled();

    expect(
      tools.search,
    ).not.toHaveBeenCalled();

    expect(
      tools.readFile,
    ).not.toHaveBeenCalled();
  });
});
describe("RepositoryAgentLoop coding final fail-closed verification", () => {
  const constrainedRequest =
    "Write settleInvoice. totalPaise must be a non-negative integer. " +
    "payments must contain only non-negative integers. " +
    "Invalid input must throw TypeError.";

  const incomplete =
    "function settleInvoice(totalPaise, payments) { " +
    "return { paidPaise: payments.reduce((a, b) => a + b, 0) }; }";

  it("does not return a verifier-rejected draft when bounded repair is unavailable", async () => {
    const unavailable = Object.assign(
      new Error("PROVIDER_UNAVAILABLE"),
      {
        code: "PROVIDER_UNAVAILABLE",
      },
    );

    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: incomplete,
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              status: "revise",
              feedback:
                "Missing integer validation.",
            }),
          ),
        )
        .mockRejectedValueOnce(
          unavailable,
        ),
    };

    const loop =
      new RepositoryAgentLoop({
        manager,
        tools: fakeTools(),
      });

    await expect(
      loop.run(
        [
          {
            role: "user",
            content:
              constrainedRequest,
          },
        ],
        {
          task: "coding",
        },
      ),
    ).rejects.toMatchObject({
      code:
        "CODING_FINAL_REPAIR_UNAVAILABLE",
    });

    expect(
      manager.generateChat,
    ).toHaveBeenCalledTimes(3);
  });

  it("re-verifies a repaired coding final before accepting it", async () => {
    const repaired =
      "function settleInvoice(totalPaise, payments) { " +
      "if (!Number.isSafeInteger(totalPaise)) throw new TypeError('Invalid input'); " +
      "return { paidPaise: payments.reduce((a, b) => a + b, 0) }; }";

    const manager = {
      generateChat: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: incomplete,
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              status: "revise",
              feedback:
                "Missing integer validation.",
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              action: "final",
              answer: repaired,
            }),
          ),
        )
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              status: "revise",
              feedback:
                "Payment integer validation is still missing.",
            }),
          ),
        ),
    };

    const loop =
      new RepositoryAgentLoop({
        manager,
        tools: fakeTools(),
      });

    await expect(
      loop.run(
        [
          {
            role: "user",
            content:
              constrainedRequest,
          },
        ],
        {
          task: "coding",
        },
      ),
    ).rejects.toMatchObject({
      code:
        "CODING_FINAL_REVERIFICATION_FAILED",
    });

    expect(
      manager.generateChat,
    ).toHaveBeenCalledTimes(4);

    expect(
      manager.generateChat.mock.calls[3][1],
    ).toEqual(
      expect.objectContaining({
        task: "reasoning",
      }),
    );
  });
});

describe("RepositoryAgentLoop deterministic obvious-task routing", () => {
  it("does not spend a conductor call on obvious coding or explanation requests", async () => {
    const conductor = {
      interpret:
        vi.fn().mockResolvedValue({
          task: "coding",
        }),
    };

    const loop =
      new RepositoryAgentLoop({
        manager: {
          generateChat: vi.fn(),
        },
        tools: fakeTools(),
        conductor,
      });

    await expect(
      loop.resolveTask([
        {
          role: "user",
          content:
            "Write a JavaScript function named add.",
        },
      ]),
    ).resolves.toBe("coding");

    await expect(
      loop.resolveTask([
        {
          role: "user",
          content:
            "Explain the difference between Promise.all and Promise.allSettled in JavaScript.",
        },
      ]),
    ).resolves.toBe(
      GENERAL_CHAT_TASK,
    );

    await expect(
      loop.resolveTask([
        {
          role: "user",
          content:
            "Ami Banglay bujhte chai: JavaScript closure ki? Chhoto example diye Banglay bojhao.",
        },
      ]),
    ).resolves.toBe(
      GENERAL_CHAT_TASK,
    );

    expect(
      conductor.interpret,
    ).not.toHaveBeenCalled();
  });

  it("keeps the semantic conductor for an actually ambiguous technical request", async () => {
    const conductor = {
      interpret:
        vi.fn().mockResolvedValue({
          task: "coding",
        }),
    };

    const loop =
      new RepositoryAgentLoop({
        manager: {
          generateChat: vi.fn(),
        },
        tools: fakeTools(),
        conductor,
      });

    await expect(
      loop.resolveTask([
        {
          role: "user",
          content:
            "Can you help me with this JavaScript code?",
        },
      ]),
    ).resolves.toBe("coding");

    expect(
      conductor.interpret,
    ).toHaveBeenCalledOnce();
  });
});
