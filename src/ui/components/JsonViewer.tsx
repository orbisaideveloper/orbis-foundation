import React from 'react';

interface JsonViewerProps {
  data: any;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data }) => {
  return (
    <pre className="bg-black/40 p-4 rounded-lg overflow-x-auto text-xs font-mono text-gray-300 mt-4 border border-[var(--glass-opacity-border)] max-h-64 overflow-y-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
};
