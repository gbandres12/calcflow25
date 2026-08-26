import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { suggestCostCenter } from '../services/geminiService';
import { CostCenter } from '../types';

interface CostCenterSuggestionProps {
  description: string;
  category?: string;
  notes?: string;
  currentCostCenterId?: string;
  currentCostCenterName?: string;
  existingCostCenters: CostCenter[];
  history?: { description: string; costCenter: string }[];
  onSelectCostCenter: (costCenter: { id?: string; name: string }) => void;
}

export const CostCenterSuggestion: React.FC<CostCenterSuggestionProps> = ({
  description,
  category,
  notes,
  currentCostCenterId,
  currentCostCenterName,
  existingCostCenters,
  history = [],
  onSelectCostCenter
}) => {
  const [suggestion, setSuggestion] = useState<{ name: string; existingId?: string; isNew: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSuggestion = async (isManual = false) => {
    if (!description || description.trim().length < 3) {
      setSuggestion(null);
      return;
    }

    setLoading(true);
    try {
      const result = await suggestCostCenter({
        description,
        category,
        notes,
        existingCostCenters: existingCostCenters.map(cc => ({ id: cc.id, name: cc.name })),
        history
      });

      if (result && result.name) {
        setSuggestion(result);
        const isCurrent = result.existingId
          ? result.existingId === currentCostCenterId
          : result.name.toLowerCase() === (currentCostCenterName || '').toLowerCase();
        setApplied(isCurrent);
      } else {
        setSuggestion(null);
      }
    } catch (e) {
      console.warn("Falha silenciosa na sugestão de centro de custo:", e);
    } finally {
      setLoading(false);
    }
  };

  // Auto-sugestão com debounce de 1.5s após digitação
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (description && description.trim().length >= 3) {
      debounceTimerRef.current = setTimeout(() => {
        fetchSuggestion(false);
      }, 1500);
    } else {
      setSuggestion(null);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [description, category, notes]);

  // Atualiza estado de "aplicado" quando centro mudar
  useEffect(() => {
    if (suggestion) {
      const isCurrent = suggestion.existingId
        ? suggestion.existingId === currentCostCenterId
        : suggestion.name.toLowerCase() === (currentCostCenterName || '').toLowerCase();
      setApplied(isCurrent);
    }
  }, [currentCostCenterId, currentCostCenterName, suggestion]);

  const handleApply = () => {
    if (suggestion) {
      onSelectCostCenter({
        id: suggestion.existingId,
        name: suggestion.name
      });
      setApplied(true);
    }
  };

  if (!suggestion && !loading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
        <button
          type="button"
          onClick={() => fetchSuggestion(true)}
          className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 font-bold hover:underline transition-colors"
        >
          <Sparkles size={11} /> Sugerir Centro de Custo com IA
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      {loading ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-xl text-[10px] font-bold border border-purple-100 animate-pulse">
          <Loader2 size={11} className="animate-spin" /> Sugerindo Centro de Custo...
        </span>
      ) : suggestion ? (
        <div className="inline-flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Sugestão IA:
          </span>
          <button
            type="button"
            onClick={handleApply}
            disabled={applied}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black transition-all ${
              applied
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border border-indigo-200 active:scale-95 shadow-sm'
            }`}
          >
            {applied ? (
              <>
                <Check size={12} className="text-emerald-600" />
                <span>{suggestion.name} (Aplicado)</span>
              </>
            ) : (
              <>
                <Sparkles size={12} className="text-indigo-600" />
                <span>Aplicar: {suggestion.name}</span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
};
