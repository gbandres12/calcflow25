import React, { useState, useRef } from 'react';
import { SaleOrder, Customer, FiscalConfig, Company } from '../types';
import { fiscalService } from '../services/fiscalService';
import { 
  X, Send, ShieldCheck, AlertCircle, CheckCircle2, 
  Building, User, FileText, Hash, MapPin, Truck, Sparkles 
} from 'lucide-react';

interface EmitirNfeModalProps {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig;
  company: Company;
  onClose: () => void;
  onSuccess: (updatedOrder: SaleOrder) => void;
}

export const EmitirNfeModal: React.FC<EmitirNfeModalProps> = ({
  order,
  customer,
  config,
  company,
  onClose,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const validation = fiscalService.validarDadosFiscais(order, customer);

  const handleEmitir = async () => {
    if (isSubmittingRef.current || loading) {
      console.warn('⚠️ [EMISSÃO BLOQUEADA] Clique duplo ou emissão simultânea evitada!');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setErrorMsg(null);

    try {
      const payloadSent = fiscalService.montarPayloadNotaAs(order, customer, config);
      const result = await fiscalService.emitirNFe(order, customer, config, order.companyId);

      if (result.success) {
        let finalStatus = result.nfeStatus;

        // Se o servidor respondeu status processando, dispara polling de acompanhamento
        if (result.nfeStatus === 'processando' && result.nfeId) {
          const pollResult = await fiscalService.consultarEAtualizarStatusProcessamento(result.nfeId, config, 3, 2000);
          if (pollResult.success && pollResult.status && pollResult.status !== 'nao_emitida') {
            finalStatus = pollResult.status;
          }
        }
        if (finalStatus === 'simulada') {
          // Simulação local: não é autorização SEFAZ.
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

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[150] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-600 text-white rounded-2xl shadow-lg shadow-purple-100">
              <Send size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Emissão de NF-e Eletrônica</h3>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  config.environment === 'production' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {config.environment === 'production' ? 'Ambiente Produção SEFAZ' : 'Sandbox / Homologação'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Pedido <b>{order.reference}</b> | Próximo Nº NF-e: <b>{config.proxNumeroNFe || 1042}</b> (Série {config.serieNFe || 1})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Status de Validação Prévia */}
          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
            validation.valid ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-rose-50/80 border-rose-200 text-rose-900'
          }`}>
            {validation.valid ? (
              <CheckCircle2 className="text-emerald-600 mt-0.5 shrink-0" size={20} />
            ) : (
              <AlertCircle className="text-rose-600 mt-0.5 shrink-0" size={20} />
            )}
            <div className="text-xs space-y-1">
              <p className="font-black uppercase tracking-wider text-[10px]">
                {validation.valid ? 'Validação Cadastral e Fiscal Aprovada' : 'Pendências Cadastrais Detectadas'}
              </p>
              {validation.valid ? (
                <p className="text-slate-600">
                  Os dados do emitente, destinatário, NCM e tributação estão prontos para envio à SEFAZ via API NotaAs.
                </p>
              ) : (
                <ul className="list-disc pl-4 space-y-0.5 text-rose-700">
                  {validation.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Dados do Destinatário & Emitente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                <Building size={12} /> Emitente
              </span>
              <p className="text-xs font-bold text-slate-800">{config.razaoSocial}</p>
              <p className="text-[11px] text-slate-600">CNPJ: {config.cnpjEmitente} | IE: {config.inscricaoEstadual}</p>
              <p className="text-[10px] text-slate-500">Regime: {config.regimeTributario === '1' ? 'Simples Nacional' : 'Regime Normal'}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                <User size={12} /> Destinatário
              </span>
              <p className="text-xs font-bold text-slate-800">{customer.name}</p>
              <p className="text-[11px] text-slate-600">Doc: {customer.document} | IE: {customer.isentoIE ? 'Isento' : (customer.ie || 'Não Informada')}</p>
              <p className="text-[10px] text-slate-500">{customer.street || 'Zona Rural'}, {customer.city || 'Santarém'} - {customer.state || 'PA'}</p>
            </div>

          </div>

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
                      <td className="px-3 py-3 font-mono text-slate-600">{it.cfop || config.cfopPadraoEstadual}</td>
                      <td className="px-3 py-3 text-center font-bold text-slate-700">{it.quantity} {it.unit}</td>
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
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-bold flex items-center gap-2">
              <AlertCircle size={16} /> {errorMsg}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-6 py-3 text-xs font-bold uppercase text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
          >
            Voltar
          </button>

          <button
            disabled={loading || !validation.valid}
            onClick={handleEmitir}
            className="flex items-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Transmitindo para a SEFAZ...
              </>
            ) : (
              <>
                <Send size={16} /> Transmitir e Emitir NF-e (NotaAs)
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
