// ==========================================
// 1. SECURITY & AUTH CONTRACTS
// ==========================================
export type Role = "GUEST" | "OPERATOR" | "ADMIN" | "SYSTEM";

export interface AdminAccessResponse {
  success: true;
  role: "ADMIN";
}

export interface IAuthService {
  user: string | null;
  role: Role;
  isAuthenticated: boolean;
  isLoading?: boolean;
  isSubmitting?: boolean;
  authError?: string | null;
  signupStatus?: "IDLE" | "CONFIRMATION_SENT" | "ALREADY_REGISTERED";
  login: (email: string, password?: string) => void | Promise<void>;
  createAdminAccount?: (
    password: string,
    passwordConfirmation: string,
  ) => void | Promise<void>;
  clearAuthFeedback?: () => void;
  logout: () => void | Promise<void>;
  hasPermission: (permissionId: string) => boolean;
}

// ==========================================
// 2. RUNTIME & SYSTEM HEALTH CONTRACTS
// ==========================================
export type SystemStatus = "ONLINE" | "OFFLINE" | "UNKNOWN" | "DEGRADED";

export interface IRuntimeService {
  engineStatus: SystemStatus;
  brainStatus: SystemStatus;
  cpuUsage: number; // Percentage 0-100
  memoryUsage: number; // Percentage 0-100
}

// ==========================================
// 3. RELEASE PIPELINE CONTRACTS
// ==========================================
export type ReleaseState =
  "NO ACTIVE RELEASE" | "PREPARING" | "TESTING" | "DEPLOYING" | "STABLE";

export interface IReleaseService {
  status: ReleaseState;
  version: string | null;
  initiateDraft: () => void;
}

// ==========================================
// 4. MASTER ADMIN SERVICE CONTRACT (For UI)
// ==========================================
// The Dashboard will strictly consume this single interface.
// It acts as the facade for all underlying subsystems.
export interface IAdminService {
  auth: IAuthService;
  runtime: IRuntimeService;
  release: IReleaseService;
}
