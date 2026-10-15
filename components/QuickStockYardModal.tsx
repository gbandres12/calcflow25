import React, { useState } from 'react';
import { StockYard } from '../types';
import { FlowSheet } from './ui/FlowSheet';
import { Layers, MapPin, Scale, Plus, AlertCircle } from 'lucide-react';

interface QuickStockYardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newYard: StockYard) => void;
  onAddStockYard?: (yard: Omit<StockYard, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => StockYard | Promise<StockYard>;
  initialName?: string;
}

export const QuickStockYardModal: React.FC<QuickStockYardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onAddStockYard,
  initialName = ''
}) => {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [materialType, setMaterialType] = useState('Calcário Agrícola Moído');
  const [capacityTons, setCapacityTons] = useState('');
  const [currentStockTons, setCurrentStockTons] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Por favor, informe o nome ou identificação do pátio.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const yardData: Omit<StockYard, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> = {
        name: cleanName,
        code: code.trim().toUpperCase() || undefined,
        location: location.trim() || undefined,
        materialType: materialType.trim() || undefined,
        capacityTons: capacityTons ? parseFloat(capacityTons.replace(',', '.')) : undefined,
        currentStockTons: currentStockTons ? parseFloat(currentStockTons.replace(',', '.')) : 0,
        active: true,
        notes: notes.trim() || undefined
      };

      if (onAddStockYard) {
        const created = await onAddStockYard(yardData);
        onSuccess(created);
      } else {
        const mockYard: StockYard = {
          ...yardData,
          id: `yard-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        onSuccess(mockYard);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao cadastrar pátio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FlowSheet
      title="Novo Pátio de Estoque"
      subtitle="Cadastre uma baia, pátio ou pilha de calcário para estocagem"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
            Nome / Identificação do Pátio *
          </label>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Pátio Principal 03, Pilha Calcítico Balsa"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 min-h-12"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Código / Sigla
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: PAT-03"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Tipo de Material
            </label>
            <select
              value={materialType}
              onChange={(e) => setMaterialType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600"
            >
              <option value="Calcário Agrícola Moído">Calcário Agrícola Moído</option>
              <option value="Calcário Dolomítico">Calcário Dolomítico</option>
              <option value="Calcário Calcítico">Calcário Calcítico</option>
              <option value="Calcário Britado">Calcário Britado</option>
              <option value="Gesso Agrícola">Gesso Agrícola</option>
              <option value="Outro Insumo">Outro Insumo</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
            Localização / Referência no Porto
          </label>
          <div className="relative">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: Próximo à rampa do Berço 2 / Porto Tapajós"
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Capacidade Máxima (t)
            </label>
            <div className="relative">
              <Scale size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                inputMode="decimal"
                value={capacityTons}
                onChange={(e) => setCapacityTons(e.target.value)}
                placeholder="Ex: 5000"
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Estoque Inicial (t)
            </label>
            <div className="relative">
              <Layers size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                inputMode="decimal"
                value={currentStockTons}
                onChange={(e) => setCurrentStockTons(e.target.value)}
                placeholder="Ex: 0"
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
            Observações
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Instruções de acesso, berço de atracação, etc."
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-emerald-600"
          />
        </div>

        <div className="pt-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-12 border border-slate-200 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 min-h-12 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-extrabold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Plus size={18} /> Salvar Pátio
          </button>
        </div>
      </form>
    </FlowSheet>
  );
};

export default QuickStockYardModal;
