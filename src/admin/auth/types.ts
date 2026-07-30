export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  RELEASE_MANAGER = 'RELEASE_MANAGER',
  VIEWER = 'VIEWER'
}

export interface AdminUser {
  id: string;
  username: string;
  role: AdminRole;
}

export interface AuthSession {
  user: AdminUser | null;
  isAuthenticated: boolean;
  loginTime: number | null;
}
