import React from 'react';
import AdminDashboard from './dashboard/AdminDashboard';

export const AdminViews: React.FC = () => {
  return (
    <div className="w-full h-full bg-slate-50">
      <AdminDashboard />
    </div>
  );
};

export default AdminViews;
