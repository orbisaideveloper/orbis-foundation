// @vitest-environment node
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const bank = require("../ai/bengali/BengaliExamples.cjs");
const entries = require("../ai/bengali/examples.json");
const INVALID = "BANGLA_EXAMPLE_INVALID";
const EXPORT_SCRIPT = "../ai/bengali/export-training.cjs";
afterEach(() => vi.restoreAllMocks());

it("rejects malformed Bengali rule identities, status, fields and variants", () => {
  for (const entry of [null, { ...entries[0], id: 7 }, { ...entries[0], status: "unreviewed" }]) {
    expect(() => bank.validateExamples([entry])).toThrow(INVALID);
  }
  expect(() => bank.validateExamples([entries[0], entries[0]])).toThrow(INVALID);
  for (const field of ["intent", "context", "meaning", "response", "source"]) {
    for (const value of [null, " ", "x".repeat(1501)]) {
      expect(() => bank.validateExamples([{ ...entries[0], [field]: value }])).toThrow(INVALID);
    }
  }
  for (const variants of [null, []]) {
    expect(() => bank.validateExamples([{ ...entries[0], variants }])).toThrow(INVALID);
  }
  for (const variants of [["!!!"], ["বাংলা".repeat(110)]]) {
    expect(() => bank.validateExamples([{ ...entries[0], variants }])).toThrow("BANGLA_EXAMPLE_DUPLICATE");
  }
  expect(bank.normalize(null)).toBe("");
  expect(bank.selectExamples([])).toEqual([]);
});

it("exports approved examples privately and refuses missing or existing output paths", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "orbis-bengali-export-"));
  const target = path.join(directory, "approved.jsonl");
  const originalArgs = process.argv;
  const moduleId = require.resolve(EXPORT_SCRIPT);
  const originalModule = require.cache[moduleId];
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const execute = argument => {
    delete require.cache[moduleId];
    process.argv = argument ? ["node", moduleId, argument] : ["node", moduleId];
    return require(EXPORT_SCRIPT);
  };
  try {
    expect(() => execute()).toThrow("Provide a new output filename");
    execute(target);
    const content = fs.readFileSync(target, "utf8");
    expect(content.endsWith("\n")).toBe(true);
    expect(content.trim().split("\n").map(row => JSON.parse(row))).toEqual(bank.trainingRows());
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    expect(log).toHaveBeenCalledWith("Approved Bengali examples exported; training has not run.");
    expect(() => execute(target)).toThrow("existing files are preserved");
    expect(fs.readFileSync(target, "utf8")).toBe(content);
  } finally {
    process.argv = originalArgs;
    delete require.cache[moduleId];
    if (originalModule) require.cache[moduleId] = originalModule;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it("keeps unmatched Foundation requests out of Bengali example injection", async () => {
  const { AIChatService } = require("../ai/AIChatService.cjs");
  const run = vi.fn().mockResolvedValue({ content: "A plain answer" });
  const service = new AIChatService({ agentLoop: { run } });
  const result = await service.executeProviderFallback([{ role: "user", content: "Hello" }], null, "Hello");
  expect(run.mock.calls[0][0].some(message => message.content.includes("Reviewed Bengali language examples"))).toBe(false);
  expect(result.message.content).toBe("A plain answer");
});
