import React, { useEffect, useRef } from "react";
import { Copy, Share2 } from "lucide-react";

export interface MessageActionMenuPosition {
  x: number;
  y: number;
}

interface MessageActionMenuProps {
  position: MessageActionMenuPosition;
  canShare: boolean;
  onCopy: () => void;
  onShare: () => void;
  onClose: () => void;
}

/**
 * Small contextual menu shown after a long-press (or right-click) on a chat
 * message. Not rendered permanently anywhere — the parent only mounts this
 * while a message is "active".
 */
export const MessageActionMenu: React.FC<MessageActionMenuProps> = ({
  position,
  canShare,
  onCopy,
  onShare,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    // Closing on scroll keeps the menu from drifting away from the message
    // it was opened for.
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  // Keep the menu inside the viewport.
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 180),
    top: Math.min(position.y, window.innerHeight - 120),
    zIndex: 60,
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Message actions"
      style={style}
      className="min-w-[160px] overflow-hidden rounded-2xl border border-gray-200/70 bg-white/95 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#1E293B]/95"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onCopy();
          onClose();
        }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] font-medium text-gray-700 transition-colors hover:bg-emerald-50 dark:text-gray-200 dark:hover:bg-white/10"
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        Copy
      </button>
      {canShare && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onShare();
            onClose();
          }}
          className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left text-[14px] font-medium text-gray-700 transition-colors hover:bg-emerald-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/10"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share
        </button>
      )}
    </div>
  );
};
