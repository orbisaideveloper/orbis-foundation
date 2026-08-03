import { lazy } from 'react';
import { RouteObject } from 'react-router-dom';
import AdminLayout from '../layout/AdminLayout';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Lazy loading views for optimal performance
const DashboardView = lazy(() => import('../views/DashboardView'));
const ReleaseManagerView = lazy(() => import('../views/ReleaseManagerView'));
const SystemHealthView = lazy(() => import('../views/SystemHealthView'));

// Placeholder components for routing completeness
const EngineMonitorView = lazy(() => Promise.resolve({ default: () => <div className="p-6 text-white">Engine Monitor Pipeline</div> }));
const BrainMonitorView = lazy(() => Promise.resolve({ default: () => <div className="p-6 text-white">Brain AI Provider Pipeline</div> }));

export const adminRoutes: RouteObject = {
  path: '/admin',
  element: (
    <ErrorBoundary>
      <AdminLayout />
    </ErrorBoundary>
  ),
  children: [
    { path: 'dashboard', element: <DashboardView /> },
    { path: 'engine', element: <EngineMonitorView /> },
    { path: 'brain', element: <BrainMonitorView /> },
    { path: 'health', element: <SystemHealthView /> },
    { path: 'release', element: <ReleaseManagerView /> },
    // Default redirect or landing can be added later
  ],
};
