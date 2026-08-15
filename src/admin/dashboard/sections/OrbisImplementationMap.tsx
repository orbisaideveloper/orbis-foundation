import React from "react";

type Task = {
  id: string;
  title: string;
  status: "COMPLETED";
  purpose: string;
  logic: string;
  dependency: string;
  files: string[];
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
  },
];

export default function OrbisImplementationMap() {
  return (
    <section
      data-testid="orbis-implementation-map"
      className="rounded-2xl border border-white/10 bg-black/20 p-5"
    >
      <div className="mb-5">
        <h2 className="text-lg font-semibold">ORBIS Implementation Map</h2>
        <p className="mt-1 text-sm opacity-70">
          Persistent implementation chain — completed tasks remain visible.
        </p>
      </div>

      <div className="space-y-3">
        {TASKS.map((task, index) => (
          <article
            key={task.id}
            data-testid={`task-${task.id}`}
            className="rounded-xl border border-white/10 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold">{task.id}</span>
                <span className="ml-2 opacity-80">{task.title}</span>
              </div>

              <span className="rounded-full border border-green-500/30 px-2 py-1 text-xs">
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
                <div className="text-xs uppercase opacity-50">Source Files</div>
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
          </article>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-white/10 p-4">
        <div className="text-xs uppercase opacity-50">Implementation Chain</div>
        <div className="mt-2 text-sm font-medium">
          TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005
        </div>
        <div className="mt-2 text-xs opacity-60">
          Future TASK-006+ will append to this chain.
        </div>
      </div>

      <div
        data-testid="runtime-reality"
        className="mt-4 rounded-xl border border-white/10 p-4"
      >
        <div className="text-xs uppercase opacity-50">
          Runtime / Source Reality
        </div>

        <div className="mt-2 text-sm">
          Termux Runtime source:
          <span className="ml-2 font-medium">
            src/core/execution/runtimes/TermuxRuntime.ts
          </span>
        </div>

        <div className="text-sm">
          Termux Runtime Service:
          <span className="ml-2 font-medium">
            src/core/execution/runtimes/TermuxRuntimeService.ts
          </span>
        </div>

        <div className="mt-2 text-xs opacity-60">
          This panel reports the implementation/source state. It does not
          execute shell commands merely to render the dashboard.
        </div>
      </div>
    </section>
  );
}
