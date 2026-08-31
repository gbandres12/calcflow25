import React from 'react';
import { SaleOrder, Customer, Company } from '../types';
import { Printer, X, Copy, Check } from 'lucide-react';
import { SalesOrderPrintDocument } from './sales-order-print/SalesOrderPrintDocument';
import { formatBRL } from './sales-order-print/format';
import { SO } from './sales-order-print/theme';

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
  const printedAt = React.useMemo(() => new Date().toLocaleString('pt-BR'), []);
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

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:p-6 overflow-y-auto print:p-0 print:static print:bg-white print:overflow-visible">
      <div className="bg-white w-full max-w-[210mm] rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:w-full print:max-w-none print:rounded-none">

        <div className="no-print text-white p-4 px-6 flex items-center justify-between shrink-0 print:hidden" style={{ background: SO.navy }}>
          <div>
            <h3 className="font-bold text-sm tracking-tight text-white">Pedido de Venda</h3>
            <p className="text-[11px] text-slate-300">Layout A4 para impressão e PDF · {order.reference}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-all border border-white/15"
            >
              {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
              <span>{copied ? 'Copiado!' : 'Copiar Resumo'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2 text-white text-xs font-bold rounded-xl transition-all"
              style={{ background: SO.green }}
            >
              <Printer size={16} />
              <span>Imprimir / Salvar PDF</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-colors ml-1">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto print:overflow-visible bg-white">
          <SalesOrderPrintDocument
            order={order}
            customer={customer}
            company={company}
            printedAt={printedAt}
          />
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 11mm; }
          html, body {
            background: #fff !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          #printable-sales-order, #printable-sales-order * { visibility: visible; }
          #printable-sales-order {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: #fff !important;
          }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          tr, .so-keep, .so-totals {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};
