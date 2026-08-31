import React from 'react';
import { Company } from '../../types';
import { SO } from './theme';
import { dash } from './format';

interface Props {
  company: Company;
  title: string;
  orderNumber: string;
}

export const SalesOrderHeader: React.FC<Props> = ({ company, title, orderNumber }) => {
  const cityUf = [company.city, company.state].filter(Boolean).join(' / ');

  return (
    <header className="so-keep">
      <div className="flex items-start justify-between gap-4">
        <div className="w-[28%] shrink-0">
          <img
            src="/cba-logo.png"
            alt={company.name || 'Logo'}
            className="h-[72px] w-auto max-w-full object-contain object-left"
          />
        </div>

        <div className="flex-1 text-center px-2 pt-1">
          <h1
            className="text-[22px] leading-tight font-bold tracking-tight"
            style={{ color: SO.navy }}
          >
            {title}
          </h1>
          <p className="mt-1 text-[11px] font-medium" style={{ color: SO.muted }}>
            Nº{' '}
            <span className="text-[24px] font-bold leading-none" style={{ color: SO.green }}>
              {orderNumber}
            </span>
          </p>
        </div>

        <div className="w-[34%] text-right text-[10px] leading-[1.45]" style={{ color: SO.text }}>
          <p className="text-[10px] font-semibold" style={{ color: SO.navy }}>{dash(company.name)}</p>
          {company.document && <p>CNPJ: {company.document}</p>}
          {company.address && <p>{company.address}</p>}
          {cityUf && <p>{cityUf}</p>}
          {company.phone && <p>{company.phone}</p>}
        </div>
      </div>
      <div className="mt-3 h-px w-full" style={{ background: SO.green }} />
    </header>
  );
};
