import { useState, useEffect } from "react";
import { DashboardGrid } from "../../control-center/layout/DashboardGrid";

// Connects React UI to the Locked Phase-02 Headless Architecture
export const useDashboard = () => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const dashboard = new DashboardGrid();

    // Initial Render
    setData(dashboard.render());

    // Basic polling to keep UI updated with runtime state (Event-Driven architecture preparation)
    const interval = setInterval(() => {
      setData(dashboard.render());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return data;
};
