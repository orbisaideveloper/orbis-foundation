// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  FoundationLearningService,
} = require("../ai/learning/FoundationLearningService.cjs");
const providerManager = require("../ai/AIProviderManager.cjs");
const chatService = require("../ai/AIChatService.cjs");

const SOURCE =
  "The application should validate every request before invoking a protected capability.";
const CANDIDATE = {
  content:
    "Protected capability execution requires deterministic validation at the request boundary.",
  category: "OPERATING_RULE",
  tags: ["validation", "capability-security"],
};

function createRepository() {
  const records = new Map();
  return {
    createOrGet: vi.fn(async (record) => {
      const existing = records.get(record.deduplicationHash);
      if (existing) return { record: existing, duplicate: true };
      const saved = {
        id: crypto.randomUUID(),
        category: record.category,
        content: record.content,
        tags: record.tags,
        isActive: true,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
      records.set(record.deduplicationHash, saved);
      return { record: saved, duplicate: false };
    }),
    list: vi.fn(async () => [...records.values()]),
    delete: vi.fn(async (id) => {
      for (const [hash, record] of records) {
        if (record.id === id) {
          records.delete(hash);
          return { deleted: true };
        }
      }
      return { deleted: false };
    }),
  };
}

function createService(repository = createRepository()) {
  return {
    repository,
    service: new FoundationLearningService({
      repository,
      candidateGenerator: vi.fn().mockResolvedValue(CANDIDATE),
      signingKey: Buffer.alloc(32, 7),
      clock: () => 1_800_000_000_000,
    }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Admin-reviewed Foundation learning", () => {
  it("requires separate consent and rejects personal/raw sensitive sources without logging them", async () => {
    const { repository, service } = createService();
    await expect(
      service.preview({ consent: false, sourceText: SOURCE }),
    ).rejects.toMatchObject({ code: "LEARNING_CONSENT_REQUIRED" });

    const privateSource =
      "My private phone number is +1 202 555 0199 and this must remain confidential.";
    const logs = [];
    vi.spyOn(console, "error").mockImplementation((...args) =>
      logs.push(args.join(" ")),
    );
    await expect(
      service.preview({ consent: true, sourceText: privateSource }),
    ).rejects.toMatchObject({ code: "LEARNING_SOURCE_REJECTED" });
    expect(repository.createOrGet).not.toHaveBeenCalled();
    expect(logs.join(" ")).not.toContain(privateSource);
  });

  it("previews without a write and requires the exact explicit approval token", async () => {
    const { repository, service } = createService();
    const preview = await service.preview({
      consent: true,
      sourceText: SOURCE,
    });
    expect(preview.candidate).toEqual(CANDIDATE);
    expect(preview).not.toHaveProperty("sourceText");
    expect(repository.createOrGet).not.toHaveBeenCalled();

    await expect(
      service.approve({
        consent: true,
        candidate: preview.candidate,
        approvalToken: "",
      }),
    ).rejects.toMatchObject({ code: "LEARNING_APPROVAL_REQUIRED" });
    expect(repository.createOrGet).not.toHaveBeenCalled();

    const approved = await service.approve({
      consent: true,
      candidate: preview.candidate,
      approvalToken: preview.approvalToken,
    });
    expect(approved.duplicate).toBe(false);
    expect(repository.createOrGet).toHaveBeenCalledTimes(1);
    expect(repository.createOrGet.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        ...CANDIDATE,
        deduplicationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(
      JSON.stringify(repository.createOrGet.mock.calls[0][0]),
    ).not.toContain(SOURCE);
  });

  it("fails closed when provider output quotes or reproduces the source", async () => {
    const repository = createRepository();
    const quoted = new FoundationLearningService({
      repository,
      candidateGenerator: vi.fn().mockResolvedValue({
        content: `"${SOURCE}"`,
        category: "OPERATING_RULE",
        tags: ["validation"],
      }),
      signingKey: Buffer.alloc(32, 8),
    });
    await expect(
      quoted.preview({ consent: true, sourceText: SOURCE }),
    ).rejects.toMatchObject({ code: "LEARNING_CANDIDATE_REJECTED" });
    expect(repository.createOrGet).not.toHaveBeenCalled();
  });

  it("handles duplicates, lists safe records, and deletes them", async () => {
    const { repository, service } = createService();
    const first = await service.preview({ consent: true, sourceText: SOURCE });
    await service.approve({
      consent: true,
      candidate: first.candidate,
      approvalToken: first.approvalToken,
    });
    const second = await service.preview({ consent: true, sourceText: SOURCE });
    const duplicate = await service.approve({
      consent: true,
      candidate: second.candidate,
      approvalToken: second.approvalToken,
    });
    expect(duplicate.duplicate).toBe(true);
    const records = await service.list();
    expect(records).toHaveLength(1);
    await expect(service.delete(records[0].id)).resolves.toEqual({
      deleted: true,
    });
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.delete).toHaveBeenCalledTimes(1);
  });

  it("ordinary chat never invokes the learning repository", async () => {
    const { repository } = createService();
    vi.spyOn(providerManager, "generateChat").mockResolvedValue({
      content: "ordinary reply",
      provider: { name: "Ollama", type: "local" },
    });
    await chatService.processChatRequest([
      { role: "user", content: "Explain deterministic validation" },
    ]);
    expect(repository.createOrGet).not.toHaveBeenCalled();
  });
});
