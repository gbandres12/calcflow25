import React from 'react';
import { Calendar, X } from 'lucide-react';
import { DatePreset } from '../../utils/dateFilterUtils';

interface DateFilterControlProps {
  activePreset: DatePreset;
  startDate: string;
  endDate: string;
  onSelectPreset: (preset: 'ALL' | 'TODAY' | '7DAYS' | 'THIS_MONTH') => void;
  onCustomDateChange: (type: 'start' | 'end', value: string) => void;
  onReset?: () => void;
  label?: string;
  colorTheme?: 'emerald' | 'purple' | 'slate';
  className?: string;
}

export const DateFilterControl: React.FC<DateFilterControlProps> = ({
  activePreset,
  startDate,
  endDate,
  onSelectPreset,
  onCustomDateChange,
  onReset,
  label = 'Filtrar por Período',
  colorTheme = 'emerald',
  className = ''
}) => {
  const isFiltered = activePreset !== 'ALL' || Boolean(startDate) || Boolean(endDate);

  const activePresetBg = {
    emerald: 'bg-emerald-700 text-white shadow-xs',
    purple: 'bg-purple-600 text-white shadow-xs',
    slate: 'bg-slate-800 text-white shadow-xs'
  }[colorTheme];

  const focusRing = {
    emerald: 'focus:border-emerald-600',
    purple: 'focus:border-purple-600',
    slate: 'focus:border-slate-700'
  }[colorTheme];

  const iconColor = {
    emerald: 'text-emerald-700',
    purple: 'text-purple-600',
    slate: 'text-slate-700'
  }[colorTheme];

  return (
    <div className={`flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2.5 ${className}`}>
      {/* Botões de Atalho */}
      <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/80 shrink-0">
        <button
          type="button"
          onClick={() => onSelectPreset('TODAY')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activePreset === 'TODAY' ? activePresetBg : 'text-slate-600 hover:bg-white'
          }`}
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => onSelectPreset('7DAYS')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activePreset === '7DAYS' ? activePresetBg : 'text-slate-600 hover:bg-white'
          }`}
        >
          7 Dias
        </button>
        <button
          type="button"
          onClick={() => onSelectPreset('THIS_MONTH')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activePreset === 'THIS_MONTH' ? activePresetBg : 'text-slate-600 hover:bg-white'
          }`}
        >
          Este Mês
        </button>
        <button
          type="button"
          onClick={() => onSelectPreset('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activePreset === 'ALL' ? activePresetBg : 'text-slate-600 hover:bg-white'
          }`}
        >
          Tudo
        </button>
      </div>

      {/* Intervalo Personalizado (De / Até) */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <div className="flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl">
          <Calendar size={13} className={iconColor} />
          <span className="text-[11px] text-slate-500 font-bold uppercase">De</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onCustomDateChange('start', e.target.value)}
            className={`bg-transparent text-slate-700 font-bold text-xs outline-none ${focusRing}`}
          />
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl">
          <span className="text-[11px] text-slate-500 font-bold uppercase">Até</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onCustomDateChange('end', e.target.value)}
            className={`bg-transparent text-slate-700 font-bold text-xs outline-none ${focusRing}`}
          />
        </div>

        {isFiltered && onReset && (
          <button
            type="button"
            onClick={onReset}
            title="Limpar filtro de período"
            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
