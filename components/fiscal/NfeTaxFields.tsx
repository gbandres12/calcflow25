import React from 'react';
import { SaleOrderItem } from '../../types';
import { ItemTaxes, NfeTaxTotals, isIcmsTributado, CST_ICMS_COM_REDUCAO } from '../../services/nfeTaxes';

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type TaxField =
  | 'aliquotaIcms'
  | 'reducaoBcIcms'
  | 'baseCalculoIcms'
  | 'valorIcms'
  | 'destacarIpi'
  | 'cstIpi'
  | 'aliquotaIpi'
  | 'cEnqIpi';

interface ItemTaxEditorProps {
  item: Partial<SaleOrderItem> & { cst?: string };
  taxes?: ItemTaxes;
  onChange: (field: TaxField, value: any) => void;
}

export const DecimalTaxInput: React.FC<{
  value: number | undefined;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onChange: (val: number | undefined) => void;
}> = ({ value, placeholder, disabled, className, onChange }) => {
  const [text, setText] = React.useState<string>(() => (value != null ? String(value).replace('.', ',') : ''));
  const isFocusedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isFocusedRef.current) {
      setText(value != null ? String(value).replace('.', ',') : '');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitized = raw.replace(/[^0-9.,]/g, '');
    const parts = sanitized.split(/[.,]/);
    let finalStr = sanitized;
    if (parts.length > 2) {
      finalStr = parts[0] + ',' + parts.slice(1).join('');
    }

    setText(finalStr);

    const cleaned = finalStr.replace(',', '.').trim();
    if (cleaned === '' || cleaned === '.') {
      onChange(undefined);
    } else {
      const num = Number(cleaned);
      if (Number.isFinite(num)) {
        onChange(num);
      }
    }
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    if (value != null) {
      setText(String(value).replace('.', ','));
    } else {
      setText('');
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
};

const inputCls =
  'w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold outline-none focus:border-purple-500';
const labelCls = 'text-[10px] font-black uppercase text-slate-500';

/** Painel por item: alíquota/base/valor do ICMS e grupo IPI opcional. */
export const ItemTaxEditor: React.FC<ItemTaxEditorProps> = ({ item, taxes, onChange }) => {
  const cst = String(item.cst || '').trim();
  const tributado = isIcmsTributado(cst);
  const comReducao = CST_ICMS_COM_REDUCAO.includes(cst) || cst === '90';

  return (
    <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-emerald-700">ICMS · CST {cst || '—'}</span>
        {!tributado && (
          <span className="text-[10px] text-slate-500">
            CST sem destaque de ICMS. Use 00, 10, 20, 51, 70, 90 (ou CSOSN 900) para destacar.
          </span>
        )}
      </div>
      {tributado && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="space-y-0.5">
            <span className={labelCls}>Alíq. ICMS (%)</span>
            <DecimalTaxInput
              className={inputCls}
              value={item.aliquotaIcms}
              placeholder={String(taxes?.aliquotaIcms ?? 0).replace('.', ',')}
              onChange={(v) => onChange('aliquotaIcms', v)}
            />
          </label>
          {comReducao && (
            <label className="space-y-0.5">
              <span className={labelCls}>Redução BC (%)</span>
              <DecimalTaxInput
                className={inputCls}
                value={item.reducaoBcIcms}
                placeholder="0"
                onChange={(v) => onChange('reducaoBcIcms', v)}
              />
            </label>
          )}
          <label className="space-y-0.5">
            <span className={labelCls}>Base ICMS (R$)</span>
            <DecimalTaxInput
              className={inputCls}
              value={item.baseCalculoIcms}
              placeholder={(taxes?.baseCalculoIcms ?? 0).toFixed(2).replace('.', ',')}
              onChange={(v) => onChange('baseCalculoIcms', v)}
            />
          </label>
          <label className="space-y-0.5">
            <span className={labelCls}>Valor ICMS (R$)</span>
            <DecimalTaxInput
              className={inputCls}
              value={item.valorIcms}
              placeholder={(taxes?.valorIcms ?? 0).toFixed(2).replace('.', ',')}
              onChange={(v) => onChange('valorIcms', v)}
            />
          </label>
        </div>
      )}
      {tributado && (
        <p className="text-[10px] text-slate-500">
          Base e valor são calculados automaticamente (frete rateado {brl(taxes?.freteRateado || 0)}). Preencha só para sobrescrever.
        </p>
      )}

      <label className="flex items-center gap-2 pt-1 border-t border-slate-200">
        <input
          type="checkbox"
          checked={Boolean(item.destacarIpi)}
          onChange={(e) => onChange('destacarIpi', e.target.checked)}
        />
        <span className="text-[10px] font-black uppercase text-orange-700">Destacar IPI neste item</span>
      </label>
      {item.destacarIpi && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="space-y-0.5">
            <span className={labelCls}>CST IPI</span>
            <select className={inputCls} value={item.cstIpi || '50'} onChange={(e) => onChange('cstIpi', e.target.value)}>
              <option value="50">50 - Saída tributada</option>
              <option value="99">99 - Outras saídas</option>
              <option value="49">49 - Outras entradas</option>
              <option value="00">00 - Entrada c/ crédito</option>
              <option value="51">51 - Saída alíquota zero</option>
              <option value="52">52 - Saída isenta</option>
              <option value="53">53 - Saída não tributada</option>
              <option value="54">54 - Saída imune</option>
              <option value="55">55 - Saída c/ suspensão</option>
            </select>
          </label>
          <label className="space-y-0.5">
            <span className={labelCls}>Alíq. IPI (%)</span>
            <DecimalTaxInput
              className={inputCls}
              disabled={!taxes?.ipiTributado}
              value={item.aliquotaIpi}
              placeholder={String(taxes?.aliquotaIpi ?? 0).replace('.', ',')}
              onChange={(v) => onChange('aliquotaIpi', v)}
            />
          </label>
          <label className="space-y-0.5">
            <span className={labelCls}>Enquadr. (cEnq)</span>
            <input
              className={inputCls}
              inputMode="numeric"
              maxLength={3}
              value={item.cEnqIpi ?? ''}
              placeholder="999"
              onChange={(e) => onChange('cEnqIpi', e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className="space-y-0.5">
            <span className={labelCls}>BC / Valor IPI</span>
            <p className="px-2 py-1.5 text-xs font-mono font-bold text-orange-800">
              {brl(taxes?.baseCalculoIpi || 0)} / {brl(taxes?.valorIpi || 0)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

/** Quadro "Cálculo do Imposto" (igual ao DANFE). */
export const NfeTaxSummary: React.FC<{ totals: NfeTaxTotals }> = ({ totals }) => {
  const cells: [string, number, string?][] = [
    ['Base de Cálculo ICMS', totals.baseCalculoIcms],
    ['Valor do ICMS', totals.valorIcms, 'text-emerald-700'],
    ['Valor dos Produtos', totals.valorProdutos],
    ['Valor do Frete', totals.valorFrete],
    ['Valor do IPI', totals.valorIpi, 'text-orange-700'],
    ['Valor Total da Nota', totals.valorTotalNota, 'text-purple-700'],
  ];
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-100 text-[10px] font-black uppercase text-slate-600 tracking-wider">
        Cálculo do Imposto
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-slate-100">
        {cells.map(([k, v, cls]) => (
          <div key={k} className="p-2.5 bg-white">
            <p className="text-[10px] font-bold uppercase text-slate-400">{k}</p>
            <p className={`text-sm font-black font-mono ${cls || 'text-slate-800'}`}>{brl(v)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
