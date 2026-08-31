import React from 'react';
import { SO } from './theme';

export const SalesOrderSignatures: React.FC = () => (
  <section className="so-keep grid grid-cols-2 gap-10 pt-8">
    <div className="text-center">
      <div className="h-12" />
      <div className="border-t pt-1.5 mx-4" style={{ borderColor: SO.navy }} />
      <p className="text-[9px] font-medium" style={{ color: SO.muted }}>Assinatura do comprador</p>
    </div>
    <div className="text-center">
      <div className="h-12" />
      <div className="border-t pt-1.5 mx-4" style={{ borderColor: SO.navy }} />
      <p className="text-[9px] font-medium" style={{ color: SO.muted }}>Assinatura do recebedor</p>
    </div>
  </section>
);
