import React from 'react';
import { Calendar, FileText, Hash, User } from 'lucide-react';
import { Customer, SaleOrder } from '../../types';
import { SO } from './theme';
import { dash, formatDate } from './format';

interface Props {
  order: SaleOrder;
  customer?: Customer;
}

const Field: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="min-w-0">
    <p className="flex items-center gap-1 text-[8px] font-medium" style={{ color: SO.muted }}>
      {icon}
      {label}
    </p>
    <p className="text-[11px] font-semibold truncate" style={{ color: SO.text }}>{value}</p>
  </div>
);

export const SalesOrderSummary: React.FC<Props> = ({ order, customer }) => {
  const ie = customer?.isentoIE ? 'Isento' : customer?.ie;

  return (
    <section
      className="so-keep rounded-md px-3.5 py-3"
      style={{ background: SO.bg, border: `1px solid ${SO.border}` }}
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-2.5">
        <Field icon={<Hash size={10} />} label="Pedido" value={dash(order.reference)} />
        <Field icon={<User size={10} />} label="Vendedor" value={dash(order.sellerName)} />
        <Field icon={<User size={10} />} label="Cliente" value={dash(customer?.name)} />
        <Field icon={<FileText size={10} />} label="CPF/CNPJ" value={dash(customer?.document)} />
        <Field icon={<FileText size={10} />} label="RG / IE" value={dash(ie)} />
      </div>
      <div
        className="mt-3 pt-2.5 grid grid-cols-3 gap-4"
        style={{ borderTop: `1px solid ${SO.border}` }}
      >
        <Field icon={<Calendar size={10} />} label="Data de criação" value={formatDate(order.date)} />
        <Field
          icon={<Calendar size={10} />}
          label="Data de emissão"
          value={formatDate(order.nfeEmissao || order.date)}
        />
        <Field
          icon={<Calendar size={10} />}
          label="Data de entrega"
          value={formatDate(order.deliveryDate)}
        />
      </div>
    </section>
  );
};
