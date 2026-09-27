import React from "react";
import {
  render,
  screen,
} from "@testing-library/react";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  RuntimeModelRegistry,
  type RuntimeRegistryModel,
  type RuntimeRoutingSnapshot,
} from "../RuntimeModelRegistry";

const HF_PROVIDER = "Hugging Face";
const OTHER_PROVIDER = "Future Provider";
const FORGE_ID = "hf-qwen25-coder-7b";
const FORGE_MODEL =
  "Qwen/Qwen2.5-Coder-7B-Instruct:fastest";
const PROVIDER_ROUTED = "provider-routed";

const MODELS: RuntimeRegistryModel[] = [
  {
    id: FORGE_ID,
    codename: "Forge",
    displayName: "ORBIS Forge",
    provider: HF_PROVIDER,
    modelId: FORGE_MODEL,
    tasks: ["coding"],
    capabilities: [
      "chat",
      "coding",
      "multilingual",
    ],
    availability: PROVIDER_ROUTED,
    priority: 120,
    enabled: true,
  },
  {
    id: "hf-qwen25-vl-7b",
    codename: "Lens",
    displayName: "ORBIS Lens",
    provider: HF_PROVIDER,
    modelId:
      "Qwen/Qwen2.5-VL-7B-Instruct:fastest",
    tasks: ["vision"],
    capabilities: ["chat", "vision"],
    availability: PROVIDER_ROUTED,
    priority: 100,
    enabled: false,
    disabledReason:
      "MULTIMODAL_MESSAGE_INPUT_NOT_ENABLED",
  },
  {
    id: "future-model",
    displayName: "Future Worker",
    provider: OTHER_PROVIDER,
    modelId: "future/model",
    tasks: ["reasoning"],
    capabilities: ["chat"],
    availability: PROVIDER_ROUTED,
    priority: 90,
    enabled: true,
  },
];

const LAST_ROUTING: RuntimeRoutingSnapshot = {
  status: "success",
  at: "2026-09-27T16:00:00.000Z",
  task: "coding",
  reason: "registry-match",
  registryModelId: FORGE_ID,
  codename: "Forge",
  modelId: FORGE_MODEL,
  provider: HF_PROVIDER,
  source: "model-registry",
  errorCode: null,
  attempts: [
    {
      provider: HF_PROVIDER,
      model: FORGE_MODEL,
      registryModelId: FORGE_ID,
      codename: "Forge",
      status: "success",
      source: "model-registry",
      errorCode: null,
    },
  ],
};

describe("RuntimeModelRegistry", () => {
  it("groups live registry models beneath their provider cards", () => {
    render(
      <RuntimeModelRegistry
        mode="automatic"
        activeProviderName="Ollama"
        providers={[
          {
            name: "Ollama",
            type: "local",
            health: { state: "UNKNOWN" },
          },
          {
            name: HF_PROVIDER,
            type: "cloud",
            health: { state: "HEALTHY" },
          },
        ]}
        models={MODELS}
        lastRouting={LAST_ROUTING}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "AI Providers & Models",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(HF_PROVIDER),
    ).toBeInTheDocument();

    expect(
      screen.getByText(OTHER_PROVIDER),
    ).toBeInTheDocument();

    expect(
      screen.getByText("ORBIS Forge"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(FORGE_MODEL),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Last run succeeded"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Last selected"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Future Worker"),
    ).toBeInTheDocument();
  });

  it("does not fabricate providers or models without runtime data", () => {
    render(
      <RuntimeModelRegistry
        mode={null}
        providers={[]}
        models={[]}
        lastRouting={null}
      />,
    );

    expect(
      screen.getByText(
        "Runtime provider registry unavailable.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "No provider or model is invented by the dashboard.",
      ),
    ).toBeInTheDocument();
  });
});
