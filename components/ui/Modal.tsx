import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  /** Overlay some na impressão; o conteúdo permanece. */
  printSafe?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  printSafe,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled')
      );
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className={`fixed inset-0 z-[200] flex items-end sm:items-center justify-center ${printSafe ? 'print:static print:block' : 'print:hidden'}`}>
      <button
        type="button"
        className="absolute inset-0 bg-[var(--cf-ink)]/55 print:hidden"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex w-full flex-col bg-[var(--cf-paper)] max-h-[92dvh] sm:max-h-[90vh] rounded-t-xl sm:rounded-xl sm:mx-4 ${
          wide ? 'sm:max-w-5xl' : 'sm:max-w-3xl'
        } ${printSafe ? 'print:max-h-none print:max-w-none print:mx-0 print:rounded-none print:shadow-none' : ''}`}
      >
        <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-[var(--cf-line)] shrink-0 print:hidden">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-[var(--cf-ink)] leading-snug">
              {title}
            </h2>
            {subtitle ? <div className="mt-0.5 text-xs text-[var(--cf-muted)]">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg text-[var(--cf-muted)] hover:bg-[var(--cf-forest-soft)] min-h-11 min-w-11 flex items-center justify-center"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>
        <div className="overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <footer className="shrink-0 border-t border-[var(--cf-line)] px-4 py-3 print:hidden">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
};
