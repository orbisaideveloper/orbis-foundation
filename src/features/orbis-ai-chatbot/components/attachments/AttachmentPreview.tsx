import React from "react";
import { X, FileText, Image as ImageIcon, FileSpreadsheet } from "lucide-react";

export interface PendingAttachment {
  id: string;
  file: File;
  type: "image" | "document" | "spreadsheet" | "other";
  previewUrl?: string;
}

interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachments,
  onRemove,
}) => {
  if (!attachments || attachments.length === 0) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case "image":
        return <ImageIcon className="h-5 w-5 text-emerald-500" />;
      case "document":
        return <FileText className="h-5 w-5 text-blue-500" />;
      case "spreadsheet":
        return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
      default:
        return <FileText className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="flex flex-wrap gap-3 px-2 pb-3">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="relative flex items-center gap-3 rounded-2xl border border-gray-200/60 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-800/90"
        >
          {/* Thumbnail or Icon */}
          {att.type === "image" && att.previewUrl ? (
            <img
              src={att.previewUrl}
              alt="preview"
              className="h-10 w-10 rounded-xl object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 shadow-inner dark:bg-gray-900/50">
              {getIcon(att.type)}
            </div>
          )}

          {/* File Details */}
          <div className="flex max-w-[140px] flex-col">
            <span className="truncate text-[13px] font-semibold text-gray-700 dark:text-gray-200">
              {att.file.name}
            </span>
            <span className="text-[11px] font-medium text-gray-400">
              {(att.file.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>

          {/* Remove Button */}
          <button
            onClick={() => onRemove(att.id)}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-500 shadow-md transition-all hover:scale-110 hover:bg-red-500 hover:text-white dark:bg-red-900/80 dark:text-red-300 dark:hover:bg-red-500 dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
