import React, { useState } from "react";

export type Task = {
  id: string;
  title: string;
  status: string;
  purpose: string;
  logic: string;
  dependency: string;
  files: string[];
  testsCoverage: string;
  buildTypeCheck: string;
  securityArchitecture: string;
  realOutput: string;
  commit: string;
  auditFile: string;
};

const AUDIT_FALLBACK = "Recorded in audit";
const TASK_PENDING_VERIFICATION = "Pending real Termux verification";

const FILE_TERMUX_RUNTIME_SERVICE =
  "src/core/execution/runtimes/TermuxRuntimeService.ts";

const defaultOldTaskData = {
  testsCoverage: AUDIT_FALLBACK,
  buildTypeCheck: AUDIT_FALLBACK,
  securityArchitecture: AUDIT_FALLBACK,
  realOutput: AUDIT_FALLBACK,
  commit: AUDIT_FALLBACK,
};

export const TASKS: Task[] = [
  {
    id: "TASK-001",
    title: "Local Execution Abstraction",
    status: "COMPLETED",
    purpose: "Establish the provider-independent execution foundation.",
    logic: "Defines the contracts required by controlled local runtimes.",
    dependency: "Foundation",
    files: [
      "src/core/execution/interfaces/IExecutionPolicy.ts",
      "src/core/execution/interfaces/IExecutionRequest.ts",
      "src/core/execution/interfaces/IExecutionResult.ts",
      "src/core/execution/interfaces/IExecutionRuntime.ts",
    ],
    auditFile: "docs/AUDIT_REPORTS/001_2026-08-13_23-18-27.md",
    ...defaultOldTaskData,
  },
  {
    id: "TASK-002",
    title: "Execution Policy + Runtime Registry",
    status: "COMPLETED",
    purpose:
      "Register capabilities/runtimes and make deterministic policy decisions.",
    logic:
      "Unknown capabilities/runtimes are denied; sensitive operations require approval.",
    dependency: "TASK-001",
    files: [
      "src/core/execution/registry/CapabilityModel.ts",
      "src/core/execution/registry/RuntimeRegistry.ts",
      "src/core/execution/policy/ExecutionPolicyEngine.ts",
    ],
    auditFile: "docs/AUDIT_REPORTS/002_2026-08-14_00-33-15.md",
    ...defaultOldTaskData,
  },
  {
    id: "TASK-003",
    title: "Runtime Lifecycle + Health",
    status: "COMPLETED",
    purpose: "Control runtime lifecycle and health state.",
    logic: "Runtime state transitions and health verification are enforced.",
    dependency: "TASK-002",
    files: [
      "src/core/execution/lifecycle/LifecycleState.ts",
      "src/core/execution/lifecycle/RuntimeHealth.ts",
      "src/core/execution/lifecycle/RuntimeLifecycleManager.ts",
    ],
    auditFile: "docs/AUDIT_REPORTS/003_2026-08-14_00-43-42.md",
    ...defaultOldTaskData,
  },
  {
    id: "TASK-004",
    title: "Secure Execution Authorization Gate",
    status: "COMPLETED",
    purpose: "Provide the final authorization barrier before execution.",
    logic:
      "Authorization is checked before a capability can reach a concrete runtime.",
    dependency: "TASK-003",
    files: [
      "src/core/execution/authorization/SecureExecutionAuthorizationGate.ts",
    ],
    auditFile: "docs/AUDIT_REPORTS/004_2026-08-14_08-39-23.md",
    ...defaultOldTaskData,
  },
  {
    id: "TASK-005",
    title: "Local Runtime Observability",
    status: "COMPLETED",
    purpose: "Expose the execution foundation through the Admin Dashboard.",
    logic:
      "Shows execution/security/runtime state without replacing the execution architecture.",
    dependency: "TASK-004",
    files: [
      "src/admin/dashboard/AdminDashboard.tsx",
      "src/admin/dashboard/sections/LocalRuntime.tsx",
    ],
    auditFile: "docs/AUDIT_REPORTS/005_2026-08-14_12-08-43.md",
    ...defaultOldTaskData,
  },
  {
    id: "TASK-006",
    title: "Real Termux Runtime Bridge + Capability Handshake",
    status: "COMPLETED",
    purpose:
      "Connect ORBIS execution foundation to real Termux runtime bridge.",
    logic:
      "Establishes identity verification, capability discovery handshake, and health verification.",
    dependency: "TASK-005",
    files: [
      "src/core/execution/runtimes/TermuxRuntime.ts",
      FILE_TERMUX_RUNTIME_SERVICE,
      "orbis-server/bridge.cjs",
    ],
    auditFile: "docs/AUDIT_REPORTS/006_2026-08-15_10-50-00.md",
    ...defaultOldTaskData,
  },
  {
    id: "TASK-007",
    title: "Controlled Termux Capability Execution + Real Output",
    status: "COMPLETED",
    purpose:
      "Invoke explicitly authorized Termux capabilities safely and receive real structured runtime results.",
    logic:
      "Controlled execution of termux.system.info through the registered runtime, ExecutionPolicyEngine and SecureExecutionAuthorizationGate, returning structured runtime output without shell/spawn execution.",
    dependency: "TASK-006",
    files: [
      "src/core/execution/runtimes/TermuxRuntime.ts",
      FILE_TERMUX_RUNTIME_SERVICE,
      "orbis-server/bridge.cjs",
    ],
    testsCoverage: AUDIT_FALLBACK,
    buildTypeCheck: AUDIT_FALLBACK,
    securityArchitecture: AUDIT_FALLBACK,
    realOutput: AUDIT_FALLBACK,
    commit: "7100abd",
    auditFile: "docs/AUDIT_REPORTS/007_2026-08-15_14-31-00.md",
  },
  {
    id: "TASK-008",
    title: "Brain <-> Local Termux Capability Discovery Integration",
    status: "COMPLETED",
    purpose:
      "Give the ORBIS Brain a provider-independent boundary to ask what local capabilities are currently available, without knowing about Termux HTTP endpoints.",
    logic:
      "LocalCapabilityDiscovery wraps the existing TermuxRuntimeService.check() (TASK-006/TASK-007 handshake) and returns a structured, deterministic CapabilityDiscoveryResult. Discovery only — no capability execution, no new Termux bridge, no direct HTTP access from the Brain layer.",
    dependency: "TASK-007",
    files: [
      "src/core/brain/LocalCapabilityDiscovery.ts",
      FILE_TERMUX_RUNTIME_SERVICE,
    ],
    testsCoverage: AUDIT_FALLBACK,
    buildTypeCheck: AUDIT_FALLBACK,
    securityArchitecture: AUDIT_FALLBACK,
    realOutput: AUDIT_FALLBACK,
    commit: AUDIT_FALLBACK,
    auditFile: "docs/AUDIT_REPORTS/008_PENDING_LOCAL_VERIFICATION.md",
  },
  {
    id: "TASK-010",
    title: "Brain Controlled Capability Execution Integration",
    status: "IMPLEMENTING",
    purpose:
      "Compose Brain capability discovery with the existing controlled execution boundary.",
    logic:
      "BrainCapabilityOrchestrator discovers current local capabilities via LocalCapabilityDiscovery, verifies the requested capability is currently discoverable, constructs the existing IExecutionRequest contract, and delegates to ControlledCapabilityExecution -> TermuxRuntimeService.executeCapability(). Orchestration only — no new policy engine, authorization gate, registry, lifecycle manager, or Termux bridge.",
    dependency: "TASK-009",
    files: [
      "src/core/brain/BrainCapabilityOrchestrator.ts",
      "src/core/brain/__tests__/BrainCapabilityOrchestrator.test.ts",
    ],
    testsCoverage: TASK_PENDING_VERIFICATION,
    buildTypeCheck: TASK_PENDING_VERIFICATION,
    securityArchitecture:
      "Approved orchestration-only design; TASK-009 remains the authorization boundary.",
    realOutput: TASK_PENDING_VERIFICATION,
    commit: "Pending approval and verified commit",
    auditFile: "docs/AUDIT_REPORTS/010_PENDING_LOCAL_VERIFICATION.md",
  },
];

