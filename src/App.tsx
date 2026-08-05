import SystemDiagnosticConsole from './components/SystemDiagnosticConsole';
import React from 'react';
import AdminViews from './admin/AdminViews';

function App() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-green-100">
      <SystemDiagnosticConsole />

      <AdminViews />
    </div>
  );
}

export default App;
