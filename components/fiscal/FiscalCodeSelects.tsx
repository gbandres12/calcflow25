import React from 'react';
import { CFOP_OPTIONS, CST_ICMS_OPTIONS, CST_PIS_COFINS_OPTIONS, NfeOperacao, cfopsForOperacao } from './fiscalCatalog';

const selectClass =
  'w-full px-2 py-1.5 border rounded-lg text-xs font-bold outline-none bg-white';

export const CfopSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  operacao?: NfeOperacao;
  className?: string;
}> = ({ value, onChange, operacao, className }) => {
  const rows = operacao ? cfopsForOperacao(operacao) : CFOP_OPTIONS;
  const groups = Array.from(new Set(rows.map((r) => r.group)));
  const known = rows.some((r) => r.value === value);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${selectClass} border-purple-200 text-purple-900 ${className || ''}`}
    >
      {!known && value && <option value={value}>{value} (informado)</option>}
      {!value && <option value="">Selecione o CFOP</option>}
      {groups.map((group) => (
        <optgroup key={group} label={group}>
          {rows.filter((r) => r.group === group).map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

export const CstIcmsSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  const known = CST_ICMS_OPTIONS.some((r) => r.value === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${selectClass} border-blue-200 text-blue-900 ${className || ''}`}
    >
      {!known && value && <option value={value}>{value} (informado)</option>}
      {!value && <option value="">Selecione o CST</option>}
      <optgroup label="Simples Nacional">
        {CST_ICMS_OPTIONS.filter((r) => r.group === 'Simples Nacional').map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </optgroup>
      <optgroup label="Regime Normal">
        {CST_ICMS_OPTIONS.filter((r) => r.group === 'Regime Normal').map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </optgroup>
    </select>
  );
};

export const CstPisCofinsSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const known = CST_PIS_COFINS_OPTIONS.some((r) => r.value === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${selectClass} border-slate-200`}>
      {!known && value && <option value={value}>{value} (informado)</option>}
      {!value && <option value="">CST PIS/COFINS</option>}
      {CST_PIS_COFINS_OPTIONS.map((r) => (
        <option key={r.value} value={r.value}>{r.label}</option>
      ))}
    </select>
  );
};
