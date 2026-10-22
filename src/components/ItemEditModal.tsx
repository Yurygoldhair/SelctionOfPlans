import React, { useState, useEffect } from 'react';
import { DrawingItem, SECTIONS, SectionType } from '../types';
import { X, Save, Plus, Cpu, Ruler, AlertTriangle, Box, Calculator } from 'lucide-react';
import { calculateBillet } from '../utils/billetCalculator';

interface ItemEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: DrawingItem | null;
  defaultSection?: SectionType;
  onSave: (item: DrawingItem) => void;
}

export const ItemEditModal: React.FC<ItemEditModalProps> = ({
  isOpen,
  onClose,
  item,
  defaultSection,
  onSave,
}) => {
  const [formData, setFormData] = useState<Partial<DrawingItem>>({
    name: '',
    designation: '',
    quantity: 1,
    code1C: '',
    section: defaultSection || 'Токарные+фрезерные работы',
    material: '',
    partLength: '',
    isCnc: false,
    isPieceStock: false,
    hasNoStamp: false,
    identificationMark: '',
    pageNumber: 1,
    isHighlighted: false,
    notes: '',
  });

  useEffect(() => {
    if (item) {
      setFormData(item);
    } else {
      setFormData({
        name: '',
        designation: '',
        quantity: 1,
        code1C: '',
        section: defaultSection || 'Токарные+фрезерные работы',
        material: '',
        partLength: '',
        isCnc: false,
        isPieceStock: false,
        hasNoStamp: false,
        identificationMark: '',
        pageNumber: 1,
        isHighlighted: false,
        notes: '',
      });
    }
  }, [item, defaultSection, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalItem: DrawingItem = {
      id: item ? item.id : `manual-${Date.now()}`,
      name: formData.name || 'Деталь',
      designation: formData.designation || (formData.hasNoStamp && formData.identificationMark ? `Опознано: ${formData.identificationMark}` : ''),
      quantity: formData.quantity ?? null,
      code1C: formData.code1C || '',
      section: (formData.section as SectionType) || 'Токарные+фрезерные работы',
      material: formData.material || '',
      partLength: formData.partLength || '',
      isCnc: Boolean(formData.isCnc),
      isPieceStock: Boolean(formData.isPieceStock),
      hasNoStamp: Boolean(formData.hasNoStamp),
      identificationMark: formData.identificationMark || '',
      pageNumber: formData.pageNumber || undefined,
      isHighlighted: Boolean(formData.isHighlighted),
      notes: formData.notes || '',
      qtySource: item?.qtySource || 'manual',
    };
    onSave(finalItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            {item ? <span>Редактирование параметров детали</span> : <span>Добавление новой детали / чертежа</span>}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto scrollbar-thin">
          
          {/* Section */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Раздел производства *
            </label>
            <select
              value={formData.section}
              onChange={(e) => setFormData({ ...formData, section: e.target.value as SectionType })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-medium"
            >
              {SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Наименование (Втулка, Вал, Болт и т.д.) *
            </label>
            <input
              type="text"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="например, Втулка упорная ступенчатая"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Designation */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Обозначение (Шифр ЕСКД / ГОСТ / DIN) *
            </label>
            <input
              type="text"
              required
              value={formData.designation || ''}
              onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
              placeholder="например, АБВГ.711142.012 или ГОСТ 7798-70"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-blue-300 font-mono font-semibold focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Unbordered drawing / No stamp block */}
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className={`w-4 h-4 ${formData.hasNoStamp ? 'text-amber-400' : 'text-slate-500'}`} />
                <div>
                  <span className="font-semibold text-slate-200">Чертеж без рамки и штампа</span>
                  <p className="text-[10px] text-slate-400">
                    Позиция опознана по маркировке, номеру позиции или габаритам на эскизе
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(formData.hasNoStamp)}
                onChange={(e) => setFormData({ ...formData, hasNoStamp: e.target.checked })}
                className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
              />
            </div>

            {formData.hasNoStamp && (
              <div className="pt-2">
                <label className="block text-slate-300 font-medium mb-1">
                  Опознавательный знак с чертежа:
                </label>
                <input
                  type="text"
                  value={formData.identificationMark || ''}
                  onChange={(e) => setFormData({ ...formData, identificationMark: e.target.value })}
                  placeholder="например, Поз. 7 / Эскиз валика Ø32 L=190"
                  className="w-full bg-slate-900 border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-amber-300 focus:outline-none focus:border-amber-400"
                />
              </div>
            )}
          </div>

          {/* Length, CNC & Piece Stock row */}
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center space-x-1">
                <Ruler className="w-3.5 h-3.5 text-blue-400" />
                <span>Длина детали (мм)</span>
              </label>
              <input
                type="text"
                value={formData.partLength || ''}
                onChange={(e) => setFormData({ ...formData, partLength: e.target.value })}
                placeholder="180 мм / 340"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-blue-500 text-xs"
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="block text-slate-300 font-semibold mb-1 flex items-center space-x-1">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>ЧПУ (+30мм)</span>
              </label>
              <label className="flex items-center space-x-2 bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 cursor-pointer hover:border-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(formData.isCnc)}
                  onChange={(e) => setFormData({ ...formData, isCnc: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <span className="text-slate-200 text-xs font-medium">ЧПУ</span>
              </label>
            </div>

            <div className="flex flex-col justify-end">
              <label className="block text-slate-300 font-semibold mb-1 flex items-center space-x-1">
                <Box className="w-3.5 h-3.5 text-indigo-400" />
                <span>Штучная заг.</span>
              </label>
              <label className="flex items-center space-x-2 bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 cursor-pointer hover:border-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(formData.isPieceStock)}
                  onChange={(e) => setFormData({ ...formData, isPieceStock: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-700 text-indigo-500 focus:ring-0 cursor-pointer"
                />
                <span className="text-slate-200 text-xs font-medium">По 1 шт</span>
              </label>
            </div>
          </div>

          {/* Dynamic Billet Preview Card */}
          {(() => {
            const liveBillet = calculateBillet({
              partLength: formData.partLength,
              quantity: formData.quantity ?? 1,
              isCnc: formData.isCnc,
              isPieceStock: formData.isPieceStock,
            });
            if (!liveBillet.hasLength) return null;
            return (
              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Calculator className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-xs text-white">Расчитанная заготовка:</span>
                    <span className="font-mono font-bold text-amber-300">
                      {liveBillet.billetLength} мм
                    </span>
                    {liveBillet.billetCount && liveBillet.billetCount > 1 && (
                      <span className="text-[11px] text-amber-400/80">
                        ({liveBillet.billetCount} заг.)
                      </span>
                    )}
                  </div>
                  <div className="font-mono font-bold text-xs bg-amber-500/30 text-amber-200 border border-amber-400/50 px-2 py-0.5 rounded">
                    {liveBillet.kdString}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  Формула: {liveBillet.formulaDesc}
                  {liveBillet.isRestrictedBy1000 && ' (сработало ограничение 1000 мм: разбито)'}
                  {liveBillet.isExceeding1000Part && ' (деталь > 1000 мм: ограничение 1000мм не действует)'}
                </p>
              </div>
            );
          })()}

          {/* Quantity & 1C Code row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Количество (шт)
              </label>
              <input
                type="number"
                min="0"
                value={formData.quantity ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value);
                  setFormData({ ...formData, quantity: val });
                }}
                placeholder="0"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Код по 1С (для стандартов)
              </label>
              <input
                type="text"
                value={formData.code1C || ''}
                onChange={(e) => setFormData({ ...formData, code1C: e.target.value })}
                placeholder="00-00014285"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-indigo-300 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Material & Page row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Материал
              </label>
              <input
                type="text"
                value={formData.material || ''}
                onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                placeholder="Сталь 40Х..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Номер листа в PDF
              </label>
              <input
                type="number"
                min="1"
                value={formData.pageNumber || ''}
                onChange={(e) => setFormData({ ...formData, pageNumber: Number(e.target.value) || undefined })}
                placeholder="1"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Примечания / Технические требования
            </label>
            <textarea
              rows={2}
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Покрытия, термообработка, шероховатость..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 flex items-center space-x-2 transition"
            >
              <Save className="w-4 h-4" />
              <span>Сохранить</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
