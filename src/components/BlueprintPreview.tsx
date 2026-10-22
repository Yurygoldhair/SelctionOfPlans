import React from 'react';
import { DrawingItem } from '../types';
import { ZoomIn, FileText, Layers, Star } from 'lucide-react';

interface BlueprintThumbnailProps {
  item: DrawingItem;
  thumbnailUrl?: string;
  onClick: () => void;
}

export const BlueprintThumbnail: React.FC<BlueprintThumbnailProps> = ({
  item,
  thumbnailUrl,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className="relative group cursor-pointer w-20 h-14 bg-slate-900 border border-slate-700/80 hover:border-blue-500 rounded-md overflow-hidden flex flex-col justify-between p-0.5 transition shadow-sm hover:shadow-md"
      title="Нажмите, чтобы открыть чертеж в полном размере"
    >
      {thumbnailUrl ? (
        /* Real rendered PDF page thumbnail */
        <div className="w-full h-full bg-white flex items-center justify-center overflow-hidden">
          <img
            src={thumbnailUrl}
            alt={item.name}
            className="w-full h-full object-contain pointer-events-none"
            loading="lazy"
          />
        </div>
      ) : (
        /* Fallback schematic CAD illustration */
        <>
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(to right, #3b82f6 1px, transparent 1px), linear-gradient(to bottom, #3b82f6 1px, transparent 1px)',
              backgroundSize: '8px 8px',
            }}
          />
          <div className="relative z-10 w-full h-full flex items-center justify-center">
            <MiniCadSvg item={item} />
          </div>
        </>
      )}

      {/* Top Page & Highlight Badges */}
      <div className="absolute top-1 left-1 z-20 flex items-center space-x-1">
        {item.pageNumber && (
          <span className="bg-slate-900/90 text-blue-300 font-mono text-[9px] px-1 rounded border border-slate-700 shadow-sm">
            Л.{item.pageNumber}
          </span>
        )}
        {item.isHighlighted && (
          <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500 animate-pulse" />
        )}
      </div>

      {/* Hover Zoom Overlay */}
      <div className="absolute inset-0 bg-blue-600/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition z-30">
        <div className="bg-slate-900/90 text-white rounded p-1 shadow flex items-center space-x-1 text-[10px] font-semibold">
          <ZoomIn className="w-3.5 h-3.5 text-blue-400" />
        </div>
      </div>
    </div>
  );
};

export const MiniCadSvg: React.FC<{ item: DrawingItem }> = ({ item }) => {
  const isRod = item.name.toLowerCase().includes('шпильк') || item.name.toLowerCase().includes('прут');
  const isFastener = item.section === 'Стандарты' || item.name.toLowerCase().includes('болт') || item.name.toLowerCase().includes('винт') || item.name.toLowerCase().includes('гайк');
  const isPlate = item.section === 'Токарные+фрезерные работы: Лазер' || item.name.toLowerCase().includes('пластин') || item.name.toLowerCase().includes('кронштейн');

  if (isFastener) {
    return (
      <svg className="w-12 h-8 text-blue-400" viewBox="0 0 60 40" fill="none" stroke="currentColor">
        <polygon points="10,12 20,6 20,28 10,22" strokeWidth="1.2" fill="#1e293b" />
        <rect x="20" y="14" width="32" height="12" strokeWidth="1.2" fill="#0f172a" />
        <line x1="26" y1="14" x2="26" y2="26" strokeWidth="0.8" strokeDasharray="1,1" />
        <line x1="32" y1="14" x2="32" y2="26" strokeWidth="0.8" strokeDasharray="1,1" />
        <line x1="38" y1="14" x2="38" y2="26" strokeWidth="0.8" strokeDasharray="1,1" />
        <line x1="44" y1="14" x2="44" y2="26" strokeWidth="0.8" strokeDasharray="1,1" />
      </svg>
    );
  }

  if (isRod) {
    return (
      <svg className="w-14 h-6 text-rose-400" viewBox="0 0 70 30" fill="none" stroke="currentColor">
        <rect x="5" y="10" width="60" height="10" strokeWidth="1.2" fill="#1e293b" />
        <line x1="12" y1="10" x2="12" y2="20" strokeWidth="0.8" />
        <line x1="18" y1="10" x2="18" y2="20" strokeWidth="0.8" />
        <line x1="52" y1="10" x2="52" y2="20" strokeWidth="0.8" />
        <line x1="58" y1="10" x2="58" y2="20" strokeWidth="0.8" />
      </svg>
    );
  }

  if (isPlate) {
    return (
      <svg className="w-12 h-9 text-amber-400" viewBox="0 0 60 45" fill="none" stroke="currentColor">
        <rect x="8" y="8" width="44" height="28" rx="3" strokeWidth="1.2" fill="#1e293b" />
        <circle cx="18" cy="18" r="3.5" strokeWidth="1" fill="#0f172a" />
        <circle cx="42" cy="18" r="3.5" strokeWidth="1" fill="#0f172a" />
        <rect x="22" y="24" width="16" height="6" rx="2" strokeWidth="1" fill="#0f172a" />
      </svg>
    );
  }

  return (
    <svg className="w-12 h-9 text-blue-400" viewBox="0 0 60 40" fill="none" stroke="currentColor">
      <rect x="8" y="14" width="14" height="16" strokeWidth="1.2" fill="#1e293b" />
      <rect x="22" y="10" width="20" height="24" strokeWidth="1.2" fill="#1e293b" />
      <rect x="42" y="16" width="12" height="12" strokeWidth="1.2" fill="#1e293b" />
      <line x1="4" y1="22" x2="56" y2="22" stroke="#ef4444" strokeWidth="0.8" strokeDasharray="3,1" />
    </svg>
  );
};
