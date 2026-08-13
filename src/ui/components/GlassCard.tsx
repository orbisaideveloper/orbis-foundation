import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, Minimize2, Copy, Check } from "lucide-react";
import { JsonViewer } from "./JsonViewer";

interface GlassCardProps {
  title: string;
  children: React.ReactNode;
  delay?: number;
  rawData?: any;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  title,
  children,
  delay = 0,
  rawData,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // 🟢 FIX: Clean up the timeout to prevent memory leak and Vitest unhandled errors
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isCopied) {
      timeoutId = setTimeout(() => setIsCopied(false), 2000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isCopied]);

  const handleCopy = async () => {
    if (!rawData) return;
    try {
      const dataToCopy =
        typeof rawData === "string"
          ? rawData
          : JSON.stringify(rawData, null, 2);
      await navigator.clipboard.writeText(dataToCopy);
      setIsCopied(true);
    } catch (err) {
      console.error("Failed to copy data: ", err);
    }
  };

  const cardId = title.replace(/\s+/g, "-").toLowerCase();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--glass-opacity-border)] bg-[var(--glass-opacity-bg)] p-6 backdrop-blur-[var(--glass-blur)] shadow-xl flex flex-col"
      role="region"
      aria-labelledby={`card-title-${cardId}`}
    >
      <motion.div
        layout
        className="flex items-center justify-between mb-4 border-b border-[var(--glass-opacity-border)] pb-2"
      >
        <h3
          id={`card-title-${cardId}`}
          className="text-sm font-semibold tracking-wider text-gray-300 uppercase"
        >
          {title}
        </h3>
        <div
          className="flex gap-3 text-gray-500"
          role="toolbar"
          aria-label={`${title} actions`}
        >
          {rawData && (
            <button
              type="button"
              onClick={handleCopy}
              className="hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#F97316] rounded"
              title={isCopied ? "Copied!" : "Copy to Clipboard"}
              aria-label="Copy widget data"
              aria-live="polite"
            >
              {isCopied ? (
                <Check size={16} className="text-[#22C55E]" />
              ) : (
                <Copy size={16} />
              )}
            </button>
          )}
          {rawData && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#F97316] rounded"
              title={isExpanded ? "Collapse View" : "Expand JSON View"}
              aria-expanded={isExpanded}
              aria-controls={`json-view-${cardId}`}
              aria-label={
                isExpanded ? "Collapse JSON view" : "Expand JSON view"
              }
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
        </div>
      </motion.div>
      <motion.div layout className="text-white">
        {children}
      </motion.div>
      <AnimatePresence>
        {isExpanded && rawData && (
          <motion.div
            id={`json-view-${cardId}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden origin-top"
            role="region"
            aria-label={`${title} raw data`}
          >
            <JsonViewer data={rawData} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
