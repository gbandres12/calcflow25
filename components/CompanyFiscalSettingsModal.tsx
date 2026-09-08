import React, { useState, useEffect } from 'react';
import { FiscalConfig } from '../types';
import { fiscalService } from '../services/fiscalService';
import { 
  Building2, MapPin, Search, Save, X, Check, AlertCircle, 
  Phone, Mail, FileText, Sparkles, RefreshCw, Hash, Globe, ShieldCheck
} from 'lucide-react';
import { fetchAddressByCep, formatCep, fetchIbgeByCityUf } from '../services/cepService';

interface CompanyFiscalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: FiscalConfig;
  companyId?: string;
  onSaveSuccess: (updatedConfig: FiscalConfig) => void;
}

export const CompanyFiscalSettingsModal: React.FC<CompanyFiscalSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  companyId,
  onSaveSuccess
}) => {
  const [formData, setFormData] = useState<FiscalConfig>({ ...config });
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [cepMessage, setCepMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...config });
      setCepStatus('idle');
      setCepMessage('');
      setErrorMessage(null);
      setSaveSuccess(false);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  // Consulta automática de CEP via ViaCEP
  const handleCepLookup = async (cepToSearch: string) => {
    const cleanCep = (cepToSearch || '').replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setCepStatus('error');
      setCepMessage('CEP deve ter 8 dígitos');
      return;
    }

    setIsLoadingCep(true);
    setCepStatus('idle');
    setCepMessage('Buscando endereço via ViaCEP...');

    try {
      const data = await fetchAddressByCep(cleanCep);
      if (data && !data.erro) {
        let ibge = data.ibge || '';
        if (!ibge && data.localidade && data.uf) {
          ibge = (await fetchIbgeByCityUf(data.localidade, data.uf)) || '';
        }

        setFormData(prev => ({
          ...prev,
          cepEmitente: formatCep(cleanCep),
          logradouroEmitente: data.logradouro || prev.logradouroEmitente,
          bairroEmitente: data.bairro || prev.bairroEmitente,
          cidadeEmitente: data.localidade || prev.cidadeEmitente,
          ufEmitente: data.uf || prev.ufEmitente,
          ibgeEmitente: ibge || prev.ibgeEmitente
        }));

        setCepStatus('success');
        setCepMessage(`Localizado: ${data.localidade}/${data.uf} (IBGE: ${ibge || 'Consulte'})`);
      } else {
        setCepStatus('error');
        setCepMessage('CEP não encontrado na base dos Correios.');
      }
    } catch (err: any) {
      setCepStatus('error');
      setCepMessage('Erro ao consultar CEP. Preencha manualmente.');
    } finally {
      setIsLoadingCep(false);
    }
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCep(e.target.value);
    setFormData(prev => ({ ...prev, cepEmitente: formatted }));
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 8) {
      handleCepLookup(digits);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    // Validações básicas da empresa emitente
    if (!formData.razaoSocial?.trim()) {
      setErrorMessage('A Razão Social da empresa emitente é obrigatória.');
      setIsSaving(false);
      return;
    }

    const cleanCnpj = (formData.cnpjEmitente || '').replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      setErrorMessage('CNPJ inválido. Um CNPJ de empresa deve conter 14 dígitos numéricos.');
      setIsSaving(false);
      return;
    }

    if (!formData.inscricaoEstadual?.trim()) {
      setErrorMessage('Inscrição Estadual (IE) é obrigatória para emissão de NF-e.');
      setIsSaving(false);
      return;
    }

    try {
      const saved = await fiscalService.saveConfig(formData, companyId);
      setSaveSuccess(true);
      onSaveSuccess(saved);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(`Erro ao salvar configurações: ${err?.message || 'Falha desconhecida'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden my-6">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
              <Building2 size={24} className="text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Dados da Empresa Emitente</h2>
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30">
                  NF-e Modelo 55
                </span>
              </div>
              <p className="text-xs text-purple-200/80 font-medium">
                Configure os dados cadastrais, fiscais e endereço oficial da sua mineradora
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-purple-200 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {saveSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-in fade-in">
              <Check size={18} className="text-emerald-600" />
              Dados da empresa emitente atualizados com sucesso!
            </div>
          )}

          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-bold flex items-center gap-2 animate-in fade-in">
              <AlertCircle size={18} className="text-rose-600 shrink-0" />
              {errorMessage}
            </div>
          )}

          {/* 1. IDENTIFICAÇÃO DA EMPRESA */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <FileText size={16} className="text-purple-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                1. Identificação Jurídica & Tributação (SEFAZ)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Razão Social Completa (xNome) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.razaoSocial}
                  onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value.toUpperCase() })}
                  placeholder="Ex: CALCARIOFLOW MINERACAO E INDUSTRIA LTDA"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Nome Fantasia (xFant)
                </label>
                <input
                  type="text"
                  value={formData.nomeFantasia || ''}
                  onChange={(e) => setFormData({ ...formData, nomeFantasia: e.target.value })}
                  placeholder="Ex: CalcárioFlow Mineração"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Regime Tributário (CRT) *
                </label>
                <select
                  value={formData.regimeTributario}
                  onChange={(e) => setFormData({ ...formData, regimeTributario: e.target.value as any })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                >
                  <option value="1">1 - Simples Nacional</option>
                  <option value="2">2 - Simples Nacional (Excesso de Sublimite)</option>
                  <option value="3">3 - Regime Normal (Lucro Presumido / Real)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  CNPJ do Emitente *
                </label>
                <input
                  type="text"
                  required
                  value={formData.cnpjEmitente}
                  onChange={(e) => setFormData({ ...formData, cnpjEmitente: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Inscrição Estadual (IE) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.inscricaoEstadual}
                  onChange={(e) => setFormData({ ...formData, inscricaoEstadual: e.target.value })}
                  placeholder="Ex: 15.489.201-9"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Inscrição Municipal (IM)
                </label>
                <input
                  type="text"
                  value={formData.inscricaoMunicipal || ''}
                  onChange={(e) => setFormData({ ...formData, inscricaoMunicipal: e.target.value })}
                  placeholder="Opcional"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  CNAE Principal
                </label>
                <input
                  type="text"
                  value={formData.cnae || ''}
                  onChange={(e) => setFormData({ ...formData, cnae: e.target.value })}
                  placeholder="Ex: 0810-0/04 - Extração de calcário e dolomita"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          {/* 2. ENDEREÇO DO ESTABELECIMENTO */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-purple-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  2. Endereço do Estabelecimento Emitente (enderEmit)
                </h3>
              </div>
              <span className="text-[10px] text-slate-400">Busca automática via CEP</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* CEP com busca */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between">
                  <span>CEP *</span>
                  {isLoadingCep && <span className="text-purple-600 flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Buscando...</span>}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.cepEmitente || ''}
                    onChange={handleCepChange}
                    placeholder="68000-000"
                    maxLength={9}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => handleCepLookup(formData.cepEmitente || '')}
                    disabled={isLoadingCep}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-purple-600 rounded-lg hover:bg-slate-100 transition-colors"
                    title="Buscar dados pelo CEP"
                  >
                    <Search size={14} />
                  </button>
                </div>
                {cepMessage && (
                  <p className={`text-[10px] font-medium ${cepStatus === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {cepMessage}
                  </p>
                )}
              </div>

              {/* Logradouro */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Logradouro (Rua, Rodovia, Fazenda, etc.) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.logradouroEmitente || ''}
                  onChange={(e) => setFormData({ ...formData, logradouroEmitente: e.target.value })}
                  placeholder="Ex: Rodovia Mineral BR-163, Km 42"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              {/* Número */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Número
                </label>
                <input
                  type="text"
                  value={formData.numeroEmitente || ''}
                  onChange={(e) => setFormData({ ...formData, numeroEmitente: e.target.value })}
                  placeholder="Ex: S/N ou 1000"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              {/* Complemento */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Complemento
                </label>
                <input
                  type="text"
                  value={formData.complementoEmitente || ''}
                  onChange={(e) => setFormData({ ...formData, complementoEmitente: e.target.value })}
                  placeholder="Ex: Galpão Industrial 01"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              {/* Bairro */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Bairro *
                </label>
                <input
                  type="text"
                  required
                  value={formData.bairroEmitente || ''}
                  onChange={(e) => setFormData({ ...formData, bairroEmitente: e.target.value })}
                  placeholder="Ex: Distrito Industrial"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              {/* Cidade */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Cidade / Município *
                </label>
                <input
                  type="text"
                  required
                  value={formData.cidadeEmitente || ''}
                  onChange={(e) => setFormData({ ...formData, cidadeEmitente: e.target.value })}
                  placeholder="Ex: Santarém"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              {/* UF */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  UF (Estado) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={2}
                  value={formData.ufEmitente || ''}
                  onChange={(e) => setFormData({ ...formData, ufEmitente: e.target.value.toUpperCase() })}
                  placeholder="PA"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 uppercase"
                />
              </div>

              {/* Código IBGE */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between">
                  <span>Código IBGE (cMun) *</span>
                  <span className="text-[9px] text-slate-400">7 dígitos</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={7}
                  value={formData.ibgeEmitente || ''}
                  onChange={(e) => setFormData({ ...formData, ibgeEmitente: e.target.value.replace(/\D/g, '') })}
                  placeholder="Ex: 1506807"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 font-mono"
                />
              </div>

            </div>
          </div>

          {/* 3. CONTATOS E NUMERAÇÃO */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Phone size={16} className="text-purple-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                3. Contatos Fiscais & Série de Emissão
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Telefone de Contato da Empresa
                </label>
                <input
                  type="text"
                  value={formData.telefoneEmitente || ''}
                  onChange={(e) => setFormData({ ...formData, telefoneEmitente: e.target.value })}
                  placeholder="Ex: (93) 3522-8000"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  E-mail Fiscal (Recebimento de cópias)
                </label>
                <input
                  type="email"
                  value={formData.emailEmitente || ''}
                  onChange={(e) => setFormData({ ...formData, emailEmitente: e.target.value })}
                  placeholder="Ex: fiscal@suaempresa.com.br"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Série da NF-e
                </label>
                <input
                  type="text"
                  value={formData.serieNFe || '1'}
                  onChange={(e) => setFormData({ ...formData, serieNFe: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Próximo Número NF-e
                </label>
                <input
                  type="number"
                  value={formData.proxNumeroNFe || 1}
                  onChange={(e) => setFormData({ ...formData, proxNumeroNFe: parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Ambiente SEFAZ
                </label>
                <select
                  value={formData.environment}
                  onChange={(e) => setFormData({ ...formData, environment: e.target.value as any })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                >
                  <option value="sandbox">Homologação / Sandbox (Sem valor fiscal)</option>
                  <option value="production">Produção Real (SEFAZ Nacional)</option>
                </select>
              </div>

            </div>
          </div>

          {/* Footer com Ações */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-purple-200 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            >
              <Save size={16} />
              {isSaving ? 'Salvando...' : 'Salvar Dados da Empresa'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
