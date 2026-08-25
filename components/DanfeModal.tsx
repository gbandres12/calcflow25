import React, { useState } from 'react';
import { SaleOrder, Customer, FiscalConfig, Company } from '../types';
import { fiscalService } from '../services/fiscalService';
import { 
  X, Printer, Download, FileCheck, AlertTriangle, ShieldCheck, 
  Building, User, Hash, Calendar, QrCode, CheckCircle2, Ban
} from 'lucide-react';

interface DanfeModalProps {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig;
  company: Company;
  onClose: () => void;
  onOrderUpdated: (updatedOrder: SaleOrder) => void;
}

export const DanfeModal: React.FC<DanfeModalProps> = ({
  order,
  customer,
  config,
  company,
  onClose,
  onOrderUpdated
}) => {
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelJustificativa, setCancelJustificativa] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const chaveFormatada = (order.nfeChave || '').replace(/(\d{4})/g, '$1 ').trim();

  const handlePrintDanfe = () => {
    window.print();
  };

  const handleDownloadXml = () => {
    const xmlContent = fiscalService.gerarXml(order, customer, config);
    const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NFe_${order.nfeChave || order.reference}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCancelNFe = async () => {
    if (cancelJustificativa.trim().length < 15) {
      setCancelError('A justificativa deve ter no mínimo 15 caracteres.');
      return;
    }

    setCancelLoading(true);
    setCancelError(null);
    try {
      const res = await fiscalService.cancelarNFe(order.nfeChave || '', cancelJustificativa, config);
      if (res.success) {
        const updated = {
          ...order,
          nfeStatus: 'cancelada' as const,
          notes: `${order.notes || ''} [NF-e CANCELADA: ${cancelJustificativa}]`.trim()
        };
        onOrderUpdated(updated);
        setIsCanceling(false);
      } else {
        setCancelError(res.error || 'Erro ao cancelar NF-e.');
      }
    } catch (e: any) {
      setCancelError(e.message || 'Erro inesperado ao cancelar.');
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden print:shadow-none print:rounded-none print:w-full print:max-w-none my-8">
        
        {/* Header Superior na Tela (Oculto na Impressão) */}
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg">
              <FileCheck size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">DANFE Eletrônica - SEFAZ</h3>
                <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                  order.nfeStatus === 'autorizada' ? 'bg-emerald-100 text-emerald-700' :
                  order.nfeStatus === 'cancelada' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {order.nfeStatus === 'autorizada' ? 'Autorizada' : order.nfeStatus === 'cancelada' ? 'Cancelada' : order.nfeStatus}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                NF-e Nº <b>{order.nfeNumero || '1041'}</b> | Série <b>{order.nfeSerie || '1'}</b> | Chave: <span className="font-mono">{order.nfeChave ? `${order.nfeChave.slice(0, 12)}...` : 'N/A'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintDanfe}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 shadow-md transition-all"
            >
              <Printer size={16} /> Imprimir DANFE
            </button>
            <button
              onClick={handleDownloadXml}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-md transition-all"
            >
              <Download size={16} /> Baixar XML
            </button>
            {order.nfeStatus === 'autorizada' && (
              <button
                onClick={() => setIsCanceling(!isCanceling)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all"
              >
                <Ban size={16} /> Cancelar NF-e
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-400"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal de Cancelamento Integrado */}
        {isCanceling && (
          <div className="p-6 bg-rose-50 border-b border-rose-200 print:hidden space-y-3 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
              <AlertTriangle size={18} /> Cancelamento de NF-e na SEFAZ (NotaAs)
            </div>
            <p className="text-xs text-rose-700">
              Atenção: O cancelamento só é permitido pela SEFAZ dentro do prazo legal (geralmente até 24h). Informe uma justificativa detalhada com no mínimo 15 caracteres.
            </p>
            <textarea
              value={cancelJustificativa}
              onChange={(e) => setCancelJustificativa(e.target.value)}
              placeholder="Ex: Cancelamento solicitado pelo comprador devido a erro na quantidade informada no pedido."
              rows={2}
              className="w-full p-3 bg-white border border-rose-300 rounded-xl text-xs outline-none focus:border-rose-500"
            />
            {cancelError && <p className="text-xs text-rose-600 font-bold">{cancelError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsCanceling(false)}
                className="px-4 py-2 bg-white text-slate-600 rounded-xl text-xs font-bold border border-slate-200"
              >
                Voltar
              </button>
              <button
                disabled={cancelLoading}
                onClick={handleCancelNFe}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2"
              >
                {cancelLoading ? 'Transmitindo à SEFAZ...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        )}

        {/* Corpo do Documento DANFE (Estilo Oficial SEFAZ Brasileiro) */}
        <div className="p-8 max-h-[75vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-2 bg-slate-50/50">
          
          <div className="bg-white border-2 border-black p-4 text-[11px] font-sans text-black leading-tight max-w-[200mm] mx-auto shadow-sm">
            
            {/* CANHOTO DE RECEBIMENTO */}
            <div className="border border-black p-2 mb-2">
              <div className="flex justify-between items-center text-[9px] border-b border-black pb-1 mb-1 font-bold">
                <span>RECEBEMOS DE {config.razaoSocial} OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO</span>
                <div className="text-right font-black">
                  <span>NF-e Nº {order.nfeNumero || '1041'}</span><br/>
                  <span>SÉRIE: {order.nfeSerie || '1'}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[9px]">
                <div className="border-r border-black pr-2">DATA DE RECEBIMENTO: ____/____/________</div>
                <div className="col-span-2">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR: _________________________________________</div>
              </div>
            </div>

            {/* CABEÇALHO DO DANFE */}
            <div className="border border-black grid grid-cols-12 mb-2">
              {/* Identificação do Emitente */}
              <div className="col-span-4 p-2 border-r border-black flex flex-col justify-between">
                <div>
                  <h4 className="font-black text-xs uppercase">{config.nomeFantasia || company.name}</h4>
                  <p className="font-bold text-[10px] text-slate-800">{config.razaoSocial}</p>
                  <p className="text-[9px]">{company.address}</p>
                  <p className="text-[9px]">{company.city} - {company.state} - Fone: {company.phone}</p>
                </div>
                <div className="pt-2 text-[9px]">
                  <p><b>CNPJ:</b> {config.cnpjEmitente}</p>
                  <p><b>INSC. ESTADUAL:</b> {config.inscricaoEstadual}</p>
                </div>
              </div>

              {/* Bloco DANFE Central */}
              <div className="col-span-3 p-2 border-r border-black text-center flex flex-col justify-between">
                <div>
                  <h2 className="font-black text-sm tracking-wider">DANFE</h2>
                  <p className="text-[8px] font-bold">DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA</p>
                  <div className="my-1.5 text-[9px] text-left border border-black p-1">
                    <p><b>0</b> - ENTRADA</p>
                    <p className="font-bold"><b>1 - SAÍDA &nbsp; [ 1 ]</b></p>
                  </div>
                  <p className="font-black text-xs">Nº {order.nfeNumero || '1041'}</p>
                  <p className="font-bold text-[9px]">SÉRIE: {order.nfeSerie || '1'}</p>
                  <p className="text-[8px]">FOLHA 01/01</p>
                </div>
              </div>

              {/* Código de Barras e Chave de Acesso */}
              <div className="col-span-5 p-2 flex flex-col justify-between">
                <div>
                  {/* Simulação de Código de Barras SEFAZ */}
                  <div className="bg-black h-10 w-full mb-1 flex items-center justify-around px-1 overflow-hidden">
                    {Array.from({ length: 48 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`h-full ${i % 3 === 0 ? 'w-1 bg-white' : i % 5 === 0 ? 'w-0.5 bg-black' : 'w-0.5 bg-white'}`}
                      />
                    ))}
                  </div>
                  <div className="text-[8px] border border-black p-1">
                    <p className="font-bold uppercase text-[7px] text-slate-600">CHAVE DE ACESSO</p>
                    <p className="font-mono font-bold tracking-tighter text-[9px] select-all">{chaveFormatada || '1526 0810 3752 1800 0150 5500 1000 0010 4118 9402 1984'}</p>
                  </div>
                </div>

                <div className="text-[8px] border border-black p-1 mt-1">
                  <p className="font-bold uppercase text-[7px]">PROTOCOLO DE AUTORIZAÇÃO DE USO</p>
                  <p className="font-bold">{order.nfeProtocolo || '115260004928192'} - {order.nfeEmissao ? new Date(order.nfeEmissao).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}</p>
                </div>
              </div>
            </div>

            {/* NATUREZA DA OPERAÇÃO */}
            <div className="border border-black p-1.5 mb-2 grid grid-cols-4 gap-2 text-[9px]">
              <div className="col-span-2 border-r border-black pr-2">
                <span className="text-[7px] font-bold block text-slate-600">NATUREZA DA OPERAÇÃO</span>
                <span className="font-black uppercase">{order.nfeNaturezaOperacao || config.naturezaOperacaoPadrao}</span>
              </div>
              <div className="border-r border-black pr-2">
                <span className="text-[7px] font-bold block text-slate-600">PROTOCOLO SEFAZ</span>
                <span className="font-bold">{order.nfeProtocolo || 'AUTORIZADO'}</span>
              </div>
              <div>
                <span className="text-[7px] font-bold block text-slate-600">INSC. ESTADUAL DO SUBST. TRIB.</span>
                <span className="font-bold">ISENTO</span>
              </div>
            </div>

            {/* DESTINATÁRIO / REMETENTE */}
            <div className="mb-2">
              <div className="bg-slate-200 border-t border-x border-black px-1.5 py-0.5 text-[8px] font-black uppercase">
                DESTINATÁRIO / REMETENTE
              </div>
              <div className="border border-black p-1.5 space-y-1 text-[9px]">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <span className="text-[7px] font-bold block text-slate-600">NOME / RAZÃO SOCIAL</span>
                    <span className="font-black">{customer.name}</span>
                  </div>
                  <div className="col-span-3">
                    <span className="text-[7px] font-bold block text-slate-600">CNPJ / CPF</span>
                    <span className="font-bold">{customer.document}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[7px] font-bold block text-slate-600">DATA DA EMISSÃO</span>
                    <span className="font-bold">{order.date}</span>
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-2 pt-1 border-t border-slate-200">
                  <div className="col-span-5">
                    <span className="text-[7px] font-bold block text-slate-600">ENDEREÇO</span>
                    <span>{customer.street || 'Zona Rural Fazenda'}, Nº {customer.number || 'S/N'}</span>
                  </div>
                  <div className="col-span-3">
                    <span className="text-[7px] font-bold block text-slate-600">BAIRRO / DISTRITO</span>
                    <span>{customer.neighborhood || 'Zona Rural'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[7px] font-bold block text-slate-600">CEP</span>
                    <span>{customer.zipCode || '68000-000'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[7px] font-bold block text-slate-600">DATA SAÍDA/ENTRADA</span>
                    <span>{order.date}</span>
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-2 pt-1 border-t border-slate-200">
                  <div className="col-span-5">
                    <span className="text-[7px] font-bold block text-slate-600">MUNICÍPIO</span>
                    <span className="font-bold">{customer.city || 'Santarém'}</span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-[7px] font-bold block text-slate-600">UF</span>
                    <span className="font-bold">{customer.state || 'PA'}</span>
                  </div>
                  <div className="col-span-3">
                    <span className="text-[7px] font-bold block text-slate-600">FONE / FAX</span>
                    <span>{customer.phone}</span>
                  </div>
                  <div className="col-span-3">
                    <span className="text-[7px] font-bold block text-slate-600">INSCRIÇÃO ESTADUAL</span>
                    <span className="font-bold">{customer.isentoIE ? 'ISENTO' : (customer.ie || 'ISENTO')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CÁLCULO DO IMPOSTO */}
            <div className="mb-2">
              <div className="bg-slate-200 border-t border-x border-black px-1.5 py-0.5 text-[8px] font-black uppercase">
                CÁLCULO DO IMPOSTO
              </div>
              <div className="border border-black p-1.5 grid grid-cols-6 gap-2 text-[9px] text-right">
                <div>
                  <span className="text-[7px] font-bold block text-left text-slate-600">BASE CÁLC. ICMS</span>
                  <span>R$ 0,00</span>
                </div>
                <div>
                  <span className="text-[7px] font-bold block text-left text-slate-600">VALOR DO ICMS</span>
                  <span>R$ 0,00</span>
                </div>
                <div>
                  <span className="text-[7px] font-bold block text-left text-slate-600">VALOR DO FRETE</span>
                  <span>{formatBRL(order.shipping || 0)}</span>
                </div>
                <div>
                  <span className="text-[7px] font-bold block text-left text-slate-600">VALOR DESCONTO</span>
                  <span>{formatBRL(order.discount || 0)}</span>
                </div>
                <div>
                  <span className="text-[7px] font-bold block text-left text-slate-600">TOTAL PRODUTOS</span>
                  <span className="font-bold">{formatBRL(order.subtotal)}</span>
                </div>
                <div>
                  <span className="text-[7px] font-bold block text-left text-slate-600">VALOR TOTAL DA NOTA</span>
                  <span className="font-black text-[10px]">{formatBRL(order.total)}</span>
                </div>
              </div>
            </div>

            {/* DADOS DOS PRODUTOS / SERVIÇOS */}
            <div className="mb-2">
              <div className="bg-slate-200 border-t border-x border-black px-1.5 py-0.5 text-[8px] font-black uppercase">
                DADOS DO PRODUTO / SERVIÇOS
              </div>
              <table className="w-full border border-black text-[8px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-black text-center font-bold">
                    <th className="border-r border-black p-1 text-left">CÓDIGO</th>
                    <th className="border-r border-black p-1 text-left">DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
                    <th className="border-r border-black p-1">NCM/SH</th>
                    <th className="border-r border-black p-1">CST/CSOSN</th>
                    <th className="border-r border-black p-1">CFOP</th>
                    <th className="border-r border-black p-1">UN</th>
                    <th className="border-r border-black p-1">QTD</th>
                    <th className="border-r border-black p-1">V. UNIT</th>
                    <th className="border-r border-black p-1">V. TOTAL</th>
                    <th className="border-r border-black p-1">BC ICMS</th>
                    <th className="border-r border-black p-1">V. ICMS</th>
                    <th className="p-1">ALÍQ %</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it, idx) => (
                    <tr key={idx} className="border-b border-slate-200">
                      <td className="border-r border-black p-1 text-left font-mono">{it.productCode || `CALC-${idx + 1}`}</td>
                      <td className="border-r border-black p-1 text-left font-bold">{it.productName}</td>
                      <td className="border-r border-black p-1 text-center">{it.ncm || '2517.10.00'}</td>
                      <td className="border-r border-black p-1 text-center">102</td>
                      <td className="border-r border-black p-1 text-center">{it.cfop || config.cfopPadraoEstadual}</td>
                      <td className="border-r border-black p-1 text-center">{it.unit}</td>
                      <td className="border-r border-black p-1 text-center font-bold">{it.quantity}</td>
                      <td className="border-r border-black p-1 text-right">{formatBRL(it.unitPrice)}</td>
                      <td className="border-r border-black p-1 text-right font-bold">{formatBRL(it.total)}</td>
                      <td className="border-r border-black p-1 text-right">0,00</td>
                      <td className="border-r border-black p-1 text-right">0,00</td>
                      <td className="p-1 text-center">0%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* DADOS ADICIONAIS / INFORMAÇÕES COMPLEMENTARES */}
            <div>
              <div className="bg-slate-200 border-t border-x border-black px-1.5 py-0.5 text-[8px] font-black uppercase">
                DADOS ADICIONAIS / INFORMAÇÕES COMPLEMENTARES
              </div>
              <div className="border border-black p-2 text-[8px] space-y-1 min-h-[45px]">
                <p className="font-bold">INFORMAÇÕES DE INTERESSE DO CONTRIBUINTE:</p>
                <p className="text-slate-700">
                  {config.observacoesFiscaisPadrao || 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.'}
                </p>
                <p className="text-slate-700">
                  Ref. Pedido de Venda: <b>{order.reference}</b> | Vendedor(a): <b>{order.sellerName}</b> | Entrega: <b>{order.deliveryDate || order.date}</b>
                </p>
                {order.notes && <p className="text-slate-600 italic">Obs: {order.notes}</p>}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
