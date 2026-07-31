import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminCoreProvider } from './admin/providers/AdminCoreProvider';
import { AdminDashboard } from './admin/dashboard/AdminDashboard';

function App() {
  return (
    <BrowserRouter>
      <AdminCoreProvider>
        <Routes>
          {/* Default Route routing to Dashboard */}
          <Route path="/dashboard" element={<AdminDashboard />} />
          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AdminCoreProvider>
    </BrowserRouter>
  );
}

export default App;
