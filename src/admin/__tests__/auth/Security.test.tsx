import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import AuthGuard from '../../auth/AuthGuard';
import { AdminRole } from '../../auth/types';
import React from 'react';

// Helper component to trigger login and navigation inside tests
const TestLoginTrigger = ({ role }: { role: AdminRole }) => {
  const { login } = useAuth();
  const navigate = useNavigate();
  return (
    <button onClick={() => {
      login({ id: 'u1', username: 'test', role });
      navigate('/role-protected'); // লগইন করার পর প্রটেক্টেড পেজে যাওয়ার চেষ্টা করবে
    }}>
      Log In As {role}
    </button>
  );
};

describe('Security Foundation (Step-303)', () => {
  it('blocks unauthenticated access', () => {
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthProvider>
          <Routes>
            <Route path="/protected" element={<AuthGuard />}>
              <Route index element={<div>Secret Data</div>} />
            </Route>
            <Route path="/admin/login" element={<div>Login Route Redirected</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByText('Login Route Redirected')).toBeDefined();
    expect(screen.queryByText('Secret Data')).toBeNull();
  });

  it('allows access to specific roles and blocks others', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<TestLoginTrigger role={AdminRole.VIEWER} />} />
            <Route path="/role-protected" element={<AuthGuard allowedRoles={[AdminRole.RELEASE_MANAGER]} />}>
              <Route index element={<div>Release Manager Data</div>} />
            </Route>
            <Route path="/admin/dashboard" element={<div>Dashboard Redirected</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    
    // 1. প্রথমে VIEWER হিসেবে লগইন বাটনে ক্লিক করবে
    const btn = screen.getByText('Log In As VIEWER');
    act(() => { btn.click(); });
    
    // 2. AuthGuard চেক করবে। যেহেতু রোল VIEWER (কিন্তু দরকার RELEASE_MANAGER), 
    // তাই এটি সিকিউরিটি মেনে /admin/dashboard-এ রিডাইরেক্ট করে দেবে।
    expect(screen.getByText('Dashboard Redirected')).toBeDefined();
    expect(screen.queryByText('Release Manager Data')).toBeNull();
  });
});
