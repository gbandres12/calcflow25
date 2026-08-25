import React from 'react';
import { PaymentReceipt, Company } from '../types';
import { Printer, X, CheckCircle, FileText, Landmark, User, DollarSign, Calendar, Copy, Check } from 'lucide-react';

interface PaymentReceiptModalProps {
  receipt: PaymentReceipt;
  company: Company;
  onClose: () => void;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  receipt,
  company,
  onClose
}) => {
  const [copied, setCopied] = React.useState(false);

  const formatBRL = (val?: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const text = `RECIBO DE PAGAMENTO - ${company.name}
Nº: ${receipt.id}
Data: ${receipt.date}
Recebemos de: ${receipt.customerName} (${receipt.customerDocument || 'N/I'})
Valor: ${formatBRL(receipt.amount)}
Forma de Pagamento: ${receipt.paymentMethod}
Referente a: ${receipt.description} ${receipt.orderReference ? `(Pedido: ${receipt.orderReference})` : ''}
${receipt.remainingDebt !== undefined ? `Saldo Devedor Restante: ${formatBRL(receipt.remainingDebt)}` : ''}
Recebido por: ${receipt.receivedBy || 'Financeiro'}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        
        {/* Cabeçalho de Controle (Oculto na Impressão) */}
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-600 rounded-xl text-white">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="font-black text-lg tracking-tight">Recibo de Pagamento / Abatimento</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                Identificador: {receipt.id} • {receipt.type}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              title="Copiar texto do recibo"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-purple-900/30"
            >
              <Printer size={14} /> Imprimir Recibo
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Corpo do Recibo (Visível na Tela e Formatado para Impressão) */}
        <div className="p-8 md:p-10 space-y-6 text-slate-800 bg-white" id="printable-receipt">
          
          {/* Cabeçalho da Empresa */}
          <div className="border-b-2 border-slate-900 pb-6 flex justify-between items-start">
            <div className="space-y-1">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">{company.name}</h2>
              <p className="text-xs text-slate-500 font-bold">CNPJ: {company.document || '10.375.218/0001-50'}</p>
              <p className="text-xs text-slate-500">{company.address || 'Rodovia Mineral BR-163, Km 42 • Santarém-PA'}</p>
              <p className="text-xs text-slate-500">Contato: {company.phone || '(93) 99123-4567'}</p>
            </div>
            <div className="text-right space-y-1">
              <span className="inline-block px-3 py-1 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-lg">
                RECIBO Nº {receipt.id}
              </span>
              <p className="text-xs font-bold text-slate-500 pt-1">
                Data de Emissão: <strong className="text-slate-900">{receipt.date}</strong>
              </p>
            </div>
          </div>

          {/* Destaque do Valor */}
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Recebido</span>
              <p className="text-3xl font-black text-emerald-600">{formatBRL(receipt.amount)}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de Pagamento</span>
              <p className="text-base font-black text-slate-800">{receipt.paymentMethod || 'Dinheiro / PIX'}</p>
              {receipt.accountName && (
                <p className="text-xs text-slate-500 font-medium">Conta: {receipt.accountName}</p>
              )}
            </div>
          </div>

          {/* Declaração Formal do Recibo */}
          <div className="p-6 border border-slate-200 rounded-2xl space-y-4 text-sm leading-relaxed text-slate-700">
            <p>
              Recebemos de <strong className="text-slate-900 uppercase font-black">{receipt.customerName}</strong>
              {receipt.customerDocument ? ` (Inscrito no CPF/CNPJ sob o nº ${receipt.customerDocument})` : ''}, a quantia de{' '}
              <strong className="text-slate-900 font-black">{formatBRL(receipt.amount)}</strong>, referente a{' '}
              <strong className="text-slate-900">{receipt.description}</strong>
              {receipt.orderReference ? ` do Pedido de Venda nº ${receipt.orderReference}` : ''}.
            </p>

            {receipt.notes && (
              <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                Observação: {receipt.notes}
              </p>
            )}
          </div>

          {/* Resumo da Negociação e Saldo Devedor */}
          {(receipt.totalOrderAmount !== undefined || receipt.remainingDebt !== undefined) && (
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total da Venda</span>
                <p className="text-sm font-bold text-slate-700">{formatBRL(receipt.totalOrderAmount)}</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Abatido/Pago</span>
                <p className="text-sm font-bold text-emerald-600">{formatBRL(receipt.totalPaidSoFar)}</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Saldo Devedor Restante</span>
                <p className="text-sm font-black text-rose-600">{formatBRL(receipt.remainingDebt)}</p>
              </div>
            </div>
          )}

          {/* Campos de Assinatura */}
          <div className="grid grid-cols-2 gap-12 pt-12">
            <div className="text-center space-y-2">
              <div className="border-t border-slate-400 pt-2 mx-4" />
              <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{receipt.customerName}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Assinatura do Pagador</p>
            </div>
            <div className="text-center space-y-2">
              <div className="border-t border-slate-400 pt-2 mx-4" />
              <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{company.name}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase">
                Recebido por: {receipt.receivedBy || 'Setor Financeiro'}
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-between items-center text-[9px] text-slate-400 uppercase tracking-widest">
            <span>Sistema CalcárioFlow ERP • Comprovante emitido eletronicamente</span>
            <span>{new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

        </div>

      </div>
    </div>
  );
};
