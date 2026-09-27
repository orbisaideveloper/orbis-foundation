const TRACE_VERSION = 1;
const MAX_TRACE_ATTEMPTS = 4;
const ORBIS_BRAIN_NAME = "ORBIS Brain";

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function safeString(value, maximum = 160) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maximum);
}

function safeDuration(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function normalizeAttempt(rawAttempt) {
  if (!plainObject(rawAttempt)) return null;

  const status =
    rawAttempt.status === "success" ? "success" : "failed";

  return {
    kind: "model",
    actor:
      safeString(rawAttempt.codename) ||
      safeString(rawAttempt.provider) ||
      "model",
    provider: safeString(rawAttempt.provider),
    providerType: safeString(rawAttempt.providerType),
    model: safeString(rawAttempt.model),
    registryModelId: safeString(rawAttempt.registryModelId),
    codename: safeString(rawAttempt.codename),
    source: safeString(rawAttempt.source),
    status,
    durationMs: safeDuration(rawAttempt.durationMs),
    errorCode:
      status === "failed"
        ? safeString(rawAttempt.errorCode)
        : null,
  };
}

function selectedWorker(provider) {
  const routing = plainObject(provider?.routing)
    ? provider.routing
    : {};

  return {
    name:
      safeString(routing.codename) ||
      safeString(provider?.name) ||
      ORBIS_BRAIN_NAME,
    provider: safeString(provider?.name),
    providerType: safeString(provider?.type),
    model:
      safeString(provider?.model) ||
      safeString(routing.modelId),
    registryModelId: safeString(routing.registryModelId),
    codename: safeString(routing.codename),
    source: safeString(routing.source),
  };
}

function normalizeAgentToolStep(rawStep) {
  if (!plainObject(rawStep)) return null;

  const status =
    rawStep.status === "success"
      ? "success"
      : rawStep.status === "rejected"
        ? "rejected"
        : "failed";

  return {
    kind: "tool",
    actor: "ORBIS Tool",
    tool: safeString(rawStep.name),
    status,
    durationMs: safeDuration(rawStep.durationMs),
    errorCode:
      status === "success"
        ? null
        : safeString(rawStep.errorCode),
  };
}

function summarizeAgent(agent) {
  if (!plainObject(agent)) return null;

  const rawIterations = Number(agent.iterations);
  const rawToolBudget = Number(agent.toolBudget);

  return {
    task: safeString(agent.task),
    status: safeString(agent.status),
    iterations:
      Number.isSafeInteger(rawIterations) &&
      rawIterations >= 0
        ? rawIterations
        : 0,
    toolBudget:
      Number.isSafeInteger(rawToolBudget) &&
      rawToolBudget >= 0
        ? rawToolBudget
        : 0,
  };
}

function capabilityStep(execution) {
  if (!plainObject(execution)) return null;

  return {
    kind: "capability",
    actor:
      safeString(execution.runtime) ||
      "ORBIS Runtime",
    capabilityId: safeString(execution.capabilityId),
    requestId: safeString(execution.requestId),
    runtime: safeString(execution.runtime),
    status: execution.approvalRequired
      ? "approval-required"
      : execution.success
        ? "success"
        : "failed",
    durationMs: safeDuration(execution.durationMs),
    errorCode: safeString(execution.errorCode),
  };
}

function finalStatus(provider, execution) {
  if (plainObject(execution)) {
    if (execution.approvalRequired) {
      return "approval-required";
    }

    return execution.success
      ? "completed"
      : "failed";
  }

  const type = safeString(provider?.type) || "";

  if (type.includes("CLARIFICATION")) {
    return "needs-input";
  }

  if (
    type.includes("UNAVAILABLE") ||
    type.includes("INVALID")
  ) {
    return "unavailable";
  }

  return "completed";
}

function buildExecutionTrace({
  decision,
  response,
  routingDurationMs,
} = {}) {
  const provider = plainObject(response?.provider)
    ? response.provider
    : {};

  const routing = plainObject(provider.routing)
    ? provider.routing
    : {};

  const attempts = (
    Array.isArray(routing.attempts)
      ? routing.attempts.slice(0, MAX_TRACE_ATTEMPTS)
      : []
  )
    .map(normalizeAttempt)
    .filter(Boolean);

  const agent = plainObject(response?.agent)
    ? response.agent
    : null;

  const agentToolSteps = (
    Array.isArray(agent?.tools)
      ? agent.tools.slice(0, MAX_TRACE_ATTEMPTS)
      : []
  )
    .map(normalizeAgentToolStep)
    .filter(Boolean);

  const steps = [
    {
      kind: "orchestrator",
      actor: ORBIS_BRAIN_NAME,
      action: "route",
      status: "completed",
      durationMs: safeDuration(routingDurationMs),
    },
    ...attempts,
    ...agentToolSteps,
  ];

  const execution = plainObject(response?.execution)
    ? response.execution
    : null;

  const executionStep = capabilityStep(execution);

  if (executionStep) {
    steps.push(executionStep);
  }

  return {
    version: TRACE_VERSION,
    orchestrator: {
      name: ORBIS_BRAIN_NAME,
      role: "orchestrator",
    },
    route: {
      id: safeString(decision?.route),
      intent: safeString(decision?.intent),
      confidence: safeString(decision?.confidence),
      reason: safeString(decision?.reason),
      capabilityId: safeString(decision?.capabilityId),
    },
    task:
      safeString(agent?.task) ||
      safeString(routing.task),
    selectedWorker: selectedWorker(provider),
    agent: summarizeAgent(agent),
    steps,
    finalStatus: finalStatus(provider, execution),
  };
}

module.exports = {
  MAX_TRACE_ATTEMPTS,
  TRACE_VERSION,
  buildExecutionTrace,
};
