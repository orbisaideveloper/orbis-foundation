import React from 'react';
import { BrowserRouter, Navigate, useRoutes } from 'react-router-dom';
import { AdminCoreProvider } from './admin/providers/AdminCoreProvider';
import { adminRoutes } from './admin/routes/AdminRoutes';

// Create a routing component to use useRoutes hook inside BrowserRouter
const AppRouting = () => {
  const routes = useRoutes([
    adminRoutes, // Single source of truth from AdminRoutes.tsx
    { path: '/', element: <Navigate to="/admin/dashboard" replace /> },
    { path: '/dashboard', element: <Navigate to="/admin/dashboard" replace /> },
    { path: '*', element: <Navigate to="/admin/dashboard" replace /> },
  ]);
  
  return routes;
};

function App() {
  return (
    <BrowserRouter>
      <AdminCoreProvider>
        <AppRouting />
      </AdminCoreProvider>
    </BrowserRouter>
  );
}

export default App;
