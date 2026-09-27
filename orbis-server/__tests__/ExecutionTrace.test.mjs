// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const {
  buildExecutionTrace,
} = require("../ai/trace/ExecutionTrace.cjs");

describe("Phase 4A unified execution trace", () => {
  it("records model selection and fallback without message content", () => {
    const trace = buildExecutionTrace({
      decision: {
        route: "brain-orchestrated-provider",
        intent: "general-conversation",
        confidence: "medium",
        reason: "provider-reasoning",
        capabilityId: "provider.chat",
      },
      routingDurationMs: 3,
      response: {
        message: {
          role: "assistant",
          content: "PRIVATE RESPONSE CONTENT",
        },
        provider: {
          name: "Ollama",
          type: "local",
          model: "local-model",
          routing: {
            task: "coding",
            source: "provider-fallback",
            attempts: [
              {
                provider: "Hugging Face",
                providerType: "cloud",
                model: "coder-model",
                registryModelId: "coder-registry-id",
                codename: "Forge",
                source: "model-registry",
                status: "failed",
                durationMs: 10,
                errorCode: "PROVIDER_UNAVAILABLE",
              },
              {
                provider: "Ollama",
                providerType: "local",
                model: "local-model",
                source: "provider-fallback",
                status: "success",
                durationMs: 4,
                errorCode: null,
              },
            ],
          },
        },
      },
    });

    expect(trace.task).toBe("coding");
    expect(trace.finalStatus).toBe("completed");
    expect(trace.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "model",
          actor: "Forge",
          status: "failed",
          errorCode: "PROVIDER_UNAVAILABLE",
        }),
        expect.objectContaining({
          kind: "model",
          provider: "Ollama",
          status: "success",
        }),
      ]),
    );

    expect(JSON.stringify(trace)).not.toContain(
      "PRIVATE RESPONSE CONTENT",
    );
  });

  it("records sanitized capability identity without output payload", () => {
    const trace = buildExecutionTrace({
      decision: {
        route: "foundation-capability",
        intent: "foundation-capability",
        confidence: "high",
        reason: "registered-capability",
        capabilityId: "termux.system.info",
      },
      routingDurationMs: 2,
      response: {
        message: {
          role: "assistant",
          content: "PRIVATE SYSTEM OUTPUT",
        },
        provider: {
          name: "ORBIS Brain",
          type: "BRAIN_CAPABILITY",
        },
        execution: {
          capabilityId: "termux.system.info",
          requestId: "req-trace-1",
          runtime: "TermuxRuntime",
          success: true,
          durationMs: 8,
          approvalRequired: false,
          errorCode: null,
        },
      },
    });

    expect(trace.finalStatus).toBe("completed");
    expect(trace.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capability",
          requestId: "req-trace-1",
          runtime: "TermuxRuntime",
          status: "success",
        }),
      ]),
    );

    expect(JSON.stringify(trace)).not.toContain(
      "PRIVATE SYSTEM OUTPUT",
    );
  });

  it("records sanitized Agent tool activity without repository payloads", () => {
    const trace = buildExecutionTrace({
      decision: {
        route: "brain-orchestrated-provider",
        intent: "general-conversation",
        confidence: "medium",
        reason: "provider-reasoning",
        capabilityId: "provider.chat",
      },
      routingDurationMs: 1,
      response: {
        message: {
          role: "assistant",
          content: "PRIVATE FINAL RESPONSE",
        },
        provider: {
          name: "Hugging Face",
          type: "cloud",
          model: "coder-model",
          routing: {
            task: "coding",
            registryModelId: "coder-registry",
            codename: "Forge",
            source: "model-registry",
            attempts: [],
          },
        },
        agent: {
          task: "coding",
          status: "completed",
          iterations: 2,
          toolBudget: 3,
          tools: [
            {
              name: "repository.search",
              status: "success",
              durationMs: 4,
              errorCode: null,
              privatePayload: "PRIVATE SOURCE CONTENT",
            },
          ],
        },
      },
    });

    expect(trace.agent).toEqual({
      task: "coding",
      status: "completed",
      iterations: 2,
      toolBudget: 3,
    });

    expect(trace.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tool",
          tool: "repository.search",
          status: "success",
          durationMs: 4,
        }),
      ]),
    );

    expect(JSON.stringify(trace)).not.toContain(
      "PRIVATE SOURCE CONTENT",
    );
    expect(JSON.stringify(trace)).not.toContain(
      "PRIVATE FINAL RESPONSE",
    );
  });

});
