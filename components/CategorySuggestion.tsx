import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { suggestCategory } from '../services/geminiService';
import { TransactionType } from '../types';

interface CategorySuggestionProps {
  type: 'receita' | 'despesa' | 'INFLOW' | 'OUTFLOW' | TransactionType;
  description: string;
  notes?: string;
  currentCategory: string;
  officialCategories: string[];
  history?: { description: string; category: string }[];
  onSelectCategory: (category: string) => void;
}

export const CategorySuggestion: React.FC<CategorySuggestionProps> = ({
  type,
  description,
  notes,
  currentCategory,
  officialCategories,
  history = [],
  onSelectCategory
}) => {
  const [suggestion, setSuggestion] = useState<string | null>(null);
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
      const result = await suggestCategory({
        type,
        description,
        notes,
        officialCategories,
        history
      });

      if (result && result.category) {
        setSuggestion(result.category);
        setApplied(result.category === currentCategory);
      } else {
        setSuggestion(null);
      }
    } catch (e) {
      console.warn("Falha silenciosa na sugestão de categoria:", e);
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
  }, [description, notes, type]);

  // Atualiza estado de "aplicado" quando categoria mudar no formulário
  useEffect(() => {
    if (suggestion) {
      setApplied(suggestion === currentCategory);
    }
  }, [currentCategory, suggestion]);

  const handleApply = () => {
    if (suggestion) {
      onSelectCategory(suggestion);
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
          <Sparkles size={11} /> Sugerir Categoria com IA
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      {loading ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-xl text-[10px] font-bold border border-purple-100 animate-pulse">
          <Loader2 size={11} className="animate-spin" /> Analisando com IA...
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
                : 'bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-200 active:scale-95 shadow-sm'
            }`}
          >
            {applied ? (
              <>
                <Check size={12} className="text-emerald-600" />
                <span>{suggestion} (Aplicado)</span>
              </>
            ) : (
              <>
                <Sparkles size={12} className="text-purple-600" />
                <span>Aplicar: {suggestion}</span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
};
