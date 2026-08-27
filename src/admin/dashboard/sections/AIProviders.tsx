import React, { useEffect, useState } from "react";
import { Bot, Activity, Server, Box, Plus } from "lucide-react";

interface ProviderMetadata {
  name: string;
  type: string;
  model: string;
  health?: {
    state: "UNKNOWN" | "AVAILABLE" | "UNAVAILABLE";
    checkedAt: number | null;
  };
}

interface ProviderStatus {
  activeProvider: ProviderMetadata | null;
  allProviders: ProviderMetadata[];
}

export const AIProviders: React.FC = () => {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/providers/status")
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to fetch provider status");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="p-6 bg-white/50 dark:bg-gray-800/50 rounded-3xl animate-pulse h-48"></div>
    );
  }

  if (!status?.activeProvider) {
    return (
      <div className="p-6 bg-red-50/50 dark:bg-red-900/20 rounded-3xl border border-red-100 dark:border-red-900/30">
        <p className="text-red-600 dark:text-red-400">
          AI Provider status unavailable.
        </p>
      </div>
    );
  }

  const active = status.activeProvider;

  return (
    <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-md border border-gray-200/50 dark:border-white/10 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              AI Providers
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage your AI intelligence sources
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-sm font-medium">
          <Activity className="w-4 h-4" />
          <span>{active.health?.state || "UNKNOWN"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active Provider Card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Bot className="w-24 h-24 text-emerald-600" />
          </div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
              {active.name}
            </h3>
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full shadow-sm">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              {active.health?.state || "UNKNOWN"}
            </span>
          </div>
          <div className="space-y-3 relative z-10">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Server className="w-4 h-4 text-gray-400" />
              <span className="font-medium">Type:</span>
              <span className="capitalize bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
                {active.type}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Box className="w-4 h-4 text-gray-400" />
              <span className="font-medium">Model:</span>
              <span className="truncate">{active.model}</span>
            </div>
          </div>
        </div>

        {/* Add New Provider Placeholder */}
        <div className="flex flex-col items-center justify-center bg-gray-50/50 dark:bg-gray-800/30 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors cursor-pointer group">
          <div className="p-3 bg-white dark:bg-gray-900 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
            <Plus className="w-6 h-6 text-gray-400 group-hover:text-emerald-500" />
          </div>
          <span className="font-medium">Add Provider</span>
          <span className="text-xs mt-1 text-gray-400 text-center">
            Gemini, OpenAI, Claude
            <br />
            (Coming Soon)
          </span>
        </div>
      </div>
    </div>
  );
};

export default AIProviders;
