import React from "react";
import { GlassChatCard } from "../../../features/orbis-ai-chatbot";

export const SystemOverview = () => {
  return (
    <section className="mb-8 flex flex-col gap-5">
      {/* Header Section */}
      <header>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          System Overview
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Smart Orchestration Management
        </p>
      </header>

      {/* 🚀 ORBIS AI Chatbot (Independent Module) */}
      <GlassChatCard />
    </section>
  );
};
