import React from "react";
import { motion } from "framer-motion";

interface AnimatedMonitorFrameProps {
  children: React.ReactNode;
  className: string;
  contentClassName: string;
  headerClassName?: string;
  onClose: () => void;
  title: React.ReactNode;
  titleClassName?: string;
}

export function AnimatedMonitorFrame({
  children,
  className,
  contentClassName,
  headerClassName = "",
  onClose,
  title,
  titleClassName = "text-[16px] font-bold text-slate-800 flex items-center gap-2",
}: AnimatedMonitorFrameProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className={className}
    >
      <div
        className={`px-5 py-4 border-b border-slate-100 flex justify-between items-center shadow-sm ${headerClassName}`}
      >
        <h2 className={titleClassName}>{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="bg-slate-100 text-slate-600 px-4 py-2 rounded-full font-bold text-[12px] hover:bg-slate-200 transition-colors"
        >
          Close
        </button>
      </div>
      <div className={contentClassName}>{children}</div>
    </motion.div>
  );
}