const ExpandableCard = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <details className="group mt-2 rounded-lg border border-white/10 bg-black/20">
    <summary className="cursor-pointer px-4 py-2 text-xs font-semibold uppercase opacity-70 transition-colors group-open:border-b group-open:border-white/10 hover:bg-white/5">
      {title}
    </summary>
    <div className="p-4 text-sm opacity-90">{children}</div>
  </details>
);

export default function OrbisImplementationMap() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyDetails = (task: Task) => {
    const details = `
TASK ID: ${task.id}
TITLE: ${task.title}
STATUS: ${task.status}
PURPOSE: ${task.purpose}
CORE LOGIC: ${task.logic}
DEPENDENCY: ${task.dependency}
SOURCE FILES:
${task.files.map((file) => `- ${file}`).join("\n")}
TESTS & COVERAGE: ${task.testsCoverage}
BUILD & TYPE CHECK: ${task.buildTypeCheck}
SECURITY & ARCHITECTURE: ${task.securityArchitecture}
REAL OUTPUT / RESULT: ${task.realOutput}
COMMIT: ${task.commit}
AUDIT FILE: ${task.auditFile}
    `.trim();

    void navigator.clipboard.writeText(details);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section
      data-testid="orbis-implementation-map"
      className="rounded-2xl border border-white/10 bg-black/20 p-5"
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">ORBIS Implementation Map</h2>
          <p className="mt-1 text-sm opacity-70">
            Persistent implementation chain — completed tasks remain visible (
            {TASKS.length}/{TASKS.length}).
          </p>
        </div>
      </div>

      {selectedTask ? (
        <div className="rounded-xl border border-white/20 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedTask(null)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
            >
              ← BACK
            </button>

            <button
              type="button"
              onClick={() => handleCopyDetails(selectedTask)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium hover:bg-blue-500"
            >
              {copied ? "COPIED!" : "COPY"}
            </button>
          </div>

          <h3 className="text-xl font-bold">
            {selectedTask.id}: {selectedTask.title}
          </h3>

          <span className="mt-2 inline-block rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-xs text-green-400">
            {selectedTask.status}
          </span>

          <div className="mt-6">
            <div className="mb-4 rounded-lg bg-black/30 p-4">
              <div className="mb-1 text-xs font-semibold uppercase opacity-50">
                Core Logic / Summary
              </div>
              <p className="text-sm">{selectedTask.logic}</p>
            </div>

            <ExpandableCard title="Dependency">
              <p>{selectedTask.dependency}</p>
            </ExpandableCard>

            <ExpandableCard title="Source Files">
              <ul className="space-y-1 font-mono text-xs">
                {selectedTask.files.map((file) => (
                  <li key={file}>- {file}</li>
                ))}
              </ul>
            </ExpandableCard>

            <ExpandableCard title="Tests & Coverage">
              <p>{selectedTask.testsCoverage}</p>
            </ExpandableCard>

            <ExpandableCard title="Build & Type Check">
              <p>{selectedTask.buildTypeCheck}</p>
            </ExpandableCard>

            <ExpandableCard title="Security & Architecture">
              <p>{selectedTask.securityArchitecture}</p>
            </ExpandableCard>

            <ExpandableCard title="Real Output / Result">
              <p>{selectedTask.realOutput}</p>
            </ExpandableCard>

            <ExpandableCard title="Commit & Audit Info">
              <p>
                <strong>Commit:</strong> {selectedTask.commit}
              </p>
              <p>
                <strong>Audit File:</strong>{" "}
                <span className="font-mono text-xs">
                  {selectedTask.auditFile}
                </span>
              </p>
            </ExpandableCard>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {TASKS.map((task, index) => (
            <div key={task.id}>
              <button
                type="button"
                data-testid={`task-${task.id}`}
                onClick={() => setSelectedTask(task)}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 p-4 text-left transition-all hover:border-white/30 hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-white/50"
              >
                <div>
                  <span className="font-semibold">{task.id}</span>
                  <span className="ml-3 opacity-80">{task.title}</span>
                </div>

                <span className="rounded-full border border-green-500/30 px-2 py-1 text-xs text-green-400">
                  {task.status}
                </span>
              </button>

              {index < TASKS.length - 1 && (
                <div className="mt-3 text-center text-xs opacity-30">↓</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-white/10 p-4">
        <div className="text-xs uppercase opacity-50">Implementation Chain</div>

        <div className="mt-2 text-sm font-medium opacity-80">
          {TASKS.map((task) => task.id).join(" → ")}
        </div>
      </div>
    </section>
  );
}
