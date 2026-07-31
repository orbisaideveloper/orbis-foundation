import { describe, it, expect } from 'vitest';
import { checkPermission, PERMISSIONS } from '../../auth/permissions';
import { Role } from '../../../contracts/admin.contracts';

describe('Permissions Matrix (Step-303)', () => {
  it('grants VIEW_DASHBOARD permission to GUEST', () => {
    expect(checkPermission('GUEST', PERMISSIONS.VIEW_DASHBOARD)).toBe(true);
  });

  it('denies SYSTEM_RESTART permission to GUEST', () => {
    expect(checkPermission('GUEST', PERMISSIONS.SYSTEM_RESTART)).toBe(false);
  });

  it('grants SYSTEM_RESTART permission to SYSTEM role', () => {
    expect(checkPermission('SYSTEM', PERMISSIONS.SYSTEM_RESTART)).toBe(true);
  });

  it('returns false for unknown permission or invalid role fallback', () => {
    expect(checkPermission('GUEST', 'UNKNOWN_PERM')).toBe(false);
    // @ts-ignore - testing fallback behavior
    expect(checkPermission('INVALID_ROLE' as Role, PERMISSIONS.VIEW_DASHBOARD)).toBe(false);
  });
});
