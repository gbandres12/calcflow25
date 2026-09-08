import React, { useEffect, useState } from 'react';
import { FiscalConfig } from '../types';
import { fiscalService } from '../services/fiscalService';
import { validarConfigFiscal } from '../services/nfeGate';
import { CompanyFiscalSettingsModal } from './CompanyFiscalSettingsModal';
import { Building2, Key, AlertCircle, CheckCircle2, Settings } from 'lucide-react';

interface FiscalSettingsPageProps {
  companyId?: string;
}

export const FiscalSettingsPage: React.FC<FiscalSettingsPageProps> = ({ companyId }) => {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fiscalService.getConfig(companyId).then(setConfig);
  }, [companyId]);

  if (!config) {
    return <p className="text-xs font-bold text-slate-400">Carregando configuração fiscal…</p>;
  }

  const gate = validarConfigFiscal(config);

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-600 text-white rounded-2xl">
            <Building2 size={18} />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-800">Configuração fiscal (NF-e)</h3>
            <p className="text-xs text-slate-400 font-medium">
              Emitente, API NotaAs e ambiente SEFAZ. Fora da tela de notas.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black"
        >
          <Settings size={14} /> Abrir cadastro fiscal
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
          <p className="text-[10px] font-black uppercase text-slate-400">Emitente</p>
          <p className="font-bold text-slate-800 mt-1">{config.razaoSocial || 'Não informado'}</p>
          <p className="text-slate-500">CNPJ {config.cnpjEmitente || '—'}</p>
        </div>
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
          <p className="text-[10px] font-black uppercase text-slate-400">API / ambiente</p>
          <p className="font-bold text-slate-800 mt-1 flex items-center gap-1.5">
            <Key size={12} /> {config.apiKey ? 'Chave cadastrada' : 'Sem chave NotaAs'}
          </p>
          <p className="text-slate-500">{config.environment === 'production' ? 'Produção' : 'Sandbox'}</p>
        </div>
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
          <p className="text-[10px] font-black uppercase text-slate-400">Situação</p>
          {gate.errors.length === 0 ? (
            <p className="font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Pronta para emitir
            </p>
          ) : (
            <p className="font-bold text-amber-800 mt-1 flex items-center gap-1.5">
              <AlertCircle size={13} /> {gate.errors[0]}
            </p>
          )}
        </div>
      </div>

      {gate.errors.length > 0 && (
        <ul className="text-[11px] font-bold text-rose-700 space-y-1 list-disc pl-5">
          {gate.errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <CompanyFiscalSettingsModal
        isOpen={open}
        onClose={() => setOpen(false)}
        config={config}
        companyId={companyId}
        onSaveSuccess={(updated) => {
          setConfig(updated);
          setOpen(false);
        }}
      />
    </div>
  );
};

export default FiscalSettingsPage;
