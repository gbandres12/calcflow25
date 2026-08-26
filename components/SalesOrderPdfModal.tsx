import React from 'react';
import { SaleOrder, Customer, Company } from '../types';
import { Printer, Download, X, Copy, Check, ShieldCheck, Wheat, Truck, DollarSign, Calendar, MapPin, Phone, Building2 } from 'lucide-react';

interface SalesOrderPdfModalProps {
  order: SaleOrder;
  customer: Customer;
  company: Company;
  onClose: () => void;
}

export const SalesOrderPdfModal: React.FC<SalesOrderPdfModalProps> = ({
  order,
  customer,
  company,
  onClose
}) => {
  const [copied, setCopied] = React.useState(false);

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const isBudget = order.status === 'Orçamento';

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    const isBarterText = order.isBarter 
      ? `\n🌾 OPERAÇÃO DE BARTER: ${order.barterCommodityType || 'MILHO'} | Cotação: R$ ${order.cornPricePerTon}/TON | Qtd Grãos: ${order.cornTons?.toFixed(2)} TON`
      : '';

    const text = `*${company.name}* - ${isBudget ? 'ORÇAMENTO COMERCIAL' : 'PEDIDO DE VENDA'} Nº ${order.reference}
----------------------------------------
👤 *Cliente:* ${customer?.name || 'Cliente'}
📄 *CPF/CNPJ:* ${customer?.document || ''}
📅 *Emissão:* ${order.date}
💰 *Valor Total:* ${formatBRL(order.total)}${isBarterText}
📦 *Quantidade:* ${order.items.reduce((s, i) => s + (i.quantity || 0), 0)} TON

Obrigado pela parceria!
_CalcárioFlow Mineração & Nutrição Vegetal_`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const totalQtyTons = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const totalPaidReceipts = (order.receipts || []).reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:p-6 overflow-y-auto print:p-0 print:static print:bg-white">
      
      {/* Container Principal */}
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:w-full print:rounded-none">
        
        {/* Barra Superior com Ações do Modal (Escondida no Print) */}
        <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between border-b border-slate-800 print:hidden shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/30 text-purple-300 rounded-xl border border-purple-500/30">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="font-black text-sm tracking-tight text-white flex items-center gap-2">
                Documento Oficial de Venda / Contrato
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/80 text-purple-200 border border-purple-700">
                  REF: {order.reference}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Visualização formatada para impressão A4 e exportação em PDF.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700"
              title="Copiar resumo textual para WhatsApp"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copied ? 'Copiado!' : 'Copiar Resumo'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-black rounded-xl transition-all shadow-lg shadow-purple-900/40"
            >
              <Printer size={16} />
              <span>Imprimir / Salvar PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Corpo do Documento A4 Printable */}
        <div className="p-8 md:p-12 overflow-y-auto space-y-8 print:p-0 print:overflow-visible text-slate-800 font-sans" id="printable-sales-order">
          
          {/* Topo / Cabeçalho do Documento */}
          <div className="border-b-2 border-slate-900 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-purple-950 text-white flex items-center justify-center font-black text-2xl shadow-md border border-purple-800">
                CF
              </div>
              <div className="space-y-0.5">
                <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">{company.name}</h1>
                <p className="text-xs text-slate-600 font-bold">
                  CNPJ: {company.document || '10.375.218/0001-50'} &bull; IE: 15.829.401-2
                </p>
                <p className="text-xs text-slate-500 font-medium">
                  {company.address || 'Rodovia Mineral BR-163, Km 42 - Distrito Industrial'} &bull; {company.city || 'Santarém'}-{company.state || 'PA'}
                </p>
                <p className="text-xs text-slate-500 font-medium flex items-center gap-2">
                  <span>Fone: {company.phone || '(93) 3522-8000'}</span> &bull; <span>vendas@calcarioflow.com.br</span>
                </p>
              </div>
            </div>

            <div className="text-left md:text-right space-y-1 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 min-w-[220px]">
              <span className={`inline-block px-3 py-1 text-[11px] font-black uppercase rounded-lg tracking-wider ${
                isBudget ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-900 text-white'
              }`}>
                {isBudget ? 'ORÇAMENTO COMERCIAL' : 'PEDIDO DE VENDA'}
              </span>
              <p className="text-2xl font-black text-slate-900 tracking-tight">Nº {order.reference}</p>
              <div className="text-[11px] text-slate-500 font-medium space-y-0.5 pt-1 border-t border-slate-200">
                <p>Data Emissão: <strong className="text-slate-800">{order.date}</strong></p>
                <p>Vendedor: <strong className="text-slate-800">{order.sellerName || 'Atendimento Comercial'}</strong></p>
              </div>
            </div>
          </div>

          {/* Seção Cliente / Produtor Rural */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-5 space-y-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 border-b border-slate-200/80 pb-2">
              <Building2 size={14} className="text-purple-600" />
              Identificação do Cliente / Produtor Rural
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Razão Social / Nome:</span>
                <strong className="text-slate-900 text-sm font-black">{customer?.name || 'Cliente Não Informado'}</strong>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">CPF / CNPJ:</span>
                <strong className="text-slate-800">{customer?.document || 'Não informado'}</strong>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Inscrição Estadual:</span>
                <strong className="text-slate-800">{customer?.isentoIE ? 'ISENTO' : (customer?.ie || 'Não informada')}</strong>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Telefone / Contato:</span>
                <strong className="text-slate-800">{customer?.phone || 'Não informado'}</strong>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Município / UF:</span>
                <strong className="text-slate-800">{customer?.city || company.city} - {customer?.state || company.state}</strong>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Endereço / Propriedade:</span>
                <strong className="text-slate-800">{customer?.street ? `${customer.street}, ${customer.number || 'S/N'}` : 'Zona Rural'}</strong>
              </div>
            </div>
          </div>

          {/* Tabela de Produtos / Calcário */}
          <div className="space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              Discriminativo dos Produtos / Calcário Agrícola
            </h2>
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-black uppercase tracking-wider text-[10px]">
                    <th className="p-3 pl-4">Produto / Minério</th>
                    <th className="p-3 text-center">NCM</th>
                    <th className="p-3 text-center">Unidade</th>
                    <th className="p-3 text-right">Qtd (TON)</th>
                    <th className="p-3 text-right">Unitário (R$)</th>
                    <th className="p-3 pr-4 text-right">Total (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {order.items.map((item, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="p-3 pl-4 font-bold text-slate-900">{item.productName}</td>
                      <td className="p-3 text-center text-slate-500 font-mono text-[11px]">{item.ncm || '2517.10.00'}</td>
                      <td className="p-3 text-center uppercase font-semibold text-slate-600">{item.unit || 'TON'}</td>
                      <td className="p-3 text-right font-black text-slate-900">{item.quantity}</td>
                      <td className="p-3 text-right">{formatBRL(item.unitPrice)}</td>
                      <td className="p-3 pr-4 text-right font-black text-slate-900">{formatBRL(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Destaque Barter / Permuta Agro (se for Barter) */}
          {order.isBarter && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-wider">
                <Wheat size={16} className="text-amber-600" />
                Modalidade Barter / Permuta por Grãos Agrícolas
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-bold text-amber-950">
                <div>
                  <span className="text-[10px] text-amber-700 block font-normal uppercase">Commodity:</span>
                  <span>{order.barterCommodityType || 'MILHO'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-amber-700 block font-normal uppercase">Cotação Base:</span>
                  <span>{formatBRL(order.cornPricePerTon || 0)} / TON</span>
                </div>
                <div>
                  <span className="text-[10px] text-amber-700 block font-normal uppercase">Volume de Grãos:</span>
                  <span>{(order.cornTons || 0).toFixed(2)} TON</span>
                </div>
                <div>
                  <span className="text-[10px] text-amber-700 block font-normal uppercase">Equivalência Sacas (60kg):</span>
                  <span>{((order.cornTons || 0) * 16.6667).toFixed(0)} Sacas</span>
                </div>
              </div>
            </div>
          )}

          {/* Resumo Financeiro & Cronograma de Pagamento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Histórico de Entradas / Recibos */}
            <div className="md:col-span-2 border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-600 border-b border-slate-200 pb-2">
                Condições de Pagamento & Abatimentos Registrados
              </h3>

              {order.receipts && order.receipts.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase text-emerald-700">Entradas / Abatimentos Pagos:</p>
                  <table className="w-full text-xs text-left">
                    <tbody className="divide-y divide-slate-100">
                      {order.receipts.map(r => (
                        <tr key={r.id}>
                          <td className="py-1 text-slate-600 font-medium">{r.date} - Recibo #{r.id} ({r.paymentMethod})</td>
                          <td className="py-1 text-right font-black text-emerald-600">{formatBRL(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Nenhuma entrada ou sinal registrado até o momento.</p>
              )}

              {order.payments && order.payments.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <p className="text-[10px] font-black uppercase text-slate-500">Parcelas / Vencimentos Programados:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {order.payments.map((p, idx) => (
                      <div key={idx} className="p-2 bg-white rounded-xl border border-slate-200 flex justify-between items-center font-medium">
                        <span>Venc: <strong>{p.date}</strong></span>
                        <strong className="text-slate-900">{formatBRL(p.amount)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Totalizadores */}
            <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-md">
              <div className="space-y-2 text-xs border-b border-slate-800 pb-3">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal dos Itens:</span>
                  <span className="font-bold text-white">{formatBRL(order.subtotal)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>Desconto Concedido:</span>
                    <span className="font-bold">- {formatBRL(order.discount)}</span>
                  </div>
                )}
                {order.shipping > 0 && (
                  <div className="flex justify-between text-slate-300">
                    <span>Frete / Transporte:</span>
                    <span className="font-bold">{formatBRL(order.shipping)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Valor Total do Pedido</span>
                <p className="text-2xl font-black text-emerald-400">{formatBRL(order.total)}</p>
                <p className="text-[11px] text-slate-400">Volume Total: <strong>{totalQtyTons} TON</strong></p>
              </div>
            </div>

          </div>

          {/* Histórico de Retiradas / Balança (se houver) */}
          {order.withdrawals && order.withdrawals.length > 0 && (
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-2">
              <h3 className="text-xs font-black uppercase text-slate-600 flex items-center gap-1.5">
                <Truck size={14} className="text-purple-600" />
                Histórico de Retirada de Carga / Expedição na Balança
              </h3>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-200 text-[10px] uppercase font-bold text-left">
                    <th className="py-1">Data</th>
                    <th className="py-1">Placa</th>
                    <th className="py-1">Motorista</th>
                    <th className="py-1 text-center">Ticket Pesagem</th>
                    <th className="py-1 text-right">Carga Retirada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
                  {order.withdrawals.map((w, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5">{w.date}</td>
                      <td className="py-1.5 font-bold uppercase">{w.plateNumber}</td>
                      <td className="py-1.5">{w.driverName}</td>
                      <td className="py-1.5 text-center font-mono">{w.weighTicketNumber}</td>
                      <td className="py-1.5 text-right font-black text-slate-900">{w.quantityWithdrawn} TON</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Garantias de Qualidade & Cláusulas Comerciais */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
            <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Especificações Técnicas e Condições de Fornecimento:</p>
            <p>1. O calcário agrícola fornecido cumpre os requisitos do Ministério da Agricultura (MAPA), com Poder de Neutralização (PN) mínimo de 90% e PRNT mínimo de 85%.</p>
            <p>2. A entrega/retirada de carga está sujeita à pesagem oficial na balança rodoviária do pátio da mineradora.</p>
            <p>3. Este documento formaliza as condições comerciais ajustadas entre as partes para posterior emissão da NF-e.</p>
          </div>

          {/* Assinaturas */}
          <div className="pt-8 flex justify-between items-center gap-12 text-center text-xs">
            <div className="flex-1 border-t-2 border-slate-800 pt-2 space-y-0.5">
              <strong className="block text-slate-900 uppercase font-black">{customer?.name || 'Cliente / Produtor'}</strong>
              <span className="text-[10px] text-slate-500 block">Assinatura do Produtor Rural / Comprador</span>
            </div>
            <div className="flex-1 border-t-2 border-slate-800 pt-2 space-y-0.5">
              <strong className="block text-slate-900 uppercase font-black">{company.name}</strong>
              <span className="text-[10px] text-slate-500 block">Representante Comercial / Expedição</span>
            </div>
          </div>

        </div>

      </div>

      {/* Regras CSS de Impressão Global para A4 */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-sales-order, #printable-sales-order * {
            visibility: visible;
          }
          #printable-sales-order {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 15mm;
            margin: 0;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>

    </div>
  );
};
