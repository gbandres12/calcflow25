import React, { useEffect, useState } from 'react';
import { PaymentReceipt, Company } from '../types';
import { Printer, X, FileText, Copy, Check } from 'lucide-react';
import { fiscalService } from '../services/fiscalService';

interface PaymentReceiptModalProps {
  receipt: PaymentReceipt;
  company: Company;
  onClose: () => void;
}

const formatBRL = (val?: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEENS = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function chunkToWords(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]);
  else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    if (t) parts.push(TENS[t]);
    if (u) parts.push(UNITS[u]);
  }
  return parts.join(' e ');
}

export function amountInWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  const cents = Math.round((Math.abs(value) - n) * 100);
  if (n === 0 && cents === 0) return 'zero reais';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const remainder = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(`${chunkToWords(millions)} ${millions === 1 ? 'milhão' : 'milhões'}`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${chunkToWords(thousands)} mil`);
  if (remainder) parts.push(chunkToWords(remainder));
  const reais = parts.length ? `${parts.join(' e ')} ${n === 1 ? 'real' : 'reais'}` : '';
  const centavos = cents ? `${chunkToWords(cents)} ${cents === 1 ? 'centavo' : 'centavos'}` : '';
  return [reais, centavos].filter(Boolean).join(' e ') || 'zero reais';
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  receipt,
  company,
  onClose
}) => {
  const [copied, setCopied] = useState(false);
  const [logo, setLogo] = useState('');
  const [printMode, setPrintMode] = useState<'a4' | 'thermal' | null>(null);
  const isDeduction = receipt.type === 'ABATIMENTO';
  const isPayable = receipt.side === 'pagar';

  useEffect(() => {
    fiscalService.getConfig(company.id).then((cfg) => setLogo(cfg?.logoDataUrl || '')).catch(() => setLogo(''));
  }, [company.id]);

  useEffect(() => {
    if (!printMode) return;
    const handleAfterPrint = () => setPrintMode(null);
    window.addEventListener('afterprint', handleAfterPrint);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [printMode]);

  const handleCopyText = () => {
    const text = `RECIBO ${isDeduction ? 'DE ABATIMENTO' : 'DE PAGAMENTO'} - ${company.name}
Nº: ${receipt.id}
Data: ${receipt.date}
${isPayable ? 'Pago a' : 'Recebemos de'}: ${receipt.customerName} (${receipt.customerDocument || 'N/I'})
Valor: ${formatBRL(receipt.amount)} (${amountInWords(receipt.amount)})
Forma: ${receipt.paymentMethod}
Referente a: ${receipt.description} ${receipt.orderReference ? `(Pedido: ${receipt.orderReference})` : ''}
${receipt.remainingDebt !== undefined ? `Saldo restante: ${formatBRL(receipt.remainingDebt)}` : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const headerTitle = isDeduction
    ? (isPayable ? 'Recibo de abatimento a pagar' : 'Recibo de abatimento')
    : (isPayable ? 'Recibo de pagamento' : 'Recibo de recebimento');

  const bodyCopy = isDeduction
    ? (
      <>
        Concedemos/registramos abatimento de <strong>{formatBRL(receipt.amount)}</strong>
        {' '}({amountInWords(receipt.amount)}) {isPayable ? 'junto a' : 'a'}{' '}
        <strong className="uppercase">{receipt.customerName}</strong>
        {receipt.customerDocument ? ` (CPF/CNPJ ${receipt.customerDocument})` : ''}, referente a{' '}
        <strong>{receipt.description}</strong>
        {receipt.orderReference ? ` do pedido ${receipt.orderReference}` : ''}. Este abatimento não representa entrada ou saída de caixa.
      </>
    )
    : (
      <>
        {isPayable ? 'Pagamos a' : 'Recebemos de'} <strong className="uppercase">{receipt.customerName}</strong>
        {receipt.customerDocument ? ` (CPF/CNPJ ${receipt.customerDocument})` : ''} a quantia de{' '}
        <strong>{formatBRL(receipt.amount)}</strong> ({amountInWords(receipt.amount)}), referente a{' '}
        <strong>{receipt.description}</strong>
        {receipt.orderReference ? ` do pedido ${receipt.orderReference}` : ''}.
      </>
    );

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[200] flex items-center justify-center p-4 print:static print:bg-white print:p-0">
      <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden print:shadow-none print:w-full print:max-w-none print:rounded-none">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-600 rounded-xl text-white">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="font-black text-lg tracking-tight">{headerTitle}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                {receipt.id} • {receipt.type}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={handleCopyText} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button onClick={() => setPrintMode('a4')} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5">
              <Printer size={14} /> Imprimir A4
            </button>
            <button onClick={() => setPrintMode('thermal')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5">
              <Printer size={14} /> Térmica 80mm
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className={`p-8 md:p-10 space-y-6 text-slate-800 bg-white ${printMode === 'thermal' ? 'print:hidden' : ''}`} id="printable-receipt-a4">
          <div className="border-b-2 border-slate-900 pb-6 flex justify-between items-start gap-4">
            <div className="flex items-start gap-4">
              {logo ? <img src={logo} alt="Logo" className="h-16 w-16 object-contain" /> : null}
              <div className="space-y-1">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">{company.name}</h2>
                <p className="text-xs text-slate-500 font-bold">CNPJ: {company.document || company.cnpj || '—'}</p>
                <p className="text-xs text-slate-500">{company.address}</p>
                <p className="text-xs text-slate-500">Contato: {company.phone || '—'}</p>
              </div>
            </div>
            <div className="text-right space-y-1">
              <span className="inline-block px-3 py-1 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-lg">
                RECIBO Nº {receipt.id}
              </span>
              <p className="text-xs font-bold text-slate-500 pt-1">Emissão: <strong className="text-slate-900">{receipt.date}</strong></p>
            </div>
          </div>

          <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isDeduction ? 'Valor abatido' : 'Valor'}</span>
              <p className={`text-3xl font-black ${isDeduction ? 'text-purple-700' : 'text-emerald-600'}`}>{formatBRL(receipt.amount)}</p>
              <p className="text-xs text-slate-500 capitalize">{amountInWords(receipt.amount)}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma</span>
              <p className="text-base font-black text-slate-800">{receipt.paymentMethod || '—'}</p>
              {receipt.accountName && <p className="text-xs text-slate-500 font-medium">Conta: {receipt.accountName}</p>}
            </div>
          </div>

          <div className="p-6 border border-slate-200 rounded-2xl text-sm leading-relaxed text-slate-700">
            <p>{bodyCopy}</p>
            {receipt.notes && (
              <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-xl border border-slate-100 mt-4">Observação: {receipt.notes}</p>
            )}
          </div>

          {(receipt.totalOrderAmount !== undefined || receipt.remainingDebt !== undefined) && (
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total do título</span>
                <p className="text-sm font-bold text-slate-700">{formatBRL(receipt.totalOrderAmount)}</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Baixado / abatido</span>
                <p className="text-sm font-bold text-emerald-600">{formatBRL(receipt.totalPaidSoFar)}</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Saldo restante</span>
                <p className="text-sm font-black text-rose-600">{formatBRL(receipt.remainingDebt)}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-12 pt-12">
            <div className="text-center space-y-2">
              <div className="border-t border-slate-400 pt-2 mx-4" />
              <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{receipt.customerName}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase">{isPayable ? 'Assinatura do recebedor' : 'Assinatura do pagador'}</p>
            </div>
            <div className="text-center space-y-2">
              <div className="border-t border-slate-400 pt-2 mx-4" />
              <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{company.name}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase">
                {isPayable ? 'Pago por' : 'Recebido por'}: {receipt.receivedBy || 'Setor Financeiro'}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`px-4 py-6 text-slate-900 ${printMode === 'a4' ? 'print:hidden' : ''} ${printMode === 'thermal' ? '' : 'max-w-[80mm] mx-auto border-t border-dashed print:border-0'}`}
          id="printable-receipt-thermal"
        >
          <div className="w-[72mm] mx-auto text-center space-y-2 text-[11px] leading-snug">
            {logo ? <img src={logo} alt="Logo" className="h-10 mx-auto object-contain" /> : null}
            <p className="font-black uppercase">{company.name}</p>
            <p>{company.document || company.cnpj}</p>
            <p className="font-black uppercase tracking-widest pt-2">{isDeduction ? 'Abatimento' : 'Recibo'} {receipt.id}</p>
            <p>{receipt.date}</p>
            <p className="text-lg font-black pt-1">{formatBRL(receipt.amount)}</p>
            <p className="capitalize text-[10px]">{amountInWords(receipt.amount)}</p>
            <p className="text-left pt-2">{bodyCopy}</p>
            {receipt.remainingDebt !== undefined && <p>Saldo restante: {formatBRL(receipt.remainingDebt)}</p>}
            <div className="pt-8">
              <div className="border-t border-slate-800 mx-6" />
              <p className="pt-1 font-bold uppercase text-[9px]">Assinatura</p>
              <p className="text-[9px]">{receipt.customerName}</p>
            </div>
            <p className="text-[8px] pt-3 uppercase">{receipt.receivedBy || 'Financeiro'} • {company.name}</p>
          </div>
        </div>
      </div>
      <style>{`
        @media print {
          @page { margin: ${printMode === 'thermal' ? '4mm' : '11mm'}; size: ${printMode === 'thermal' ? '80mm auto' : 'A4'}; }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
};
