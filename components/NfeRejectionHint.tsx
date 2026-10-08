import React from 'react';
import { Lightbulb } from 'lucide-react';
import { explainNfeRejection } from '../services/domain/nfeRejection';

/** "O que fazer" embaixo da mensagem crua da SEFAZ. Some quando não reconhece o erro. */
export const NfeRejectionHint: React.FC<{ message?: string | null; className?: string }> = ({ message, className = '' }) => {
  const help = explainNfeRejection(message);
  if (!help) return null;
  return (
    <div className={`flex gap-2 rounded-lg border border-sand bg-sand-soft px-3 py-2 text-sm text-ink ${className}`} role="note">
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-sand" />
      <div>
        <p className="font-bold">{help.title}</p>
        <p>{help.fix}</p>
      </div>
    </div>
  );
};

export default NfeRejectionHint;
