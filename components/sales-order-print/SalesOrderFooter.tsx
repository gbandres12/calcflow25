import React from 'react';
import { SO } from './theme';

interface Props {
  printedAt: string;
}

export const SalesOrderFooter: React.FC<Props> = ({ printedAt }) => (
  <footer className="so-keep mt-4">
    <div className="h-px w-full mb-1.5" style={{ background: SO.green }} />
    <div className="flex items-center justify-between text-[8px]" style={{ color: SO.muted }}>
      <span>Emitido por CalcárioFlow ERP</span>
      <span>Impresso em: {printedAt}</span>
    </div>
  </footer>
);
