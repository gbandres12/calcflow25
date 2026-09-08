import React, { useEffect, useState } from 'react';
import { Company, Customer, SaleOrder } from '../../types';
import { fiscalService } from '../../services/fiscalService';
import { SO } from './theme';
import { formatBRL, formatQty, formatDate, dash } from './format';

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

  return (
    <article id="printable-sales-order" className="bg-white" style={{ fontFamily: SO.font, color: SO.text }}>
      <header className="px-7 pt-6 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="w-[140px] h-[68px] flex items-center justify-center overflow-hidden">
            {logo ? (
              <img src={logo} alt={razao} className="max-h-16 max-w-[140px] object-contain" />
            ) : (
              <div className="leading-none">
                <p className="text-[34px] font-black tracking-tight" style={{ color: SO.navy }}>
                  CB<span style={{ color: SO.green }}>A</span>
                </p>
                <p className="text-[9px] font-bold tracking-[0.28em] uppercase" style={{ color: SO.navy }}>Mineração</p>
              </div>
            )}
          </div>
          <div className="text-right">
            <h1 className="text-[22px] font-black tracking-[0.08em] uppercase" style={{ color: SO.green }}>Pedido de Venda</h1>
            <div className="mt-2 inline-flex items-center border-2 overflow-hidden" style={{ borderColor: SO.navy }}>
              <span className="px-3 py-1 text-[11px] font-black text-white" style={{ background: SO.navy }}>Nº</span>
              <span className="px-4 py-1 text-[13px] font-black min-w-[140px] text-left">{order.reference}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[8px] font-bold uppercase tracking-wide" style={{ color: SO.navy }}>
          <div className="border border-slate-200 rounded-md py-2">Calcário dolomítico</div>
          <div className="border border-slate-200 rounded-md py-2">Alto PRNT e qualidade</div>
          <div className="border border-slate-200 rounded-md py-2">Produtividade no campo</div>
          <div className="border border-slate-200 rounded-md py-2">Responsabilidade ambiental</div>
        </div>
      </header>

      <section className="mx-7 mb-3">
        <div className="px-3 py-1.5 text-[10px] font-black tracking-widest text-white uppercase" style={{ background: SO.navy }}>Dados do cliente</div>
        <div className="border border-t-0 px-3 py-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[10px]" style={{ borderColor: SO.border }}>
          <p><span className="font-black">Razão social:</span> {dash(customer?.name)}</p>
          <p><span className="font-black">CNPJ/CPF:</span> {dash(customer?.document)}</p>
          <p className="col-span-2"><span className="font-black">Endereço:</span> {dash(addr(customer))}</p>
          <p><span className="font-black">Município/UF:</span> {[customer?.city, customer?.state].filter(Boolean).join(' / ') || '—'}</p>
          <p><span className="font-black">Telefone:</span> {dash(customer?.phone)}</p>
          <p><span className="font-black">E-mail:</span> {dash(customer?.email)}</p>
        </div>
      </section>

      <section className="mx-7 mb-3">
        <div className="px-3 py-1.5 text-[10px] font-black tracking-widest text-white uppercase" style={{ background: SO.navy }}>Dados do pedido</div>
        <div className="border border-t-0 grid grid-cols-4 text-[10px]" style={{ borderColor: SO.border }}>
          <div className="px-3 py-2 border-r" style={{ borderColor: SO.border }}>
            <p className="font-black uppercase text-[8px]" style={{ color: SO.muted }}>Data do pedido</p>
            <p className="font-bold">{formatDate(order.date)}</p>
          </div>
          <div className="px-3 py-2 border-r" style={{ borderColor: SO.border }}>
            <p className="font-black uppercase text-[8px]" style={{ color: SO.muted }}>Previsão de entrega</p>
            <p className="font-bold">{formatDate(order.deliveryDate)}</p>
          </div>
          <div className="px-3 py-2 border-r" style={{ borderColor: SO.border }}>
            <p className="font-black uppercase text-[8px]" style={{ color: SO.muted }}>Cond. de pagamento</p>
            <p className="font-bold">{dash(order.paymentMethod)}</p>
          </div>
          <div className="px-3 py-2">
            <p className="font-black uppercase text-[8px]" style={{ color: SO.muted }}>Vendedor</p>
            <p className="font-bold">{dash(order.sellerName)}</p>
          </div>
        </div>
      </section>

      <section className="mx-7 mb-3">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="text-white" style={{ background: SO.navy }}>
              <th className="py-1.5 px-2 text-left font-black">Item</th>
              <th className="py-1.5 px-2 text-left font-black">Produto</th>
              <th className="py-1.5 px-2 text-left font-black">Descrição</th>
              <th className="py-1.5 px-2 text-right font-black">Qtde.</th>
              <th className="py-1.5 px-2 text-center font-black">Unid.</th>
              <th className="py-1.5 px-2 text-right font-black">Valor unit.</th>
              <th className="py-1.5 px-2 text-right font-black">Valor total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-b" style={{ borderColor: SO.border, background: idx % 2 ? '#F7F9FC' : 'white' }}>
                <td className="py-1.5 px-2 font-bold">{String(idx + 1).padStart(2, '0')}</td>
                <td className="py-1.5 px-2 font-bold">{it.productCode || it.productName}</td>
                <td className="py-1.5 px-2">{it.productName}</td>
                <td className="py-1.5 px-2 text-right font-bold">{formatQty(it.quantity)}</td>
                <td className="py-1.5 px-2 text-center">{it.unit || 'Ton'}</td>
                <td className="py-1.5 px-2 text-right">{formatBRL(it.unitPrice)}</td>
                <td className="py-1.5 px-2 text-right font-black">{formatBRL(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mx-7 mb-3 grid grid-cols-2 gap-3">
        <div className="border p-3 text-[10px]" style={{ borderColor: SO.border }}>
          <p className="font-black uppercase text-[8px] tracking-widest" style={{ color: SO.muted }}>Produto</p>
          <p className="font-black mt-1" style={{ color: SO.navy }}>Calcário dolomítico</p>
          <p>PRNT mínimo garantido: 80%</p>
          <p>MgO mínimo garantido: 14%</p>
          <p className="italic mt-1" style={{ color: SO.muted }}>Valores sujeitos a variação conforme lote e análise laboratorial.</p>
        </div>
        <div>
          <div className="px-3 py-1.5 text-[10px] font-black tracking-widest text-white uppercase" style={{ background: SO.navy }}>Resumo do pedido</div>
          <div className="border border-t-0 text-[11px]" style={{ borderColor: SO.border }}>
            <div className="flex justify-between px-3 py-1.5 border-b" style={{ borderColor: SO.border }}><span>Subtotal</span><strong>{formatBRL(order.subtotal)}</strong></div>
            <div className="flex justify-between px-3 py-1.5 border-b" style={{ borderColor: SO.border }}><span>Frete</span><strong>{formatBRL(order.shipping || 0)}</strong></div>
            <div className="flex justify-between px-3 py-1.5 border-b" style={{ borderColor: SO.border }}><span>Desconto</span><strong>{formatBRL(order.discount || 0)}</strong></div>
            <div className="flex justify-between px-3 py-2 text-white font-black" style={{ background: SO.green }}><span>Total geral</span><span>{formatBRL(order.total)}</span></div>
          </div>
        </div>
      </section>

      <section className="mx-7 mb-4 grid grid-cols-2 gap-3">
        <div>
          <div className="px-3 py-1.5 text-[10px] font-black tracking-widest text-white uppercase" style={{ background: SO.navy }}>Observações</div>
          <div className="border border-t-0 min-h-[72px] px-3 py-2 text-[10px]" style={{ borderColor: SO.border }}>{order.notes || ''}</div>
        </div>
        <div className="border px-3 py-3 text-center text-[10px]" style={{ borderColor: SO.border }}>
          <div className="h-10 border-b mb-2" style={{ borderColor: SO.border }} />
          <p className="font-black uppercase tracking-widest" style={{ color: SO.navy }}>Assinatura do cliente</p>
          <p style={{ color: SO.muted }}>Data: ____ / ____ / ________</p>
        </div>
      </section>

      <footer className="text-white px-7 py-4 flex items-start justify-between gap-4" style={{ background: SO.navyDeep }}>
        <div className="text-[9px] leading-relaxed">
          <p className="font-black text-[12px] tracking-wide">{razao || 'CBA Mineração'}</p>
          {cnpjEmp && <p>CNPJ {cnpjEmp}</p>}
          {endEmp.map((line, i) => <p key={i}>{line}</p>)}
          {phones.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div className="text-[8px] text-right opacity-80">
          <p>Impresso em {printedAt}</p>
        </div>
      </footer>
    </article>
  );
};

export default SalesOrderPrintDocument;
