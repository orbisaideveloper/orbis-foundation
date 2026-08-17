import { randomBytes } from "node:crypto";
import { IExecutionRequest } from "../interfaces/IExecutionRequest";

export type ApprovalResolution =
  "APPROVED" | "REJECTED" | "EXPIRED" | "INVALID" | "REPLAY";

export interface PendingApproval {
  readonly token: string;
  readonly runtimeId: string;
  readonly capabilityId: string;
  readonly input: Record<string, any>;
  readonly requestId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  consumed: boolean;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {}));
}

export class PendingApprovalStore {
  private readonly entries = new Map<string, PendingApproval>();

  constructor(private readonly ttlMs = 3 * 60 * 1000) {}

  create(request: IExecutionRequest): PendingApproval {
    const now = Date.now();
    const entry: PendingApproval = {
      token: randomBytes(32).toString("base64url"),
      runtimeId: request.requestedRuntime ?? "TermuxRuntime",
      capabilityId: request.capability,
      input: clone(request.input),
      requestId: request.requestId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      consumed: false,
    };
    this.entries.set(entry.token, entry);
    return { ...entry, input: clone(entry.input) };
  }

  resolve(
    token: string,
    decision: "APPROVE" | "REJECT",
  ): { resolution: ApprovalResolution; request?: IExecutionRequest } {
    const entry = this.entries.get(String(token ?? "").trim());
    if (!entry) return { resolution: "INVALID" };
    if (entry.consumed) return { resolution: "REPLAY" };
    if (Date.now() >= entry.expiresAt) {
      entry.consumed = true;
      return { resolution: "EXPIRED" };
    }
    entry.consumed = true;
    if (decision === "REJECT") return { resolution: "REJECTED" };

    return {
      resolution: "APPROVED",
      request: {
        requestId: entry.requestId,
        capability: entry.capabilityId,
        input: clone(entry.input),
        requestedRuntime: entry.runtimeId,
        metadata: {
          approvalToken: entry.token,
          approvalGranted: true,
          originatingApprovalRequestId: entry.requestId,
        },
      },
    };
  }

  clear(): void {
    this.entries.clear();
  }
}

export const pendingApprovalStore = new PendingApprovalStore();
