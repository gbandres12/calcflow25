import React, { useState, useRef, useEffect } from 'react';
import { SaleOrder, Customer, FiscalConfig, Company } from '../types';
import { fiscalService } from '../services/fiscalService';
import { db } from '../services/dataService';
import { 
  X, Send, ShieldCheck, AlertCircle, CheckCircle2, 
  Building, User, FileText, Hash, MapPin, Truck, Sparkles, Settings,
  Edit3, Save, Search, RefreshCw, Key, Check, Database
} from 'lucide-react';
import { CompanyFiscalSettingsModal } from './CompanyFiscalSettingsModal';
import { DatabaseStatusModal } from './DatabaseStatusModal';
import { fetchAddressByCep, formatCep, fetchIbgeByCityUf } from '../services/cepService';

interface EmitirNfeModalProps {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig;
  company: Company;
  onClose: () => void;
  onSuccess: (updatedOrder: SaleOrder) => void;
  devolutionChave?: string;
  transferencia?: boolean;
}

export const EmitirNfeModal: React.FC<EmitirNfeModalProps> = ({
  order,
  customer,
  config,
  company,
  onClose,
  onSuccess,
  devolutionChave,
  transferencia
}) => {
  const [currentConfig, setCurrentConfig] = useState<FiscalConfig>(config);
  const [activeCustomer, setActiveCustomer] = useState<Customer>({ ...customer });
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chaveDevolucao, setChaveDevolucao] = useState(devolutionChave || order.nfeChave || '');
  const [quickApiKey, setQuickApiKey] = useState(config.apiKey || '');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySavedSuccess, setKeySavedSuccess] = useState(false);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [cepFeedback, setCepFeedback] = useState<string | null>(null);
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);

  const isSubmittingRef = useRef(false);
  const isDevolucao = Boolean(devolutionChave);
  const isTransferencia = Boolean(transferencia) && !isDevolucao;

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const validation = fiscalService.validarDadosFiscais(order, activeCustomer);

  // Safety unlock in case of unforeseen lockups
  useEffect(() => {
    const timer = setTimeout(() => {
      isSubmittingRef.current = false;
    }, 12000);
    return () => clearTimeout(timer);
  }, [loading]);

  const handleCepLookup = async (cepValue: string) => {
    const cleanCep = (cepValue || '').replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setCepFeedback('CEP deve conter 8 dígitos.');
      return;
    }

    setIsLoadingCep(true);
    setCepFeedback('Consultando ViaCEP...');

    try {
      const data = await fetchAddressByCep(cleanCep);
      if (data && !data.erro) {
        let ibge = data.ibge || '';
        if (!ibge && data.localidade && data.uf) {
          ibge = (await fetchIbgeByCityUf(data.localidade, data.uf)) || '';
        }

        setActiveCustomer(prev => ({
          ...prev,
          zipCode: formatCep(cleanCep),
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
          ibgeCode: ibge || prev.ibgeCode
        }));

        setCepFeedback(`Localizado: ${data.localidade}/${data.uf} (IBGE: ${ibge || '1506807'})`);
      } else {
        setCepFeedback('CEP não encontrado na base dos Correios.');
      }
    } catch {
      setCepFeedback('Erro ao consultar CEP. Preencha manualmente.');
    } finally {
      setIsLoadingCep(false);
    }
  };

  const handleSaveCustomerFiscalData = async () => {
    try {
      const compId = order.companyId || company.id;
      await db.upsert('customers', compId, activeCustomer);
      setIsEditingCustomer(false);
      setCepFeedback(null);
    } catch (err: any) {
      console.warn('Erro ao salvar cliente localmente:', err);
      setIsEditingCustomer(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!quickApiKey.trim()) return;
    setIsSavingKey(true);
    try {
      const updated = await fiscalService.saveConfig({
        ...currentConfig,
        apiKey: quickApiKey.trim(),
        modoEmissao: 'api_real'
      }, order.companyId || company.id);
      setCurrentConfig(updated);
      setKeySavedSuccess(true);
      setTimeout(() => setKeySavedSuccess(false), 2500);
    } catch (err: any) {
      setErrorMsg(`Erro ao salvar chave: ${err.message}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleEmitir = async (forceLocal = false) => {
    if (isSubmittingRef.current || loading) {
      console.warn('⚠️ [EMISSÃO] Ação em processamento...');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setErrorMsg(null);

    const activeConfig = forceLocal 
      ? { ...currentConfig, modoEmissao: 'sandbox_local' as const } 
      : currentConfig;

    try {
      const opts = isDevolucao
        ? { devolucao: { chaveAcesso: chaveDevolucao, nItem: 1 } }
        : isTransferencia
          ? { transferencia: true }
          : undefined;

      const payloadSent = fiscalService.montarPayloadNotaAs(order, activeCustomer, activeConfig, opts);
      const result = await fiscalService.emitirNFe(
        { ...order, companyId: order.companyId || company.id },
        activeCustomer,
        activeConfig,
        order.companyId || company.id,
        opts
      );

      if (result.success) {
        let finalStatus = result.nfeStatus;

        // Se o servidor respondeu status processando, dispara polling de acompanhamento
        if (result.nfeStatus === 'processando' && result.nfeId) {
          const pollResult = await fiscalService.consultarEAtualizarStatusProcessamento(result.nfeId, activeConfig, 3, 2000);
          if (pollResult.success && pollResult.status && pollResult.status !== 'nao_emitida') {
            finalStatus = pollResult.status;
          }
        }

        const updatedOrder: SaleOrder = {
          ...order,
          nfeStatus: finalStatus,
          nfeId: result.nfeId,
          nfeChave: result.nfeChave,
          nfeNumero: result.nfeNumero,
          nfeSerie: result.nfeSerie,
          nfeProtocolo: result.nfeProtocolo,
          nfeDanfeUrl: result.nfeDanfeUrl,
          nfeXmlUrl: result.nfeXmlUrl,
          nfeEmissao: result.nfeEmissao,
          nfeNaturezaOperacao: result.naturezaOperacao,
          nfePayload: payloadSent,
          nfeRawResponse: result.rawResponse
        };

        onSuccess(updatedOrder);
      } else {
        setErrorMsg(result.nfeErro || 'Rejeição na emissão da NF-e.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro de comunicação com o serviço fiscal.');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const hasApiKey = Boolean((currentConfig.apiKey || '').trim());

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[150] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-4 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-600 text-white rounded-2xl shadow-lg shadow-purple-100 shrink-0">
              <Send size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">
                  {isDevolucao ? 'Nota de Devolução (NF-e)' : isTransferencia ? 'NF-e de Transferência de Estoque' : 'Emissão de NF-e Eletrônica'}
                </h3>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  currentConfig.environment === 'production' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {currentConfig.environment === 'production' ? 'Produção SEFAZ' : 'Homologação'}
                </span>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  currentConfig.modoEmissao === 'sandbox_local' ? 'bg-sky-100 text-sky-800' : 'bg-purple-100 text-purple-800'
                }`}>
                  {currentConfig.modoEmissao === 'sandbox_local' ? 'Modo Simulação' : `API Real (${(currentConfig.apiProvider || 'notaas').toUpperCase()})`}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Pedido <b>{order.reference}</b> | Próximo Nº NF-e: <b>{currentConfig.proxNumeroNFe || 1042}</b> (Série {currentConfig.serieNFe || 1})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          
          {/* Alerta se Chave de API Não Estiver Configurada */}
          {!hasApiKey && currentConfig.modoEmissao !== 'sandbox_local' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3 text-xs text-amber-900">
              <div className="flex items-start gap-2.5">
                <Key size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-black uppercase tracking-wider text-[10px]">Chave de API Notaas Não Configurada</p>
                  <p className="text-slate-700">
                    Insira sua <strong>Project Key da NotaAs</strong> (iniciada com <code>ntaas_</code>) para transmitir diretamente à SEFAZ via API, ou emita em modo de simulação local.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="password"
                  placeholder="Cole sua chave ntaas_..."
                  value={quickApiKey}
                  onChange={(e) => setQuickApiKey(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-mono font-bold outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  disabled={isSavingKey || !quickApiKey.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1 shrink-0"
                >
                  {isSavingKey ? <RefreshCw size={12} className="animate-spin" /> : keySavedSuccess ? <Check size={12} /> : <Save size={12} />}
                  {keySavedSuccess ? 'Salvo!' : 'Salvar Chave'}
                </button>
              </div>
            </div>
          )}

          {/* Status de Validação e Avisos */}
          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
            validation.valid ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-rose-50/80 border-rose-200 text-rose-950'
          }`}>
            {validation.valid ? (
              <CheckCircle2 className="text-emerald-600 mt-0.5 shrink-0" size={18} />
            ) : (
              <AlertCircle className="text-rose-600 mt-0.5 shrink-0" size={18} />
            )}
            <div className="text-xs space-y-1 flex-1">
              <p className="font-black uppercase tracking-wider text-[10px]">
                {validation.valid ? 'Validação Fiscal Pronta para Emissão' : 'Pendências que Impedem a Emissão'}
              </p>
              {validation.valid ? (
                <p className="text-slate-600">
                  Os dados essenciais estão validados para transmissão à SEFAZ.
                </p>
              ) : (
                <ul className="list-disc pl-4 space-y-0.5 text-rose-700 font-medium">
                  {validation.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
              {validation.warnings && validation.warnings.length > 0 && (
                <div className="pt-1 text-[11px] text-amber-800 space-y-0.5">
                  <span className="font-bold uppercase text-[9px]">Ajustes Automáticos Aplicados:</span>
                  <ul className="list-disc pl-4">
                    {validation.warnings.map((w, idx) => (
                      <li key={`w-${idx}`}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Cards Emitente e Destinatário */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Emitente */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 relative group hover:border-purple-200 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                  <Building size={12} /> Emitente
                </span>
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-purple-200 shadow-xs"
                >
                  <Settings size={11} /> Configurar
                </button>
              </div>
              <p className="text-xs font-bold text-slate-800">{currentConfig.razaoSocial || company.name}</p>
              <p className="text-[11px] text-slate-600">CNPJ: <b>{currentConfig.cnpjEmitente || company.cnpj}</b> | IE: <b>{currentConfig.inscricaoEstadual || company.stateRegistration || 'Não informada'}</b></p>
              <p className="text-[10px] text-slate-500">
                {currentConfig.logradouroEmitente 
                  ? `${currentConfig.logradouroEmitente}, ${currentConfig.numeroEmitente || 'S/N'} - ${currentConfig.bairroEmitente || ''}, ${currentConfig.cidadeEmitente || 'Santarém'}/${currentConfig.ufEmitente || 'PA'}`
                  : 'Rodovia Mineral BR-163, Km 42 - Santarém/PA'}
              </p>
              <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 text-[10px] text-slate-500">
                <span>Regime: <strong className="text-slate-700">{currentConfig.regimeTributario === '1' ? 'Simples Nacional' : currentConfig.regimeTributario === '2' ? 'Simples Sublimite' : 'Regime Normal'}</strong></span>
                <span>•</span>
                <span>Série {currentConfig.serieNFe || 1}</span>
                <span>•</span>
                <span>Nº {currentConfig.proxNumeroNFe || 1042}</span>
              </div>
            </div>

            {/* Destinatário com Botão de Edição Rápida */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 relative group hover:border-purple-200 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                  <User size={12} /> Destinatário
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingCustomer(!isEditingCustomer)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-purple-200 shadow-xs"
                >
                  <Edit3 size={11} /> {isEditingCustomer ? 'Fechar Edição' : 'Editar Dados Fiscais'}
                </button>
              </div>

              {!isEditingCustomer ? (
                <>
                  <p className="text-xs font-bold text-slate-800">{activeCustomer.name}</p>
                  <p className="text-[11px] text-slate-600">Doc: <b>{activeCustomer.document || 'Não informado'}</b> | IE: <b>{activeCustomer.isentoIE ? 'Isento' : (activeCustomer.ie || 'Não informada')}</b></p>
                  <p className="text-[10px] text-slate-500">
                    {activeCustomer.street || 'Zona Rural / Rodovia'}, {activeCustomer.number || 'SN'} - {activeCustomer.neighborhood || 'Zona Rural'}, {activeCustomer.city || 'Santarém'}/{activeCustomer.state || 'PA'}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">CEP: {activeCustomer.zipCode || '68000-000'} · IBGE: {activeCustomer.ibgeCode || '1506807'}</p>
                </>
              ) : (
                <div className="pt-2 space-y-2.5 animate-in fade-in duration-150">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400">CPF / CNPJ</label>
                      <input
                        type="text"
                        value={activeCustomer.document}
                        onChange={(e) => setActiveCustomer(prev => ({ ...prev, document: e.target.value }))}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                        placeholder="CPF ou CNPJ"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400">Inscrição Estadual</label>
                      <input
                        type="text"
                        disabled={activeCustomer.isentoIE}
                        value={activeCustomer.isentoIE ? 'ISENTO' : (activeCustomer.ie || '')}
                        onChange={(e) => setActiveCustomer(prev => ({ ...prev, ie: e.target.value }))}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-60"
                        placeholder="IE ou Isento"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400">CEP</label>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={activeCustomer.zipCode || ''}
                          onChange={(e) => setActiveCustomer(prev => ({ ...prev, zipCode: e.target.value }))}
                          onBlur={(e) => {
                            if (e.target.value.replace(/\D/g, '').length === 8) handleCepLookup(e.target.value);
                          }}
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                          placeholder="68000-000"
                        />
                        <button
                          type="button"
                          onClick={() => handleCepLookup(activeCustomer.zipCode || '')}
                          disabled={isLoadingCep}
                          className="p-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg"
                          title="Buscar endereço por CEP"
                        >
                          <Search size={12} className={isLoadingCep ? 'animate-spin' : ''} />
                        </button>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[9px] font-black uppercase text-slate-400">Logradouro / Endereço</label>
                      <input
                        type="text"
                        value={activeCustomer.street || ''}
                        onChange={(e) => setActiveCustomer(prev => ({ ...prev, street: e.target.value }))}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                        placeholder="Rua / Rodovia / Fazenda"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400">Número</label>
                      <input
                        type="text"
                        value={activeCustomer.number || ''}
                        onChange={(e) => setActiveCustomer(prev => ({ ...prev, number: e.target.value }))}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                        placeholder="SN"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400">Bairro</label>
                      <input
                        type="text"
                        value={activeCustomer.neighborhood || ''}
                        onChange={(e) => setActiveCustomer(prev => ({ ...prev, neighborhood: e.target.value }))}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                        placeholder="Zona Rural"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400">Município / UF</label>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={activeCustomer.city || ''}
                          onChange={(e) => setActiveCustomer(prev => ({ ...prev, city: e.target.value }))}
                          className="w-2/3 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                          placeholder="Santarém"
                        />
                        <input
                          type="text"
                          maxLength={2}
                          value={activeCustomer.state || ''}
                          onChange={(e) => setActiveCustomer(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                          className="w-1/3 px-1 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                          placeholder="PA"
                        />
                      </div>
                    </div>
                  </div>

                  {cepFeedback && (
                    <p className="text-[10px] text-purple-700 font-bold">{cepFeedback}</p>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSaveCustomerFiscalData}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black flex items-center gap-1"
                    >
                      <Save size={12} /> Salvar Alterações
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

          {isTransferencia && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl text-xs text-sky-900">
              <p className="font-black uppercase tracking-wider text-[10px] mb-1">Transferência entre estabelecimentos</p>
              <p>CFOP { (activeCustomer.state && activeCustomer.state !== 'PA') ? (config.cfopTransferenciaInterestadual || '6152') : (config.cfopTransferenciaEstadual || '5152') } · finalidade 1 · sem cobrança financeira.</p>
            </div>
          )}

          {isDevolucao && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Chave da NF-e original (44 dígitos)</label>
              <input
                type="text"
                value={chaveDevolucao}
                onChange={(e) => setChaveDevolucao(e.target.value)}
                placeholder="Chave de acesso da nota a devolver"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
              />
              <p className="text-[10px] text-slate-400">Finalidade 4 · CFOP 5202/6202 · sem cobrança financeira.</p>
            </div>
          )}

          {/* Itens do Pedido com NCM e CFOP */}
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
              <FileText size={12} /> Itens & Enquadramento Fiscal
            </span>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[9px]">
                  <tr>
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-3 py-2.5">NCM</th>
                    <th className="px-3 py-2.5">CFOP</th>
                    <th className="px-3 py-2.5 text-center">Qtd</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-bold text-slate-800">{it.productName}</td>
                      <td className="px-3 py-3 font-mono text-slate-600">{it.ncm || '2517.10.00'}</td>
                      <td className="px-3 py-3 font-mono text-slate-600">{isDevolucao ? ((activeCustomer.state && activeCustomer.state !== 'PA') ? '6202' : '5202') : isTransferencia ? ((activeCustomer.state && activeCustomer.state !== 'PA') ? (config.cfopTransferenciaInterestadual || '6152') : (config.cfopTransferenciaEstadual || '5152')) : (it.cfop || config.cfopPadraoEstadual || '5101')}</td>
                      <td className="px-3 py-3 text-center font-bold text-slate-700">{it.quantity} {it.unit || 'Ton'}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-800">{formatBRL(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totais do Documento */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total da Nota Fiscal (NF-e)</span>
              <p className="text-xs text-slate-400">Produtos: {formatBRL(order.subtotal)} | Frete: {formatBRL(order.shipping || 0)}</p>
            </div>
            <p className="text-xl font-black text-emerald-400">{formatBRL(order.total)}</p>
          </div>

          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 space-y-2.5 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">{errorMsg}</p>
                  <p className="text-[11px] text-rose-600 font-normal leading-relaxed">
                    A emissão direta na SEFAZ exige a <b>Project Key (ntaas_...)</b> e o <b>Certificado A1</b> no painel da NotaAs. Se o provedor rejeitar a comunicação ou estiver em configuração, você pode <b>Simular a Emissão</b> para liberar o pedido e imprimir o DANFE de teste, ou verificar a sincronização do banco Supabase.
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowDatabaseModal(true)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <Database size={13} className="text-emerald-600" />
                  Verificar Banco Supabase
                </button>

                <button
                  type="button"
                  onClick={() => handleEmitir(true)}
                  disabled={loading}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <Sparkles size={13} />
                  Emitir em Modo Simulação Local (Liberar Pedido)
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-5 sm:p-6 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-3 text-xs font-bold uppercase text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
          >
            Voltar
          </button>

          <div className="flex items-center gap-2">
            {(!hasApiKey && currentConfig.modoEmissao !== 'sandbox_local') && (
              <button
                type="button"
                onClick={() => handleEmitir(true)}
                disabled={loading || !validation.valid}
                className="px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-2xl transition-all flex items-center gap-1"
                title="Emitir em Simulação sem exigir chave externa"
              >
                <Sparkles size={14} /> Simular Emissão
              </button>
            )}

            <button
              disabled={loading || !validation.valid}
              onClick={() => handleEmitir(false)}
              className="flex items-center gap-2 px-6 sm:px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Transmitindo para a SEFAZ...
                </>
              ) : (
                <>
                  <Send size={16} /> {isDevolucao ? 'Transmitir Devolução' : isTransferencia ? 'Transmitir Transferência' : 'Transmitir e Emitir NF-e'}
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Modal de Configuração da Empresa Emitente */}
      <CompanyFiscalSettingsModal
        isOpen={showCompanyModal}
        onClose={() => setShowCompanyModal(false)}
        config={currentConfig}
        companyId={order.companyId || company.id}
        onSaveSuccess={(updated) => {
          setCurrentConfig(updated);
        }}
      />

      {/* Modal de Diagnóstico do Supabase */}
      <DatabaseStatusModal
        isOpen={showDatabaseModal}
        onClose={() => setShowDatabaseModal(false)}
      />
    </div>
  );
};
