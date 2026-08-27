import { randomBytes } from "node:crypto";
import { IExecutionRequest } from "../interfaces/IExecutionRequest";

export type ApprovalResolution =
  "APPROVED" | "REJECTED" | "EXPIRED" | "INVALID" | "REPLAY";

/**
 * TASK-020 (Part 3) — explicit approval-token lifecycle.
 *
 *   PENDING  - created, waiting for a human APPROVE/REJECT decision. Also
 *              the state a token returns to after a RESERVED execution
 *              attempt fails for a transient/environmental reason (bridge
 *              unreachable, runtime not yet ready), so a still-valid,
 *              already-approved token is never silently lost — it can be
 *              retried within its original TTL instead of forcing the
 *              caller to restart the whole request/approval cycle.
 *   RESERVED - a human has explicitly APPROVEd the token and the caller
 *              (TermuxRuntimeService) is actively re-authorizing/
 *              executing it. A RESERVED token cannot be resolved again
 *              (prevents double-execution / replay) until it is
 *              finalized via confirm() or returned to PENDING via
 *              release().
 *   CONSUMED - terminal. Reached by REJECT, EXPIRED, INVALID/REPLAY
 *              lookups, or an approved execution that reached a final,
 *              non-transient outcome (it executed, or was authoritatively
 *              denied for a reason that would not change on retry).
 */
export type ApprovalTokenStatus = "PENDING" | "RESERVED" | "CONSUMED";

// Lint (sonarjs/no-duplicate-string): named once, reused everywhere below
// instead of repeating each status literal at every call site.
const STATUS_PENDING: ApprovalTokenStatus = "PENDING";
const STATUS_RESERVED: ApprovalTokenStatus = "RESERVED";
const STATUS_CONSUMED: ApprovalTokenStatus = "CONSUMED";

export interface PendingApproval {
  readonly token: string;
  readonly runtimeId: string;
  readonly capabilityId: string;
  readonly input: Record<string, any>;
  readonly requestId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  status: ApprovalTokenStatus;
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
      status: STATUS_PENDING,
    };
    this.entries.set(entry.token, entry);
    return { ...entry, input: clone(entry.input) };
  }

  /**
   * Resolves a human APPROVE/REJECT decision against a token.
   *
   * TASK-020 (Part 3): an APPROVE decision no longer immediately/
   * irreversibly consumes the token — it transitions PENDING -> RESERVED
   * and returns the request so the caller can attempt re-authorization/
   * execution. The caller MUST follow up with exactly one of
   * confirm(token) (final, non-transient outcome) or release(token)
   * (transient/environmental failure) once that attempt concludes.
   * REJECT remains an immediate, final decision — there is nothing left
   * to attempt, so it goes straight to CONSUMED, same as before.
   */
  resolve(
    token: string,
    decision: "APPROVE" | "REJECT",
  ): { resolution: ApprovalResolution; request?: IExecutionRequest } {
    const entry = this.entries.get(String(token ?? "").trim());
    if (!entry) return { resolution: "INVALID" };
    if (entry.status !== STATUS_PENDING) return { resolution: "REPLAY" };
    if (Date.now() >= entry.expiresAt) {
      entry.status = STATUS_CONSUMED;
      return { resolution: "EXPIRED" };
    }

    if (decision === "REJECT") {
      entry.status = STATUS_CONSUMED;
      return { resolution: "REJECTED" };
    }

    // APPROVE: reserve — a concurrent second resolve() call for the same
    // token now sees status !== "PENDING" and gets REPLAY, so this is
    // still exactly one authorized attempt per token, same guarantee as
    // before. The difference is this is not yet a *terminal* state.
    entry.status = STATUS_RESERVED;

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

  /**
   * Finalizes a RESERVED token as terminally used. Call once the
   * approved request has reached a final, non-transient outcome (it
   * executed, or was authoritatively denied for a reason that will not
   * change on retry — e.g. the capability was disabled). No-op (returns
   * false) if the token is not currently RESERVED, so it is safe to call
   * defensively from every return path.
   */
  confirm(token: string): boolean {
    const entry = this.entries.get(String(token ?? "").trim());
    if (entry?.status !== STATUS_RESERVED) return false;
    entry.status = STATUS_CONSUMED;
    return true;
  }

  /**
   * Releases a RESERVED token back to PENDING after a transient/
   * environmental failure (bridge unreachable, runtime not yet ready) so
   * the human's already-granted approval is not lost — the SAME token
   * can be resolved again within its original TTL instead of the caller
   * having to restart the whole request/approval cycle. No-op (returns
   * false) if the token is not currently RESERVED or has since expired
   * (in which case it is finalized as CONSUMED instead).
   */
  release(token: string): boolean {
    const entry = this.entries.get(String(token ?? "").trim());
    if (entry?.status !== STATUS_RESERVED) return false;
    if (Date.now() >= entry.expiresAt) {
      entry.status = STATUS_CONSUMED;
      return false;
    }
    entry.status = STATUS_PENDING;
    return true;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const pendingApprovalStore = new PendingApprovalStore();
