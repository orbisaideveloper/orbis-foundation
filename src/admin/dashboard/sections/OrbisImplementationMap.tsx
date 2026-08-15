import React, { useState } from "react";

type Task = {
  id: string;
  title: string;
  status: "COMPLETED";
  purpose: string;
  logic: string;
  dependency: string;
  files: string[];
  auditFile: string;
};

const TASKS: Task[] = [
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
      "src/core/execution/runtimes/TermuxRuntimeService.ts",
      "orbis-server/bridge.cjs",
    ],
    auditFile: "docs/AUDIT_REPORTS/006_2026-08-15_10-50-00.md",
  },
  {
    id: "TASK-007",
    title: "Controlled Termux Capability Execution + Real Output",
    status: "COMPLETED",
    purpose:
      "Invoke explicitly authorized capabilities safely and receive real structured runtime results.",
    logic:
      "Executes termux.system.info capability via strict execution policy without shell/spawn access.",
    dependency: "TASK-006",
    files: [
      "src/core/execution/runtimes/TermuxRuntime.ts",
      "src/core/execution/runtimes/TermuxRuntimeService.ts",
      "orbis-server/bridge.cjs",
    ],
    auditFile: "docs/AUDIT_REPORTS/007_2026-08-15_13-36-41.md",
  },
];

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
FILES:
${task.files.map((f) => `- ${f}`).join("\n")}
AUDIT FILE: ${task.auditFile}
    `.trim();

    navigator.clipboard.writeText(details);
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
              onClick={() => setSelectedTask(null)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
            >
              ← BACK
            </button>
            <button
              onClick={() => handleCopyDetails(selectedTask)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium hover:bg-blue-500"
            >
              {copied ? "COPIED!" : "COPY TASK DETAIL"}
            </button>
          </div>

          <h3 className="text-xl font-bold">
            {selectedTask.id}: {selectedTask.title}
          </h3>
          <span className="mt-2 inline-block rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-xs text-green-400">
            {selectedTask.status}
          </span>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase opacity-50 font-semibold">
                Purpose
              </div>
              <p>{selectedTask.purpose}</p>
            </div>
            <div>
              <div className="text-xs uppercase opacity-50 font-semibold">
                Core Logic
              </div>
              <p>{selectedTask.logic}</p>
            </div>
            <div>
              <div className="text-xs uppercase opacity-50 font-semibold">
                Dependency
              </div>
              <p>{selectedTask.dependency}</p>
            </div>
            <div>
              <div className="text-xs uppercase opacity-50 font-semibold">
                Source Files
              </div>
              <ul className="mt-1 space-y-1">
                {selectedTask.files.map((file) => (
                  <li key={file} className="font-mono text-xs opacity-80">
                    {file}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase opacity-50 font-semibold">
                Audit File
              </div>
              <p className="font-mono text-xs opacity-80">
                {selectedTask.auditFile}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {TASKS.map((task, index) => (
            <div
              key={task.id}
              data-testid={`task-${task.id}`}
              onClick={() => setSelectedTask(task)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedTask(task);
                }
              }}
              role="button"
              tabIndex={0}
              className="cursor-pointer text-left block w-full rounded-xl border border-white/10 p-4 transition-all hover:border-white/30 hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-white/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{task.id}</span>
                  <span className="ml-2 opacity-80">{task.title}</span>
                </div>

                <span className="rounded-full border border-green-500/30 px-2 py-1 text-xs text-green-400">
                  {task.status}
                </span>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase opacity-50">Purpose</div>
                  <div className="text-sm">{task.purpose}</div>
                </div>

                <div>
                  <div className="text-xs uppercase opacity-50">Core Logic</div>
                  <div className="text-sm">{task.logic}</div>
                </div>

                <div>
                  <div className="text-xs uppercase opacity-50">Dependency</div>
                  <div className="text-sm">{task.dependency}</div>
                </div>

                <div>
                  <div className="text-xs uppercase opacity-50">
                    Source Files
                  </div>
                  <div className="mt-1 space-y-1 text-sm">
                    {task.files.map((file) => (
                      <div key={file} className="break-all opacity-80">
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {index < TASKS.length - 1 && (
                <div className="mt-3 text-center text-xs opacity-30">↓</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-white/10 p-4">
        <div className="text-xs uppercase opacity-50">Implementation Chain</div>
        <div className="mt-2 text-sm font-medium">
          TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005 → TASK-006 →
          TASK-007
        </div>
      </div>
    </section>
  );
}
