import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ToastTone = 'info' | 'success' | 'danger';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClass: Record<ToastTone, string> = {
  info: 'bg-[var(--cf-ink)] text-white',
  success: 'bg-[var(--cf-forest)] text-white',
  danger: 'bg-rose-800 text-white',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[300] flex flex-col gap-2 max-w-sm" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`rounded-lg px-4 py-3 text-sm font-medium ${toneClass[item.tone]}`}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { push: (message) => console.warn(message) };
  }
  return ctx;
}
