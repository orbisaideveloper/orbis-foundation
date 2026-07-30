import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, Copy } from 'lucide-react';
import { JsonViewer } from './JsonViewer';

interface GlassCardProps {
  title: string;
  children: React.ReactNode;
  delay?: number;
  rawData?: any; // Enables Interactive JSON View
}

export const GlassCard: React.FC<GlassCardProps> = ({ title, children, delay = 0, rawData }) => {
  const [isExpanded, setIsExpanded] = useState(false);

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
            <button className="hover:text-white transition-colors" title="Copy to Clipboard">
              <Copy size={16} />
            </button>
          )}
          {rawData && (
            <button 
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
