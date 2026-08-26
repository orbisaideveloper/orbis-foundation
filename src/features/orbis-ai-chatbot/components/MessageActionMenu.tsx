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
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

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
      className="min-w-[160px] overflow-hidden rounded-2xl border border-emerald-100 bg-[#fffef9]/95 shadow-xl backdrop-blur-xl"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onCopy();
          onClose();
        }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] font-medium text-slate-700 transition-colors hover:bg-emerald-50"
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
          className="flex w-full items-center gap-3 border-t border-orange-50 px-4 py-3 text-left text-[14px] font-medium text-slate-700 transition-colors hover:bg-orange-50"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share
        </button>
      )}
    </div>
  );
};
