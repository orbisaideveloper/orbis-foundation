import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, Copy, Check } from 'lucide-react';
import { JsonViewer } from './JsonViewer';

interface GlassCardProps {
  title: string;
  children: React.ReactNode;
  delay?: number;
  rawData?: any; // Enables Interactive JSON View and Copy
}

export const GlassCard: React.FC<GlassCardProps> = ({ title, children, delay = 0, rawData }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    if (!rawData) return;
    try {
      // Convert rawData to formatted JSON string if it's an object
      const dataToCopy = typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2);
      await navigator.clipboard.writeText(dataToCopy);
      
      // Visual feedback
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy data: ", err);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--glass-opacity-border)] bg-[var(--glass-opacity-bg)] p-6 backdrop-blur-[var(--glass-blur)] shadow-xl flex flex-col"
    >
      <motion.div layout className="flex items-center justify-between mb-4 border-b border-[var(--glass-opacity-border)] pb-2">
        <h3 className="text-sm font-semibold tracking-wider text-gray-300 uppercase">{title}</h3>
        <div className="flex gap-3 text-gray-500">
          {rawData && (
            <button 
              type="button" 
              onClick={handleCopy}
              className="hover:text-white transition-colors" 
              title={isCopied ? "Copied!" : "Copy to Clipboard"}
            >
              {isCopied ? <Check size={16} className="text-[#22C55E]" /> : <Copy size={16} />}
            </button>
          )}
          {rawData && (
            <button 
              type="button"
              onClick={() => setIsExpanded(!isExpanded)} 
              className="hover:text-white transition-colors"
              title={isExpanded ? "Collapse View" : "Expand JSON View"}
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
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden origin-top"
          >
            <JsonViewer data={rawData} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
