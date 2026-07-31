import React, { createContext, useContext, useState, ReactNode, useMemo, useCallback } from 'react';

export interface IRuntimeService {
  systemHealth: 'STABLE' | 'DEGRADED' | 'CRITICAL';
  metrics: { cpu: number; memory: number };
  triggerRestart: () => void;
}

const RuntimeContext = createContext<IRuntimeService | undefined>(undefined);

export const RuntimeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [systemHealth, setSystemHealth] = useState<'STABLE' | 'DEGRADED' | 'CRITICAL'>('STABLE');
  const [metrics, setMetrics] = useState({ cpu: 12, memory: 45 });

  const triggerRestart = useCallback(() => {
    setSystemHealth('DEGRADED');
    // Simulated backend trigger delay
    setTimeout(() => setSystemHealth('STABLE'), 2500);
  }, []);

  const value = useMemo(() => ({
    systemHealth,
    metrics,
    triggerRestart
  }), [systemHealth, metrics, triggerRestart]);

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
};

export const useRuntime = () => {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error('useRuntime must be used within a RuntimeProvider');
  return context;
};
