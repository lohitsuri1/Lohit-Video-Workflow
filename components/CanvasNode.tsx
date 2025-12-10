import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Loader2,
  Maximize2,
  ArrowRight,
  Banana,
  Settings2,
  Image as ImageIcon,
  Plus,
  Check,
  ChevronDown,
  Film
} from 'lucide-react';
import { NodeData, NodeStatus, NodeType } from '../types';
import { NodeConnectors } from './canvas/NodeConnectors';

interface CanvasNodeProps {
  data: NodeData;
  inputUrl?: string; // Result from parent node (e.g., Image for Image-to-Video)
  onUpdate: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  onAddNext: (id: string, type: 'left' | 'right') => void;
  selected: boolean;
  onSelect: (id: string) => void;
  onNodePointerDown: (e: React.PointerEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onConnectorDown: (e: React.PointerEvent, id: string, side: 'left' | 'right') => void;
  isHoveredForConnection?: boolean;
}

const IMAGE_RATIOS = [
  "Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9"
];

const VIDEO_RESOLUTIONS = [
  "Auto", "1080p", "512p"
];

export const CanvasNode: React.FC<CanvasNodeProps> = ({
  data,
  inputUrl,
  onUpdate,
  onGenerate,
  onAddNext,
  selected,
  onSelect,
  onNodePointerDown,
  onContextMenu,
  onConnectorDown,
  isHoveredForConnection
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isIdle = data.status === NodeStatus.IDLE || data.status === NodeStatus.ERROR;
  const isLoading = data.status === NodeStatus.LOADING;
  const isSuccess = data.status === NodeStatus.SUCCESS;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSizeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSizeSelect = (value: string) => {
    if (data.type === NodeType.VIDEO) {
      onUpdate(data.id, { resolution: value });
    } else {
      onUpdate(data.id, { aspectRatio: value });
    }
    setShowSizeDropdown(false);
  };

  const getAspectRatioStyle = () => {
    if (data.type === NodeType.VIDEO) {
      // Default video player aspect ratio
      return { aspectRatio: '16/9' };
    }

    // For images, use the selected ratio or 1:1 default
    const ratio = data.aspectRatio || 'Auto';
    if (ratio === 'Auto') return { aspectRatio: '1/1' };

    const [w, h] = ratio.split(':');
    return { aspectRatio: `${w}/${h}` };
  };

  const currentSizeLabel = data.type === NodeType.VIDEO
    ? (data.resolution || "Auto")
    : (data.aspectRatio || "Auto");

  const sizeOptions = data.type === NodeType.VIDEO ? VIDEO_RESOLUTIONS : IMAGE_RATIOS;

  return (
    <div
      className={`absolute flex items-center group/node touch-none pointer-events-auto`}
      style={{
        transform: `translate(${data.x}px, ${data.y}px)`,
        transition: 'box-shadow 0.2s',
        zIndex: selected ? 50 : 10
      }}
      onPointerDown={(e) => onNodePointerDown(e, data.id)}
      onContextMenu={(e) => onContextMenu(e, data.id)}
    >
      <NodeConnectors nodeId={data.id} onConnectorDown={onConnectorDown} />

      {/* Main Node Card */}
      <div
        className={`relative w-[340px] rounded-2xl bg-[#0f0f0f] border transition-all duration-200 flex flex-col shadow-2xl ${selected ? 'border-blue-500/50 ring-1 ring-blue-500/30' : 'border-transparent'
          }`}
      >
        {/* Header (Type Label) - Always visible, dimmed if not selected */}
        <div className={`absolute -top-7 left-0 text-xs px-2 py-0.5 rounded font-medium transition-colors ${selected ? 'bg-blue-500/20 text-blue-200' : 'text-neutral-600'
          }`}>
          {data.type}
        </div>

        {/* Content Area - Full bleed when unselected */}
        <div className={`transition-all duration-200 ${!selected ? 'p-0 rounded-2xl overflow-hidden' : 'p-1'}`}>
          {/* Result View */}
          {isSuccess && data.resultUrl ? (
            <div
              className={`relative w-full bg-black group/image ${!selected ? '' : 'rounded-xl overflow-hidden'}`}
              style={getAspectRatioStyle()}
            >
              {data.type === NodeType.VIDEO ? (
                <video src={data.resultUrl} controls autoPlay loop className="w-full h-full object-cover" onPointerDown={(e) => e.stopPropagation()} />
              ) : (
                <img src={data.resultUrl} alt="Generated" className="w-full h-full object-cover pointer-events-none" />
              )}

              {/* Overlay Actions */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/image:opacity-100 transition-opacity">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1.5 bg-black/50 hover:bg-black/80 rounded-lg text-white backdrop-blur-md"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
          ) : (
            /* Placeholder / Empty State */
            <div className={`relative w-full aspect-[4/3] bg-[#141414] flex flex-col items-center justify-center gap-3 overflow-hidden
                ${isLoading ? 'animate-pulse' : ''} 
                ${!selected ? 'rounded-2xl' : 'rounded-xl border border-dashed border-neutral-800'}`
            }>
              {/* Input Image Preview for Video Nodes */}
              {data.type === NodeType.VIDEO && inputUrl && (
                <div className="absolute inset-0 z-0">
                  <img src={inputUrl} alt="Input Frame" className="w-full h-full object-cover opacity-30 blur-sm" />
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                    <ImageIcon size={10} />
                    Input Frame
                  </div>
                </div>
              )}

              {isLoading ? (
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <Loader2 size={32} className="animate-spin text-blue-400" />
                  <span className="text-xs text-neutral-500 font-medium">Generating...</span>
                </div>
              ) : (
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="text-neutral-700">
                    {data.type === NodeType.VIDEO ? <Film size={40} /> : <ImageIcon size={40} />}
                  </div>
                  {selected && (
                    <>
                      <div className="text-neutral-500 text-sm font-medium">
                        {data.type === NodeType.VIDEO && inputUrl ? "Ready to animate" : (data.type === NodeType.VIDEO ? "Waiting for input..." : "Try to:")}
                      </div>
                      {data.type !== NodeType.VIDEO && (
                        <div className="flex flex-col gap-1 text-xs text-neutral-600 text-center">
                          <span>• Image to Image</span>
                          <span>• Image to Video</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Control Panel / Prompt Input - Only show if selected */}
        {selected && (
          <div
            className="p-3 bg-[#1a1a1a] border-t border-neutral-800 rounded-b-2xl cursor-default"
            onPointerDown={(e) => e.stopPropagation()} // Allow selecting text/interacting without dragging
            onClick={() => onSelect(data.id)} // Ensure clicking here selects the node
          >
            <textarea
              className="w-full bg-transparent text-sm text-white placeholder-neutral-600 outline-none resize-none mb-3 font-light"
              placeholder={data.type === NodeType.VIDEO && inputUrl ? "Describe how to animate this frame..." : "Describe what you want to generate..."}
              rows={2}
              value={data.prompt}
              onChange={(e) => onUpdate(data.id, { prompt: e.target.value })}
            // Always allow editing, even if loading or success, to support re-generation
            />

            {data.errorMessage && (
              <div className="text-red-400 text-xs mb-2 p-1 bg-red-900/20 rounded border border-red-900/50">
                {data.errorMessage}
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-2">
                {/* Model Selector */}
                <button className="flex items-center gap-1.5 text-xs text-neutral-300 hover:bg-neutral-800 px-2 py-1.5 rounded-lg transition-colors">
                  <Banana size={12} className="text-yellow-400" />
                  <span className="font-medium">
                    {data.type === NodeType.VIDEO ? "Veo 3.1" : "Banana Pro"}
                  </span>
                  <Settings2 size={12} className="ml-1 opacity-50" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Unified Size/Ratio Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowSizeDropdown(!showSizeDropdown)}
                    className="flex items-center gap-1.5 text-xs font-medium bg-[#252525] hover:bg-[#333] border border-neutral-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {data.type === NodeType.VIDEO && currentSizeLabel === 'Auto' ? 'Auto' : currentSizeLabel}
                    {currentSizeLabel === 'Auto' && data.type !== NodeType.VIDEO && (
                      <span className="text-[10px] text-neutral-400 ml-0.5 opacity-50">1:1</span>
                    )}
                  </button>

                  {/* Dropdown Menu */}
                  {showSizeDropdown && (
                    <div className="absolute bottom-full mb-2 right-0 w-32 bg-[#252525] border border-neutral-700 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-60 overflow-y-auto">
                      <div className="px-3 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-[#1f1f1f]">
                        {data.type === NodeType.VIDEO ? 'Resolution' : 'Aspect Ratio'}
                      </div>
                      {sizeOptions.map(option => (
                        <button
                          key={option}
                          onClick={() => handleSizeSelect(option)}
                          className={`flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-[#333] transition-colors ${currentSizeLabel === option ? 'text-blue-400' : 'text-neutral-300'
                            }`}
                        >
                          <span>{option}</span>
                          {currentSizeLabel === option && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Generate Button - Active even after success to allow re-generation */}
                {!isLoading && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onGenerate(data.id); }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 ${isSuccess
                      ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/20'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                      }`}
                  >
                    <Sparkles size={14} fill={isSuccess ? "currentColor" : "currentColor"} />
                  </button>
                )}
              </div>
            </div>

            {/* Advanced Settings Drawer */}
            <div
              className="mt-2 pt-2 border-t border-neutral-800"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <div className="flex items-center justify-center cursor-pointer">
                <span className="text-[10px] text-neutral-600 uppercase tracking-widest hover:text-neutral-400">Advanced Settings</span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};