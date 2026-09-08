import React, { useEffect, useState } from 'react';
import { Company, FiscalConfig, View } from '../types';
import { fiscalService } from '../services/fiscalService';
import {
  Sliders, Building2, Key, Save, RefreshCw, CheckCircle2, AlertTriangle, ArrowLeft
} from 'lucide-react';

interface FiscalConfigViewProps {
  company: Company;
  companyId?: string;
  onNavigate?: (view: View) => void;
}

export const FiscalConfigView: React.FC<FiscalConfigViewProps> = ({
  company,
  companyId,
  onNavigate
}) => {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<'emitente' | 'api' | 'tributacao'>('emitente');

  useEffect(() => {
    let alive = true;
    fiscalService.getConfig(companyId)
      .then((c) => { if (alive) setConfig(c); })
      .catch(() => {
        if (alive) setMsg('Não foi possível carregar a configuração fiscal.');
      });
    return () => { alive = false; };
  }, [companyId]);

  const patch = (partial: Partial<FiscalConfig>) => {
    setConfig((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setMsg('');
    try {
      const saved = await fiscalService.saveConfig(config, companyId);
      setConfig(saved);
      setMsg('Configuração fiscal salva no Supabase.');
    } catch {
      setMsg('Falha ao salvar. Confira a conexão com o Supabase.');
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center h-80 text-slate-500 font-bold text-sm gap-2">
        <RefreshCw className="animate-spin text-purple-600" size={18} />
        Carregando configuração fiscal…
      </div>
    );
  }

  const input = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-purple-500';
  const label = 'text-[10px] font-black uppercase tracking-widest text-slate-400';

  return (
    <div className="space-y-5">
      <header className="bg-white border border-slate-200 rounded-[2rem] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Sliders className="text-purple-600" size={24} />
            Configuração de Nota Fiscal
          </h1>
          <p className="text-xs font-bold text-slate-400 mt-1">
            Emitente, API NotaAs e regras da NF-e da empresa logada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onNavigate && (
            <button type="button" onClick={() => onNavigate('fiscal')} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-600">
              <ArrowLeft size={14} className="inline mr-1" /> Notas emitidas
            </button>
          )}
          <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-black disabled:opacity-50">
            <Save size={14} className="inline mr-1" /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </header>

      {msg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-4 py-3 rounded-2xl flex items-center gap-2">
          <CheckCircle2 size={16} /> {msg}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid sm:grid-cols-3 gap-3 text-xs font-bold text-slate-600">
        <div>
          <p className={label}>Empresa</p>
          <p className="text-slate-800">{config.razaoSocial || company?.name || '—'}</p>
        </div>
        <div>
          <p className={label}>CNPJ</p>
          <p className="text-slate-800">{config.cnpjEmitente || company?.document || '—'}</p>
        </div>
        <div>
          <p className={label}>Ambiente</p>
          <p className="text-slate-800">{config.environment === 'production' ? 'Produção' : 'Homologação'} · {config.modoEmissao === 'api_real' ? 'API real' : 'Simulação'}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['emitente', 'api', 'tributacao'] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${tab === id ? 'bg-purple-600 text-white' : 'bg-white border text-slate-600'}`}>
            {id === 'emitente' ? 'Emitente' : id === 'api' ? 'API & SEFAZ' : 'Tributação'}
          </button>
        ))}
      </div>

      {tab === 'emitente' && (
        <section className="bg-white border border-slate-200 rounded-[2rem] p-6 grid sm:grid-cols-2 gap-4">
          <h2 className="sm:col-span-2 text-sm font-black text-slate-800 flex items-center gap-2"><Building2 size={16} className="text-purple-600" /> Dados do emitente</h2>
          <label className="space-y-1"><span className={label}>Razão social</span><input className={input} value={config.razaoSocial || ''} onChange={(e) => patch({ razaoSocial: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>Nome fantasia</span><input className={input} value={config.nomeFantasia || ''} onChange={(e) => patch({ nomeFantasia: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>CNPJ</span><input className={input} value={config.cnpjEmitente || ''} onChange={(e) => patch({ cnpjEmitente: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>Inscrição estadual</span><input className={input} value={config.inscricaoEstadual || ''} onChange={(e) => patch({ inscricaoEstadual: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>Telefone</span><input className={input} value={config.telefoneEmitente || ''} onChange={(e) => patch({ telefoneEmitente: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>E-mail</span><input className={input} value={config.emailEmitente || ''} onChange={(e) => patch({ emailEmitente: e.target.value })} /></label>
          <label className="space-y-1 sm:col-span-2"><span className={label}>Logradouro</span><input className={input} value={config.logradouroEmitente || ''} onChange={(e) => patch({ logradouroEmitente: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>Número</span><input className={input} value={config.numeroEmitente || ''} onChange={(e) => patch({ numeroEmitente: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>Bairro</span><input className={input} value={config.bairroEmitente || ''} onChange={(e) => patch({ bairroEmitente: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>Cidade</span><input className={input} value={config.cidadeEmitente || ''} onChange={(e) => patch({ cidadeEmitente: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>UF</span><input className={input} maxLength={2} value={config.ufEmitente || ''} onChange={(e) => patch({ ufEmitente: e.target.value.toUpperCase() })} /></label>
          <label className="space-y-1"><span className={label}>CEP</span><input className={input} value={config.cepEmitente || ''} onChange={(e) => patch({ cepEmitente: e.target.value })} /></label>
        </section>
      )}

      {tab === 'api' && (
        <section className="bg-white border border-slate-200 rounded-[2rem] p-6 grid sm:grid-cols-2 gap-4">
          <h2 className="sm:col-span-2 text-sm font-black text-slate-800 flex items-center gap-2"><Key size={16} className="text-purple-600" /> Integração NotaAs</h2>
          {!config.apiKey && (
            <p className="sm:col-span-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={14} /> Sem Project Key a emissão real fica bloqueada. Cole a chave que começa com ntaas_.
            </p>
          )}
          <label className="space-y-1 sm:col-span-2"><span className={label}>Project Key</span><input className={input} type="password" value={config.apiKey || ''} onChange={(e) => patch({ apiKey: e.target.value })} placeholder="ntaas_..." /></label>
          <label className="space-y-1"><span className={label}>Modo de emissão</span>
            <select className={input} value={config.modoEmissao || 'sandbox_local'} onChange={(e) => patch({ modoEmissao: e.target.value as FiscalConfig['modoEmissao'] })}>
              <option value="sandbox_local">Simulação</option>
              <option value="api_real">API real</option>
            </select>
          </label>
          <label className="space-y-1"><span className={label}>Ambiente SEFAZ</span>
            <select className={input} value={config.environment || 'sandbox'} onChange={(e) => patch({ environment: e.target.value as FiscalConfig['environment'] })}>
              <option value="sandbox">Homologação</option>
              <option value="production">Produção</option>
            </select>
          </label>
          <label className="space-y-1"><span className={label}>Série NF-e</span><input className={input} value={config.serieNFe || ''} onChange={(e) => patch({ serieNFe: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>Próximo número</span><input className={input} type="number" value={config.proxNumeroNFe || 1} onChange={(e) => patch({ proxNumeroNFe: Number(e.target.value) || 1 })} /></label>
        </section>
      )}

      {tab === 'tributacao' && (
        <section className="bg-white border border-slate-200 rounded-[2rem] p-6 grid sm:grid-cols-2 gap-4">
          <h2 className="sm:col-span-2 text-sm font-black text-slate-800">Regras tributárias padrão</h2>
          <label className="space-y-1"><span className={label}>CFOP estadual</span><input className={input} value={config.cfopPadraoEstadual || ''} onChange={(e) => patch({ cfopPadraoEstadual: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>CFOP interestadual</span><input className={input} value={config.cfopPadraoInterestadual || ''} onChange={(e) => patch({ cfopPadraoInterestadual: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>CST ICMS</span><input className={input} value={config.cstIcmsPadrao || ''} onChange={(e) => patch({ cstIcmsPadrao: e.target.value })} /></label>
          <label className="space-y-1"><span className={label}>Natureza da operação</span><input className={input} value={config.naturezaOperacaoPadrao || ''} onChange={(e) => patch({ naturezaOperacaoPadrao: e.target.value })} /></label>
        </section>
      )}
    </div>
  );
};

export default FiscalConfigView;
