import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { RuntimeState, RuntimeContextType } from './types';

const initialState: RuntimeState = {
  engineStatus: 'UNKNOWN',
  brainStatus: 'UNKNOWN',
  healthStatus: 'UNKNOWN',
  metrics: {
    cpuUsage: 0,
    memoryUsage: 0,
    activeNodes: 0
  },
  lastUpdated: null
};

const RuntimeContext = createContext<RuntimeContextType | undefined>(undefined);

export const RuntimeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [runtimeState, setRuntimeState] = useState<RuntimeState>(initialState);

  // Function to receive real-time updates from EventBus (Step-304 core connection)
  const updateRuntimeState = useCallback((newState: Partial<RuntimeState>) => {
    setRuntimeState(prevState => ({
      ...prevState,
      ...newState,
      lastUpdated: Date.now()
    }));
  }, []);

  // Memoize value to prevent SonarCloud Code Smell and React re-renders
  const contextValue = useMemo(() => ({
    ...runtimeState,
    updateRuntimeState
  }), [runtimeState, updateRuntimeState]);

  return (
    <RuntimeContext.Provider value={contextValue}>
      {children}
    </RuntimeContext.Provider>
  );
};

export const useRuntime = (): RuntimeContextType => {
  const context = useContext(RuntimeContext);
  if (context === undefined) {
    throw new Error('useRuntime must be used within a RuntimeProvider');
  }
  return context;
};
