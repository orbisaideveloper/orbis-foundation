// ==========================================
// 1. SECURITY & AUTH CONTRACTS
// ==========================================
export type Role = 'GUEST' | 'OPERATOR' | 'ADMIN' | 'SYSTEM';

export interface IAuthService {
  user: string | null;
  role: Role;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
  hasPermission: (permissionId: string) => boolean;
}

// ==========================================
// 2. RUNTIME & SYSTEM HEALTH CONTRACTS
// ==========================================
export type SystemStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN' | 'DEGRADED';

export interface IRuntimeService {
  engineStatus: SystemStatus;
  brainStatus: SystemStatus;
  cpuUsage: number;    // Percentage 0-100
  memoryUsage: number; // Percentage 0-100
}

// ==========================================
// 3. RELEASE PIPELINE CONTRACTS
// ==========================================
export type ReleaseState = 'NO ACTIVE RELEASE' | 'PREPARING' | 'TESTING' | 'DEPLOYING' | 'STABLE';

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
