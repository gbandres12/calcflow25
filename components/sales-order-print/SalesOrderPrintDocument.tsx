import React, { useEffect, useState } from 'react';
import { Company, Customer, SaleOrder } from '../../types';
import { fiscalService } from '../../services/fiscalService';
import { SO } from './theme';
import { formatBRL, formatQty, formatDate, dash } from './format';
import { productBlockLines } from '../../utils/salesOrderProduct';

interface Props {
  order: SaleOrder;
  customer?: Customer;
  company: Company;
  printedAt: string;
}

const addr = (c?: Customer) => {
  if (!c) return '';
  return [c.street, c.number, c.neighborhood].filter(Boolean).join(', ');
};

export const SalesOrderPrintDocument: React.FC<Props> = ({ order, customer, company, printedAt }) => {
  const [logo, setLogo] = useState('');
  const [brand, setBrand] = useState<any>(null);

  useEffect(() => {
    fiscalService.getConfig(company.id).then((cfg: any) => {
      setBrand(cfg);
      setLogo(cfg?.logoDataUrl || '');
    });
  }, [company.id]);

  const razao = brand?.razaoSocial || brand?.nomeFantasia || company.name;
  const cnpjEmp = brand?.cnpjEmitente || company.document || '';
  const endEmp = [
    brand?.logradouroEmitente,
    brand?.numeroEmitente,
    brand?.bairroEmitente,
    brand?.cidadeEmitente && brand?.ufEmitente ? `${brand.cidadeEmitente} – ${brand.ufEmitente}` : [company.city, company.state].filter(Boolean).join(' – '),
    brand?.cepEmitente ? `CEP: ${brand.cepEmitente}` : ''
  ].filter(Boolean);
  const phones = [brand?.telefoneEmitente, company.phone].filter(Boolean);
  const items = order.items || [];
  const multiItem = items.length > 1;
  const sheetTitle =
    order.productSheetTitle?.trim() ||
    (multiItem ? 'Informações complementares do pedido' : items[0]?.productName || '');
  const sheetLines = productBlockLines(order);

  const customerIe = customer?.ie;
  const addressLine = addr(customer);
  const cityUf = [customer?.city, customer?.state].filter(Boolean).join(' / ');
  const cepText = customer?.zipCode ? `CEP: ${customer.zipCode}` : '';
  const docTitle = order.status === 'Orçamento' ? 'Orçamento Comercial' : 'Pedido de Venda';

  const barterText = order.isBarter
    ? `Operação de barter: ${order.barterCommodityType || 'Milho'}${order.cornPricePerTon != null ? ` · Cotação ${formatBRL(order.cornPricePerTon)}/TON` : ''}${order.cornTons != null ? ` · ${order.cornTons.toFixed(2)} TON` : ''}`
    : '';
  const obsContent = [order.notes, barterText].filter(Boolean).join('\n');

  return (
    <article id="printable-sales-order" className="bg-white text-slate-800" style={{ fontFamily: SO.font, color: SO.text }}>
      <header className="px-7 print:px-0 pt-3 pb-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="w-[130px] h-[48px] flex items-center justify-start overflow-hidden">
            {logo ? (
              <img src={logo} alt={razao} className="max-h-[46px] max-w-[130px] object-contain" />
            ) : (
              <div className="leading-none">
                <p className="text-[26px] font-black tracking-tight" style={{ color: SO.navy }}>
                  CB<span style={{ color: SO.green }}>A</span>
                </p>
                <p className="text-[9px] font-bold tracking-[0.24em] uppercase" style={{ color: SO.navy }}>Mineração</p>
              </div>
            )}
          </div>
          <div className="text-right">
            <h1 className="text-[16px] font-black tracking-[0.06em] uppercase" style={{ color: SO.green }}>
              {docTitle}
            </h1>
            <div className="mt-0.5 inline-flex items-center border-[1.5px] rounded overflow-hidden" style={{ borderColor: SO.navy }}>
              <span className="px-2 py-0.5 text-[9.5px] font-black text-white" style={{ background: SO.navy }}>Nº</span>
              <span className="px-3 py-0.5 text-[11px] font-black min-w-[120px] text-left">{order.reference}</span>
            </div>
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-center text-[9px] font-bold uppercase tracking-wider" style={{ color: SO.navy }}>
          <div className="border border-slate-200 rounded py-0.5 bg-slate-50/60">Calcário dolomítico</div>
          <div className="border border-slate-200 rounded py-0.5 bg-slate-50/60">Alto PRNT e qualidade</div>
          <div className="border border-slate-200 rounded py-0.5 bg-slate-50/60">Produtividade no campo</div>
          <div className="border border-slate-200 rounded py-0.5 bg-slate-50/60">Responsabilidade ambiental</div>
        </div>
      </header>

      <section className="mx-7 print:mx-0 mb-1.5">
        <div className="px-2.5 py-0.5 text-[9.5px] font-black tracking-widest text-white uppercase rounded-t" style={{ background: SO.navy }}>
          Dados do cliente
        </div>
        <div className="border border-t-0 px-2.5 py-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] leading-tight rounded-b" style={{ borderColor: SO.border }}>
          <p className="truncate"><span className="font-black">Razão social:</span> {dash(customer?.name)}</p>
          <p className="truncate"><span className="font-black">CNPJ/CPF:</span> {dash(customer?.document)}{customerIe ? ` · IE: ${customerIe}` : ''}</p>
          <p className="truncate"><span className="font-black">Endereço:</span> {dash(addressLine)}</p>
          <p className="truncate"><span className="font-black">Município/UF:</span> {cityUf || '—'}{cepText ? ` · ${cepText}` : ''}</p>
          <p className="truncate"><span className="font-black">Telefone:</span> {dash(customer?.phone)}</p>
          <p className="truncate"><span className="font-black">E-mail:</span> {dash(customer?.email)}</p>
        </div>
      </section>

      <section className="mx-7 print:mx-0 mb-1.5">
        <div className="px-2.5 py-0.5 text-[9.5px] font-black tracking-widest text-white uppercase rounded-t" style={{ background: SO.navy }}>
          Dados do pedido
        </div>
        <div className="border border-t-0 grid grid-cols-4 text-[10px] rounded-b overflow-hidden" style={{ borderColor: SO.border }}>
          <div className="px-2.5 py-1 border-r" style={{ borderColor: SO.border }}>
            <p className="font-black uppercase text-[8px] tracking-wider" style={{ color: SO.muted }}>Data do pedido</p>
            <p className="font-bold">{formatDate(order.date)}</p>
          </div>
          <div className="px-2.5 py-1 border-r" style={{ borderColor: SO.border }}>
            <p className="font-black uppercase text-[8px] tracking-wider" style={{ color: SO.muted }}>Previsão de entrega</p>
            <p className="font-bold">{formatDate(order.deliveryDate)}</p>
          </div>
          <div className="px-2.5 py-1 border-r" style={{ borderColor: SO.border }}>
            <p className="font-black uppercase text-[8px] tracking-wider" style={{ color: SO.muted }}>Cond. de pagamento</p>
            <p className="font-bold truncate">{dash(order.paymentMethod)}</p>
          </div>
          <div className="px-2.5 py-1">
            <p className="font-black uppercase text-[8px] tracking-wider" style={{ color: SO.muted }}>Vendedor</p>
            <p className="font-bold truncate">{dash(order.sellerName)}</p>
          </div>
        </div>
      </section>

      <section className="mx-7 print:mx-0 mb-1.5">
        <table className="w-full text-[9.5px] border-collapse">
          <thead>
            <tr className="text-white" style={{ background: SO.navy }}>
              <th className="py-0.5 px-2 text-left font-black">Item</th>
              <th className="py-0.5 px-2 text-left font-black">Produto</th>
              <th className="py-0.5 px-2 text-left font-black">Descrição</th>
              <th className="py-0.5 px-2 text-right font-black">Qtde.</th>
              <th className="py-0.5 px-2 text-center font-black">Unid.</th>
              <th className="py-0.5 px-2 text-right font-black">Valor unit.</th>
              <th className="py-0.5 px-2 text-right font-black">Valor total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-b" style={{ borderColor: SO.border, background: idx % 2 ? '#F7F9FC' : 'white' }}>
                <td className="py-0.5 px-2 font-bold">{String(idx + 1).padStart(2, '0')}</td>
                <td className="py-0.5 px-2 font-bold">{it.productCode || it.productName}</td>
                <td className="py-0.5 px-2 truncate max-w-[200px]">{it.productDescription?.trim() || it.productName}</td>
                <td className="py-0.5 px-2 text-right font-bold">{formatQty(it.quantity)}</td>
                <td className="py-0.5 px-2 text-center">{it.unit || 'Ton'}</td>
                <td className="py-0.5 px-2 text-right">{formatBRL(it.unitPrice)}</td>
                <td className="py-0.5 px-2 text-right font-black">{formatBRL(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mx-7 print:mx-0 mb-1.5 grid grid-cols-2 gap-2">
        <div className="border p-2 text-[9.5px] rounded leading-tight flex flex-col justify-between" style={{ borderColor: SO.border }}>
          <div>
            <p className="font-black uppercase text-[8px] tracking-widest" style={{ color: SO.muted }}>Produto</p>
            <p className="font-black mt-0.5 text-[10px]" style={{ color: SO.navy }}>{sheetTitle}</p>
            <div className="mt-1 space-y-0.5">
              {sheetLines.map((line, i) => (
                <p key={i} className={line.startsWith('*') || line.toLowerCase().includes('sujeito') ? 'italic text-[8.5px]' : 'text-[9px]'} style={line.toLowerCase().includes('sujeito') ? { color: SO.muted } : undefined}>
                  {line.replace(/^\*+\s*/, '')}
                </p>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="px-2.5 py-0.5 text-[9.5px] font-black tracking-widest text-white uppercase rounded-t" style={{ background: SO.navy }}>
            Resumo do pedido
          </div>
          <div className="border border-t-0 text-[9.5px] rounded-b overflow-hidden" style={{ borderColor: SO.border }}>
            <div className="flex justify-between px-2.5 py-0.5 border-b" style={{ borderColor: SO.border }}><span>Subtotal</span><strong>{formatBRL(order.subtotal)}</strong></div>
            <div className="flex justify-between px-2.5 py-0.5 border-b" style={{ borderColor: SO.border }}><span>Frete{order.frete?.modalidade === 0 ? ' (CIF)' : order.frete?.modalidade === 1 ? ' (FOB)' : ''}</span><strong>{formatBRL(order.shipping || 0)}</strong></div>
            <div className="flex justify-between px-2.5 py-0.5 border-b" style={{ borderColor: SO.border }}><span>Desconto</span><strong>{formatBRL(order.discount || 0)}</strong></div>
            <div className="flex justify-between px-2.5 py-1 text-white font-black text-[10.5px]" style={{ background: SO.green }}><span>Total geral</span><span>{formatBRL(order.total)}</span></div>
          </div>
        </div>
      </section>

      <section className="mx-7 print:mx-0 mb-1.5 grid grid-cols-2 gap-2">
        <div>
          <div className="px-2.5 py-0.5 text-[9.5px] font-black tracking-widest text-white uppercase rounded-t" style={{ background: SO.navy }}>
            Observações
          </div>
          <div className="border border-t-0 min-h-[44px] px-2.5 py-1 text-[9px] leading-snug rounded-b whitespace-pre-line" style={{ borderColor: SO.border }}>
            {obsContent || <span className="text-slate-400 italic">Sem observações adicionais.</span>}
          </div>
        </div>
        <div className="border px-2.5 py-1 text-center text-[9px] rounded flex flex-col justify-end" style={{ borderColor: SO.border }}>
          <div className="h-5 border-b mb-1 border-slate-300" />
          <p className="font-black uppercase tracking-wider text-[8.5px]" style={{ color: SO.navy }}>Assinatura do cliente</p>
          <p className="text-[8px]" style={{ color: SO.muted }}>Data: ____ / ____ / ________</p>
        </div>
      </section>

      <footer
        className="mx-7 print:mx-0 pt-1.5 pb-0.5 flex items-end justify-between gap-3 text-[8.5px] leading-tight"
        style={{ borderTop: `1.5px solid ${SO.navy}`, color: SO.navy }}
      >
        <div className="min-w-0">
          <p className="font-bold text-[9.5px] tracking-wide truncate">
            {razao || 'CBA Mineração'}
            {cnpjEmp ? ` · CNPJ ${cnpjEmp}` : ''}
            {phones.length ? ` · Tel. ${phones.join(', ')}` : ''}
          </p>
          {endEmp.length > 0 && (
            <p className="text-slate-600 truncate mt-0.5">{endEmp.join(' · ')}</p>
          )}
        </div>
        <div className="text-right shrink-0 text-[8px]" style={{ color: SO.muted }}>
          <p>Impresso em {printedAt}</p>
        </div>
      </footer>
    </article>
  );
};

export default SalesOrderPrintDocument;
