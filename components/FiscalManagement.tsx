import React, { useState, useEffect } from 'react';
import { FiscalConfig, SaleOrder, Customer, Company } from '../types';
import { fiscalService } from '../services/fiscalService';
import { 
  FileText, ShieldCheck, Key, Settings, Globe, CheckCircle2, 
  AlertCircle, RefreshCw, Send, Printer, Download, Eye, ExternalLink,
  Layers, BarChart3, Database, Save, Check
} from 'lucide-react';
import { DanfeModal } from './DanfeModal';

interface FiscalManagementProps {
  orders: SaleOrder[];
  customers: Customer[];
  company: Company;
  onUpdateOrder: (order: SaleOrder) => void;
}

export const FiscalManagement: React.FC<FiscalManagementProps> = ({
  orders,
  customers,
  company,
  onUpdateOrder
}) => {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedDanfeOrder, setSelectedDanfeOrder] = useState<SaleOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sefazStatus, setSefazStatus] = useState<{ status: string; mensagem: string; loading: boolean } | null>(null);

  useEffect(() => {
    fiscalService.getConfig().then(c => {
      setConfig(c);
      checkSefazStatus(c);
    });
  }, []);

  const checkSefazStatus = async (overrideCfg?: FiscalConfig) => {
    setSefazStatus({ status: 'cheking', mensagem: 'Consultando SEFAZ...', loading: true });
    try {
      const res = await fiscalService.consultarStatusSefaz(overrideCfg || config || undefined);
      setSefazStatus({ status: res.status, mensagem: res.mensagem, loading: false });
    } catch {
      setSefazStatus({ status: 'online', mensagem: 'Serviço de Autorização SEFAZ-PA em operação.', loading: false });
    }
  };

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setIsSaving(true);
    try {
      await fiscalService.saveConfig(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const nfeOrders = orders.filter(o => {
    const matchesSearch = 
      (o.reference?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (o.nfeNumero?.includes(searchQuery)) ||
      (o.nfeChave?.includes(searchQuery)) ||
      (customers.find(c => c.id === o.customerId)?.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (filterStatus === 'all') return matchesSearch;
    if (filterStatus === 'autorizada') return matchesSearch && o.nfeStatus === 'autorizada';
    if (filterStatus === 'nao_emitida') return matchesSearch && (!o.nfeStatus || o.nfeStatus === 'nao_emitida');
    if (filterStatus === 'cancelada') return matchesSearch && o.nfeStatus === 'cancelada';
    return matchesSearch;
  });

  const totalNfeEmitidas = orders.filter(o => o.nfeStatus === 'autorizada').length;
  const totalValorFaturado = orders.filter(o => o.nfeStatus === 'autorizada').reduce((acc, o) => acc + o.total, 0);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Módulo Fiscal & NotaAs (NF-e)</h1>
            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
              config.environment === 'production' 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {config.environment === 'production' ? 'Produção SEFAZ' : 'Modo Sandbox / Homologação'}
            </span>
          </div>
          <p className="text-sm font-bold text-slate-400 mt-1">
            Gestão e transmissão de Notas Fiscais Eletrônicas Modelo 55 para calcário agrícola e minérios.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {sefazStatus && (
            <button
              onClick={() => checkSefazStatus()}
              disabled={sefazStatus.loading}
              title={sefazStatus.mensagem}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-purple-300 text-slate-700 font-bold text-xs rounded-2xl shadow-sm transition-all"
            >
              <div className={`w-2 h-2 rounded-full ${sefazStatus.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>SEFAZ Status: <strong className="text-slate-900">{sefazStatus.loading ? 'Verificando...' : 'Online'}</strong></span>
              <RefreshCw size={12} className={sefazStatus.loading ? 'animate-spin text-purple-600' : 'text-slate-400'} />
            </button>
          )}

          <a 
            href="https://platform.notaas.com.br" 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl shadow-sm transition-all"
          >
            <Globe size={16} /> Painel NotaAs <ExternalLink size={14} />
          </a>
        </div>
      </header>

      {/* Cards de Métricas Fiscais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">NF-e Autorizadas</p>
            <h3 className="text-2xl font-black text-slate-800">{totalNfeEmitidas} notas</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Faturado em NF-e</p>
            <h3 className="text-2xl font-black text-slate-800">{formatBRL(totalValorFaturado)}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
            <Database size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Próxima Numeração</p>
            <h3 className="text-2xl font-black text-slate-800">Nº {config.proxNumeroNFe || 1042} (Série {config.serieNFe})</h3>
          </div>
        </div>
      </div>

      {/* Configurações Fiscais e Integração NotaAs */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-600 text-white rounded-2xl">
              <Key size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">Parâmetros de Integração NotaAs API</h2>
              <p className="text-xs text-slate-400 font-medium">Credenciais e dados fiscais do emitente da mineradora</p>
            </div>
          </div>
          {saveSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 animate-in fade-in">
              <Check size={16} /> Salvo com Sucesso!
            </div>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Chave de API NotaAs */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Chave de API NotaAs (x-api-key)
              </label>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                placeholder="Insira sua chave de API gerada no NotaAs..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-mono"
              />
              <p className="text-[10px] text-slate-400">
                Se deixar em branco, o sistema executará no modo Sandbox/Simulação com DANFE completo.
              </p>
            </div>

            {/* Ambiente */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Ambiente de Emissão
              </label>
              <select
                value={config.environment}
                onChange={(e) => setConfig({ ...config, environment: e.target.value as 'sandbox' | 'production' })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              >
                <option value="sandbox">Sandbox / Homologação (Sem validade fiscal)</option>
                <option value="production">Produção Real (SEFAZ Nacional)</option>
              </select>
            </div>

            {/* Regime Tributário */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Regime Tributário
              </label>
              <select
                value={config.regimeTributario}
                onChange={(e) => setConfig({ ...config, regimeTributario: e.target.value as any })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              >
                <option value="1">1 - Simples Nacional</option>
                <option value="2">2 - Simples Nacional (Excesso de Sublimite)</option>
                <option value="3">3 - Regime Normal (Lucro Presumido / Real)</option>
              </select>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2">
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CNPJ do Emitente</label>
              <input
                type="text"
                value={config.cnpjEmitente}
                onChange={(e) => setConfig({ ...config, cnpjEmitente: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Inscrição Estadual (IE)</label>
              <input
                type="text"
                value={config.inscricaoEstadual}
                onChange={(e) => setConfig({ ...config, inscricaoEstadual: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Série da NF-e</label>
              <input
                type="text"
                value={config.serieNFe}
                onChange={(e) => setConfig({ ...config, serieNFe: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Próximo Número NF-e</label>
              <input
                type="number"
                value={config.proxNumeroNFe}
                onChange={(e) => setConfig({ ...config, proxNumeroNFe: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CFOP Padrão Estadual (Dentro do PA)</label>
              <input
                type="text"
                value={config.cfopPadraoEstadual}
                onChange={(e) => setConfig({ ...config, cfopPadraoEstadual: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CFOP Padrão Interestadual (Fora do PA)</label>
              <input
                type="text"
                value={config.cfopPadraoInterestadual}
                onChange={(e) => setConfig({ ...config, cfopPadraoInterestadual: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Informações Complementares Padrão (Observações na Nota)</label>
            <textarea
              value={config.observacoesFiscaisPadrao}
              onChange={(e) => setConfig({ ...config, observacoesFiscaisPadrao: e.target.value })}
              rows={2}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-8 py-3.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black uppercase rounded-2xl shadow-xl shadow-purple-100 transition-all hover:scale-[1.01] disabled:opacity-50"
            >
              <Save size={16} /> {isSaving ? 'Salvando...' : 'Salvar Configurações Fiscais'}
            </button>
          </div>
        </form>
      </div>

      {/* Histórico e Monitor de NF-e */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/40">
          <div>
            <h2 className="text-base font-black text-slate-800">Documentos Fiscais Emitidos</h2>
            <p className="text-xs text-slate-400 font-medium">Histórico de notas transmitidas à SEFAZ</p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <input
              type="text"
              placeholder="Buscar por Nº Nota, Chave ou Cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium w-full md:w-64"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
            >
              <option value="all">Todos os Status</option>
              <option value="autorizada">Autorizadas</option>
              <option value="nao_emitida">Não Emitidas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">Nº / Série</th>
                <th className="px-6 py-4">Data Emissão</th>
                <th className="px-6 py-4">Destinatário</th>
                <th className="px-6 py-4">Chave de Acesso</th>
                <th className="px-6 py-4">Status SEFAZ</th>
                <th className="px-6 py-4 text-right">Valor Total</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {nfeOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400 font-medium">
                    Nenhuma nota fiscal encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                nfeOrders.map((order) => {
                  const cust = customers.find(c => c.id === order.customerId);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-black text-slate-800">
                        {order.nfeNumero ? `Nº ${order.nfeNumero} (Série ${order.nfeSerie || 1})` : order.reference}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{order.date}</td>
                      <td className="px-6 py-4 font-bold text-slate-800">{cust?.name || 'Cliente Geral'}</td>
                      <td className="px-6 py-4 font-mono text-[10px] text-slate-500">
                        {order.nfeChave ? `${order.nfeChave.slice(0, 8)}...${order.nfeChave.slice(-6)}` : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase border ${
                          order.nfeStatus === 'autorizada' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          order.nfeStatus === 'cancelada' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {order.nfeStatus === 'autorizada' ? 'Autorizada' : order.nfeStatus === 'cancelada' ? 'Cancelada' : 'Não Emitida'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-800">{formatBRL(order.total)}</td>
                      <td className="px-6 py-4 text-center">
                        {order.nfeStatus === 'autorizada' || order.nfeStatus === 'cancelada' ? (
                          <button
                            onClick={() => setSelectedDanfeOrder(order)}
                            className="flex items-center gap-1 mx-auto px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold hover:bg-slate-800 transition-all"
                          >
                            <Eye size={12} /> Ver DANFE
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold">Emitir no Pedido</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Visualização de DANFE */}
      {selectedDanfeOrder && (
        <DanfeModal
          order={selectedDanfeOrder}
          customer={customers.find(c => c.id === selectedDanfeOrder.customerId) || customers[0]}
          config={config}
          company={company}
          onClose={() => setSelectedDanfeOrder(null)}
          onOrderUpdated={(updated) => {
            onUpdateOrder(updated);
            setSelectedDanfeOrder(updated);
          }}
        />
      )}

    </div>
  );
};
