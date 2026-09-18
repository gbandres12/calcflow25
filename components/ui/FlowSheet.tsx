import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface FlowSheetProps {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  zIndexClass?: string;
  /** Recibos/tickets: overlay some na impressão, conteúdo permanece. */
  printSafe?: boolean;
  bodyClassName?: string;
  padded?: boolean;
}

/** Bottom sheet no celular, diálogo compacto no desktop — formulários longos sem ocupar a tela inteira. */
export const FlowSheet: React.FC<FlowSheetProps> = ({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  zIndexClass = 'z-[120]',
  printSafe,
  bodyClassName,
  padded = true,
}) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center ${printSafe ? 'print:static print:block' : 'print:hidden'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="flow-sheet-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px] print:hidden"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className={`flow-sheet relative flex w-full flex-col bg-white shadow-2xl max-h-[92dvh] sm:max-h-[90vh] rounded-t-[1.75rem] sm:rounded-3xl ${
          wide ? 'sm:max-w-5xl' : 'sm:max-w-3xl'
        } sm:mx-4 ${printSafe ? 'print:max-h-none print:max-w-none print:mx-0 print:rounded-none print:shadow-none print:h-auto' : ''}`}
      >
        <div className="sm:hidden flex justify-center pt-2 pb-0.5 shrink-0 print:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        <header className="flex items-start justify-between gap-3 px-4 pt-2 pb-3 sm:px-5 sm:pt-4 border-b border-slate-100 shrink-0 print:hidden">
          <div className="min-w-0">
            <h3 id="flow-sheet-title" className="text-[15px] sm:text-base font-bold text-slate-900 tracking-tight leading-snug">
              {title}
            </h3>
            {subtitle ? (
              <div className="mt-0.5 text-[11px] text-slate-500 font-medium leading-snug">{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 -mt-1 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0 min-h-11 min-w-11 flex items-center justify-center"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar ${
            padded ? 'px-4 py-3 sm:px-5 sm:py-4' : ''
          } ${printSafe ? 'print:overflow-visible print:max-h-none' : ''} ${bodyClassName || ''}`}
        >
          {children}
        </div>

        {footer ? (
          <footer className="shrink-0 border-t border-slate-100 bg-white/95 backdrop-blur px-4 py-3 sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
};

interface FlowSectionProps {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

export const FlowSection: React.FC<FlowSectionProps> = ({
  title,
  summary,
  defaultOpen = false,
  children,
  badge,
}) => (
  <details
    className="group rounded-2xl border border-slate-200 bg-white overflow-hidden"
    open={defaultOpen}
  >
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 min-h-12 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-800">{title}</p>
        {summary ? (
          <p className="text-[11px] text-slate-500 truncate mt-0.5 group-open:hidden">{summary}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge}
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-open:hidden">Abrir</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden group-open:inline">Fechar</span>
      </div>
    </summary>
    <div className="px-3.5 pb-3.5 pt-0 space-y-3 border-t border-slate-100">{children}</div>
  </details>
);
