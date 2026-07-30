import React from 'react';
import { motion } from 'framer-motion';
import { Maximize2, Copy } from 'lucide-react'; // Future Expansion Ready

interface GlassCardProps {
  title: string;
  children: React.ReactNode;
  delay?: number;
}

export const GlassCard: React.FC<GlassCardProps> = ({ title, children, delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--glass-opacity-border)] bg-[var(--glass-opacity-bg)] p-6 backdrop-blur-[var(--glass-blur)] shadow-xl"
    >
      <div className="flex items-center justify-between mb-4 border-b border-[var(--glass-opacity-border)] pb-2">
        <h3 className="text-sm font-semibold tracking-wider text-gray-300 uppercase">{title}</h3>
        {/* Reserved Architecture for Interactive Future Capabilities */}
        <div className="flex gap-2 text-gray-500">
          <Copy size={14} className="cursor-pointer hover:text-white transition-colors" />
          <Maximize2 size={14} className="cursor-pointer hover:text-white transition-colors" />
        </div>
      </div>
      <div className="text-white">
        {children}
      </div>
    </motion.div>
  );
};
