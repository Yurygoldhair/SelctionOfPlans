import React from 'react';
import {
  Wrench,
  Zap,
  Gauge,
  PackageCheck,
  LayoutGrid
} from 'lucide-react';
import { SECTIONS, SectionType, DrawingItem } from '../types';

interface SectionTabsProps {
  selectedSection: SectionType | 'all';
  onSelectSection: (section: SectionType | 'all') => void;
  items: DrawingItem[];
}

export const SectionTabs: React.FC<SectionTabsProps> = ({
  selectedSection,
  onSelectSection,
  items,
}) => {
  const getSectionStats = (sec: SectionType) => {
    const secItems = items.filter(it => it.section === sec);
    const qty = secItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
    return { count: secItems.length, qty };
  };

  const allQty = items.reduce((acc, it) => acc + (it.quantity || 0), 0);

  const getSectionIcon = (sec: SectionType) => {
    switch (sec) {
      case 'Токарные+фрезерные работы':
        return <Wrench className="w-4 h-4 text-blue-400" />;
      case 'Токарные+фрезерные работы: Лазер':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'Токарные+фрезерные работы: ВОС':
        return <Gauge className="w-4 h-4 text-purple-400" />;
      case 'Стандарты':
        return <PackageCheck className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <div className="flex items-center space-x-1.5 overflow-x-auto pb-2 mb-4 scrollbar-thin">
      {/* "All" Tab */}
      <button
        onClick={() => onSelectSection('all')}
        className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 shrink-0 transition border ${
          selectedSection === 'all'
            ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20'
            : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
        <span>Все разделы</span>
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
            selectedSection === 'all'
              ? 'bg-blue-700/90 text-blue-100'
              : 'bg-slate-700 text-slate-300'
          }`}
        >
          {items.length} ({allQty} шт)
        </span>
      </button>

      {/* 4 Standard Sections Tabs */}
      {SECTIONS.map((sec, idx) => {
        const { count, qty } = getSectionStats(sec);
        const isSelected = selectedSection === sec;

        return (
          <button
            key={sec}
            onClick={() => onSelectSection(sec)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 shrink-0 transition border relative group ${
              isSelected
                ? 'bg-slate-800 text-white border-blue-500 ring-2 ring-blue-500/30'
                : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
            }`}
          >
            {getSectionIcon(sec)}
            <span className="truncate max-w-[200px]">
              {idx + 1}. {sec}
            </span>

            {/* Counter badges */}
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                isSelected
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
              }`}
            >
              {count} {qty > 0 && `• ${qty} шт`}
            </span>
          </button>
        );
      })}
    </div>
  );
};
