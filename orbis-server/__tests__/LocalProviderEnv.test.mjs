// @vitest-environment node

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  loadLocalProviderEnv,
} = require("../config/LocalProviderEnv.cjs");

const originalHfToken = process.env.HF_TOKEN;
const originalTavilyKey = process.env.TAVILY_API_KEY;

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnv("HF_TOKEN", originalHfToken);
  restoreEnv("TAVILY_API_KEY", originalTavilyKey);
});

describe("LocalProviderEnv", () => {
  it("loads local HF and Tavily provider secrets without overriding existing environment", () => {
    const homeDir = mkdtempSync(
      join(tmpdir(), "orbis-local-provider-env-"),
    );

    try {
      const configDir = join(
        homeDir,
        ".config",
        "orbis",
      );

      mkdirSync(configDir, {
        recursive: true,
      });

      writeFileSync(
        join(configDir, "hf.env"),
        "HF_TOKEN=hf_local_test_token\n",
        "utf8",
      );

      writeFileSync(
        join(configDir, "tavily.env"),
        "TAVILY_API_KEY=tvly_local_test_key\n",
        "utf8",
      );

      process.env.HF_TOKEN =
        "hf_existing_environment_token";

      delete process.env.TAVILY_API_KEY;

      loadLocalProviderEnv({
        homeDir,
      });

      expect(process.env.HF_TOKEN).toBe(
        "hf_existing_environment_token",
      );

      expect(
        process.env.TAVILY_API_KEY,
      ).toBe(
        "tvly_local_test_key",
      );
    } finally {
      rmSync(homeDir, {
        recursive: true,
        force: true,
      });
    }
  });
});
