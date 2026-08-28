import React from 'react';
import { SaleOrder, Customer, Company } from '../types';
import { Printer, X, Copy, Check, ShieldCheck, Sprout, Globe, Mountain, Phone } from 'lucide-react';

interface SalesOrderPdfModalProps {
  order: SaleOrder;
  customer: Customer;
  company: Company;
  onClose: () => void;
}

const NAVY = '#1A2B48';
const GREEN = '#2E5236';

const PRINT_ADDR = {
  street: 'Estrada Vicinal do Arrozal, Km 08, S/N – Zona Rural',
  city: 'Mojuí dos Campos',
  state: 'PA',
  cep: '68.129-000',
  phones: '(93) 99106-2474  ·  (93) 99224-2747',
  instagram: '@cbamineracao',
};

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
_CBA Mineração_`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const customerAddr = customer?.street
    ? `${customer.street}, ${customer.number || 'S/N'}${customer.neighborhood ? ` – ${customer.neighborhood}` : ''}`
    : 'Zona Rural';

  const paddedItems = [...(order.items || [])];
  while (paddedItems.length < 3) paddedItems.push(null as any);

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:p-6 overflow-y-auto print:p-0 print:static print:bg-white">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:w-full print:rounded-none">

        <div className="text-white p-4 px-6 flex items-center justify-between print:hidden shrink-0" style={{ background: NAVY }}>
          <div>
            <h3 className="font-black text-sm tracking-tight text-white">Pedido de Venda CBA</h3>
            <p className="text-[11px] text-slate-300">Layout A4 para impressão e PDF · REF {order.reference}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all border border-white/15"
            >
              {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
              <span>{copied ? 'Copiado!' : 'Copiar Resumo'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2 text-white text-xs font-black rounded-xl transition-all"
              style={{ background: GREEN }}
            >
              <Printer size={16} />
              <span>Imprimir / Salvar PDF</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-colors ml-1">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto print:overflow-visible bg-white" id="printable-sales-order">
          <div className="px-8 pt-7 pb-4 flex items-start justify-between gap-6">
            <div className="flex items-center gap-4 min-w-0">
              <img
                src="/cba-logo.png"
                alt="CBA Mineração"
                className="h-16 w-auto object-contain shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-wide uppercase" style={{ color: NAVY }}>
                  {company.name || 'CBA Mineração'}
                </p>
                <p className="text-[10px] text-slate-500">
                  CNPJ: {company.document || '10.375.218/0001-84'}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-black tracking-tight uppercase" style={{ color: GREEN }}>
                {isBudget ? 'Orçamento' : 'Pedido de Venda'}
              </p>
              <div className="mt-1 inline-flex items-center gap-2">
                <span className="text-[10px] font-black text-white px-2 py-1 rounded-sm" style={{ background: NAVY }}>Nº</span>
                <span className="text-sm font-black tracking-tight" style={{ color: NAVY }}>{order.reference}</span>
              </div>
            </div>
          </div>

          <div className="px-8 pb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { Icon: Mountain, label: 'Calcário Dolomítico' },
              { Icon: ShieldCheck, label: 'Alto PRNT e Qualidade' },
              { Icon: Sprout, label: 'Produtividade no Campo' },
              { Icon: Globe, label: 'Responsabilidade Ambiental' },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: NAVY }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: GREEN }}>
                  <Icon size={14} />
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="px-8 pb-3">
            <div className="text-white text-[11px] font-black uppercase tracking-widest px-3 py-1.5" style={{ background: NAVY }}>
              Dados do Cliente
            </div>
            <div className="border border-slate-200 border-t-0 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 p-3 text-[11px]">
              <div className="col-span-2">
                <span className="block text-[9px] uppercase font-bold text-slate-400">Razão Social</span>
                <strong style={{ color: NAVY }}>{customer?.name || '—'}</strong>
              </div>
              <div>
                <span className="block text-[9px] uppercase font-bold text-slate-400">CNPJ / CPF</span>
                <strong>{customer?.document || '—'}</strong>
              </div>
              <div className="col-span-2">
                <span className="block text-[9px] uppercase font-bold text-slate-400">Endereço</span>
                <strong>{customerAddr}</strong>
              </div>
              <div>
                <span className="block text-[9px] uppercase font-bold text-slate-400">Município / UF</span>
                <strong>{customer?.city || '—'} / {customer?.state || '—'}</strong>
              </div>
              <div>
                <span className="block text-[9px] uppercase font-bold text-slate-400">Contato</span>
                <strong>{customer?.name || '—'}</strong>
              </div>
              <div>
                <span className="block text-[9px] uppercase font-bold text-slate-400">Telefone</span>
                <strong>{customer?.phone || '—'}</strong>
              </div>
              <div>
                <span className="block text-[9px] uppercase font-bold text-slate-400">E-mail</span>
                <strong>{customer?.email || '—'}</strong>
              </div>
            </div>
          </div>

          <div className="px-8 pb-3">
            <div className="text-white text-[11px] font-black uppercase tracking-widest px-3 py-1.5" style={{ background: NAVY }}>
              Dados do Pedido
            </div>
            <div className="border border-slate-200 border-t-0 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 p-3 text-[11px]">
              <div>
                <span className="block text-[9px] uppercase font-bold text-slate-400">Data do Pedido</span>
                <strong>{order.date}</strong>
              </div>
              <div>
                <span className="block text-[9px] uppercase font-bold text-slate-400">Previsão de Entrega</span>
                <strong>{order.deliveryDate || 'A combinar'}</strong>
              </div>
              <div>
                <span className="block text-[9px] uppercase font-bold text-slate-400">Cond. de Pagamento</span>
                <strong>{order.paymentMethod || (order.isBarter ? 'Barter' : 'A combinar')}</strong>
              </div>
              <div>
                <span className="block text-[9px] uppercase font-bold text-slate-400">Vendedor</span>
                <strong>{order.sellerName || 'Comercial CBA'}</strong>
              </div>
            </div>
          </div>

          <div className="px-8 pb-4">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-white text-[10px] uppercase tracking-wider" style={{ background: NAVY }}>
                  <th className="p-2 text-left font-black">Item</th>
                  <th className="p-2 text-left font-black">Produto</th>
                  <th className="p-2 text-left font-black">Descrição</th>
                  <th className="p-2 text-center font-black">Qtde.</th>
                  <th className="p-2 text-center font-black">Unid.</th>
                  <th className="p-2 text-right font-black">Valor Unit.</th>
                  <th className="p-2 text-right font-black">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {paddedItems.map((item, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#F2F2F2' }}>
                    <td className="p-2 font-bold">{item ? String(idx + 1).padStart(2, '0') : ''}</td>
                    <td className="p-2 font-bold" style={{ color: NAVY }}>{item?.productName || ''}</td>
                    <td className="p-2 text-slate-600">{item ? (item.ncm ? `NCM ${item.ncm}` : 'Calcário agrícola') : ''}</td>
                    <td className="p-2 text-center font-black">{item?.quantity ?? ''}</td>
                    <td className="p-2 text-center uppercase">{item?.unit || ''}</td>
                    <td className="p-2 text-right">{item ? formatBRL(item.unitPrice) : ''}</td>
                    <td className="p-2 text-right font-black">{item ? formatBRL(item.total) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {order.isBarter && (
            <div className="px-8 pb-4">
              <div className="border px-3 py-2 text-[11px]" style={{ borderColor: GREEN, background: '#f4f8f4' }}>
                <strong style={{ color: GREEN }}>Barter:</strong> {order.barterCommodityType || 'MILHO'} · Cotação {formatBRL(order.cornPricePerTon || 0)}/TON · {(order.cornTons || 0).toFixed(2)} TON
              </div>
            </div>
          )}

          <div className="px-8 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 p-4 flex gap-3 items-start" style={{ background: '#F7F8FA' }}>
              <div className="w-16 h-16 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: GREEN }}>
                <Mountain size={28} />
              </div>
              <div className="text-[11px] space-y-1">
                <p className="font-black uppercase tracking-wide" style={{ color: NAVY }}>Produto: Calcário Dolomítico</p>
                <p><strong>PRNT mínimo garantido:</strong> 80%</p>
                <p><strong>MgO mínimo garantido:</strong> 14%</p>
                <p className="text-[9px] text-slate-500 pt-1">Valores sujeitos a variação conforme análise laboratorial de cada lote.</p>
              </div>
            </div>
            <div>
              <div className="text-white text-[11px] font-black uppercase tracking-widest px-3 py-1.5" style={{ background: NAVY }}>
                Resumo do Pedido
              </div>
              <div className="border border-slate-200 border-t-0 text-[12px]">
                <div className="flex justify-between px-3 py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Subtotal (R$)</span>
                  <strong>{formatBRL(order.subtotal)}</strong>
                </div>
                <div className="flex justify-between px-3 py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Frete (R$)</span>
                  <strong>{formatBRL(order.shipping || 0)}</strong>
                </div>
                <div className="flex justify-between px-3 py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Desconto (R$)</span>
                  <strong>{formatBRL(order.discount || 0)}</strong>
                </div>
                <div className="flex justify-between px-3 py-2 text-white font-black" style={{ background: GREEN }}>
                  <span>Total Geral (R$)</span>
                  <span>{formatBRL(order.total)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-white text-[11px] font-black uppercase tracking-widest px-3 py-1.5" style={{ background: NAVY }}>
                Observações
              </div>
              <div className="border border-slate-200 border-t-0 min-h-[72px] p-3 text-[11px] text-slate-700 whitespace-pre-wrap">
                {order.notes || ''}
              </div>
            </div>
            <div>
              <div className="text-white text-[11px] font-black uppercase tracking-widest px-3 py-1.5" style={{ background: NAVY }}>
                Assinatura do Cliente
              </div>
              <div className="border border-slate-200 border-t-0 min-h-[72px] p-3 flex flex-col justify-end">
                <div className="border-t border-slate-400 pt-1 text-center text-[10px] text-slate-500">
                  {customer?.name || 'Cliente'} · Data: ____/____/________
                </div>
              </div>
            </div>
          </div>

          <div className="text-white px-8 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px]" style={{ background: NAVY }}>
            <div className="md:col-span-2 space-y-1">
              <p className="font-black tracking-widest uppercase text-[11px]">CBA Mineração</p>
              <p>{PRINT_ADDR.street}, {PRINT_ADDR.city} – {PRINT_ADDR.state}, CEP {PRINT_ADDR.cep}</p>
              <p className="flex items-center gap-1.5"><Phone size={11} /> {PRINT_ADDR.phones}</p>
              <p>Instagram {PRINT_ADDR.instagram}</p>
            </div>
            <div className="flex items-end justify-end opacity-80">
              <p className="text-[9px] uppercase tracking-widest text-right">Mineração &amp; Nutrição do Solo</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-sales-order, #printable-sales-order * { visibility: visible; }
          #printable-sales-order {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
          }
          @page { size: A4 portrait; margin: 8mm; }
        }
      `}</style>
    </div>
  );
};
