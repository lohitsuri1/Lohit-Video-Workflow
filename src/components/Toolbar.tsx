import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutGrid,
  Image as ImageIcon,
  MessageSquare,
  History,
  Wrench,
  MoreHorizontal,
  Plus
} from 'lucide-react';

// ============================================================================
// TIKTOK ICON COMPONENT
// ============================================================================

const TikTokIcon: React.FC<{ size?: number; className?: string }> = ({ size = 20, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
);

// ============================================================================
// TYPES
// ============================================================================

interface ToolbarProps {
  onAddClick?: (e: React.MouseEvent) => void;
  onWorkflowsClick?: (e: React.MouseEvent) => void;
  onHistoryClick?: (e: React.MouseEvent) => void;
  onAssetsClick?: (e: React.MouseEvent) => void;
  onTikTokClick?: (e: React.MouseEvent) => void;
  onToolsOpen?: () => void; // Called when tools dropdown opens to close other panels
}

// ============================================================================
// COMPONENT
// ============================================================================

export const Toolbar: React.FC<ToolbarProps> = ({
  onAddClick,
  onWorkflowsClick,
  onHistoryClick,
  onAssetsClick,
  onTikTokClick,
  onToolsOpen
}) => {
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setIsToolsOpen(false);
      }
    };

    if (isToolsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isToolsOpen]);

  const handleToolClick = (callback?: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => {
    setIsToolsOpen(false);
    callback?.(e);
  };

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 p-1 bg-[#1a1a1a] border border-neutral-800 rounded-full shadow-2xl z-50">
      <button
        className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-neutral-200 hover:scale-110 transition-all duration-200 mb-2"
        onClick={onAddClick}
      >
        <Plus size={20} />
      </button>

      <div className="flex flex-col gap-4 py-2 px-1">
        <button
          className="text-neutral-400 hover:text-white hover:scale-125 transition-all duration-200"
          onClick={onWorkflowsClick}
          title="My Workflows"
        >
          <LayoutGrid size={20} />
        </button>
        <button
          className="text-neutral-400 hover:text-white hover:scale-125 transition-all duration-200"
          title="Assets"
          onClick={onAssetsClick}
        >
          <ImageIcon size={20} />
        </button>
        <button
          className="text-neutral-400 hover:text-white hover:scale-125 transition-all duration-200"
          onClick={onHistoryClick}
          title="History"
        >
          <History size={20} />
        </button>

        {/* Tools Dropdown */}
        <div className="relative" ref={toolsRef}>
          <button
            className={`text-neutral-400 hover:text-white hover:scale-125 transition-all duration-200 ${isToolsOpen ? 'text-white' : ''}`}
            onClick={() => {
              if (!isToolsOpen) {
                onToolsOpen?.(); // Close other panels when opening tools
              }
              setIsToolsOpen(!isToolsOpen);
            }}
            title="Tools"
          >
            <Wrench size={20} />
          </button>

          {/* Dropdown Menu */}
          {isToolsOpen && (
            <div className="absolute left-10 top-0 bg-[#1a1a1a] border border-neutral-700 rounded-lg shadow-2xl py-2 min-w-[240px] z-50">
              <button
                onClick={handleToolClick(onTikTokClick)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-800 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ff0050] via-[#00f2ea] to-[#ff0050] flex items-center justify-center">
                  <TikTokIcon size={16} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm text-neutral-200 group-hover:text-white">Import TikTok</p>
                  <p className="text-xs text-neutral-500">Download without watermark</p>
                </div>
              </button>

              {/* Placeholder for future tools */}
              <div className="border-t border-neutral-800 mt-1 pt-1">
                <div className="px-3 py-2 text-xs text-neutral-600 italic">
                  More tools coming soon...
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="w-8 h-[1px] bg-neutral-800 my-1"></div>

      <button className="w-8 h-8 rounded-full overflow-hidden border border-neutral-700 mb-2 hover:scale-110 transition-all duration-200">
        <img src="https://picsum.photos/40/40" alt="Profile" className="w-full h-full object-cover" />
      </button>
    </div>
  );
};
