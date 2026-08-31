import React from 'react';
import { MapPin } from 'lucide-react';
import { Customer } from '../../types';
import { SO } from './theme';
import { dash } from './format';

interface Props {
  customer?: Customer;
}

const AddressCard: React.FC<{ title: string; customer?: Customer }> = ({ title, customer }) => (
  <div
    className="rounded-md px-3.5 py-3 min-w-0"
    style={{ background: SO.bg, border: `1px solid ${SO.border}` }}
  >
    <p className="flex items-center gap-1.5 text-[11px] font-bold mb-2.5" style={{ color: SO.navy }}>
      <MapPin size={12} style={{ color: SO.green }} />
      {title}
    </p>
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
      <div className="col-span-2">
        <span className="block font-medium" style={{ color: SO.muted }}>Endereço</span>
        <span className="font-semibold" style={{ color: SO.text }}>{dash(customer?.street)}</span>
      </div>
      <div>
        <span className="block font-medium" style={{ color: SO.muted }}>Número</span>
        <span className="font-semibold" style={{ color: SO.text }}>{dash(customer?.number || (customer?.street ? 'SN' : ''))}</span>
      </div>
      <div>
        <span className="block font-medium" style={{ color: SO.muted }}>Complemento</span>
        <span className="font-semibold" style={{ color: SO.text }}>—</span>
      </div>
      <div>
        <span className="block font-medium" style={{ color: SO.muted }}>Bairro</span>
        <span className="font-semibold" style={{ color: SO.text }}>{dash(customer?.neighborhood)}</span>
      </div>
      <div>
        <span className="block font-medium" style={{ color: SO.muted }}>CEP</span>
        <span className="font-semibold" style={{ color: SO.text }}>{dash(customer?.zipCode)}</span>
      </div>
      <div>
        <span className="block font-medium" style={{ color: SO.muted }}>Cidade</span>
        <span className="font-semibold" style={{ color: SO.text }}>{dash(customer?.city)}</span>
      </div>
      <div>
        <span className="block font-medium" style={{ color: SO.muted }}>Estado</span>
        <span className="font-semibold" style={{ color: SO.text }}>{dash(customer?.state)}</span>
      </div>
    </div>
  </div>
);

export const CustomerAddresses: React.FC<Props> = ({ customer }) => (
  <section className="so-keep grid grid-cols-1 md:grid-cols-2 gap-3">
    <AddressCard title="Endereço de cobrança" customer={customer} />
    <AddressCard title="Endereço de entrega" customer={customer} />
  </section>
);
