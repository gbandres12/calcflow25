import React, { useEffect, useState } from 'react';
import { Company, FiscalConfig, TransferShipment } from '../../types';
import { fiscalService } from '../../services/fiscalService';
import { resolveEmitenteIdentity } from './emitenteIdentity';

interface Props {
  transfer: TransferShipment;
  company?: Company;
}

const formatBRL = (val?: number) =>
  (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (value?: string) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR');
};

export const TransferRomaneioDocument: React.FC<Props> = ({ transfer, company }) => {
  const [fiscal, setFiscal] = useState<FiscalConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fiscalService.getConfig(company?.id).then((cfg) => {
      if (!cancelled) setFiscal(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, [company?.id]);

  const brand = resolveEmitenteIdentity(fiscal, company);
  const totalQty = (transfer.items || []).reduce((s, it) => s + (Number(it.quantitySent) || 0), 0);
  const totalCost = (transfer.items || []).reduce((s, it) => s + (Number(it.totalCost) || 0), 0);
  const received = transfer.status === 'CONFERIDO_E_RECEBIDO' || transfer.status === 'RECEBIDO_COM_DIVERGENCIA';

  return (
    <article
      id="printable-transfer-romaneio"
      className="bg-white text-slate-800"
      style={{ fontFamily: 'Inter, Roboto, system-ui, sans-serif' }}
    >
      <header className="border-b-2 pb-4" style={{ borderColor: '#0F5948' }}>
        <div className="flex items-start justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-[132px] h-[72px] shrink-0 flex items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
              {brand.logoDataUrl ? (
                <img
                  src={brand.logoDataUrl}
                  alt={brand.tradeName || brand.corporateName}
                  className="max-h-[68px] max-w-[128px] object-contain"
                />
              ) : (
                <div className="text-center px-2">
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#0F5948' }}>
                    {(brand.tradeName || 'Empresa').slice(0, 18)}
                  </p>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-black tracking-tight uppercase leading-tight text-slate-950">
                {brand.corporateName || brand.tradeName || 'Empresa'}
              </h2>
              {brand.tradeName && brand.tradeName !== brand.corporateName && (
                <p className="text-[11px] font-semibold text-slate-600 mt-0.5">{brand.tradeName}</p>
              )}
              <p className="text-[11px] text-slate-700 mt-1.5 font-medium">
                {brand.cnpj ? `CNPJ ${brand.cnpj}` : 'CNPJ não informado no cadastro fiscal'}
                {brand.ie ? `  ·  IE ${brand.ie}` : ''}
              </p>
              {brand.addressLine && (
                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{brand.addressLine}</p>
              )}
              {brand.phone && <p className="text-[10px] text-slate-500">Tel. {brand.phone}</p>}
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="inline-block text-[9px] font-black uppercase tracking-[0.16em] text-white px-2 py-1 rounded" style={{ background: '#0F5948' }}>
              Guia de transferência
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mt-2">Nº da guia</span>
            <span className="text-xl font-mono font-black text-slate-900 block leading-none">{transfer.code}</span>
            <span className="text-[11px] text-slate-500 mt-1 block">Emissão: {formatDate(transfer.dateSent)}</span>
          </div>
        </div>
      </header>

      <div className="mt-4 mb-4 py-2 text-center font-black uppercase text-[11px] tracking-[0.14em] text-white" style={{ background: '#0F5948' }}>
        Remessa de materiais entre filiais
      </div>

      <div className="grid grid-cols-2 gap-3 text-[11px] mb-5">
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
          <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block">Origem / expedição</span>
          <span className="font-bold text-slate-900 block mt-1">{transfer.originLocation}</span>
          <span className="text-slate-600 block mt-1">Expedido por: <strong>{transfer.sentBy}</strong></span>
        </div>
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
          <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block">Destino / recebimento</span>
          <span className="font-bold text-slate-900 block mt-1">{transfer.destinationLocation}</span>
          <span className="text-slate-600 block mt-1">
            Motorista: <strong>{transfer.carrierOrDriver || 'Próprio'}</strong>
            {transfer.vehiclePlate ? ` · Placa ${transfer.vehiclePlate}` : ''}
          </span>
        </div>
      </div>

      <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 block mb-2">
        Relação de produtos e suprimentos
      </span>

      <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
        <thead className="text-white font-bold uppercase text-[9px] tracking-wide" style={{ background: '#0F5948' }}>
          <tr>
            <th className="border border-slate-300 px-2 py-2 text-center w-8">#</th>
            <th className="border border-slate-300 px-2 py-2">Descrição</th>
            <th className="border border-slate-300 px-2 py-2">Categoria</th>
            <th className="border border-slate-300 px-2 py-2 text-center">Un.</th>
            <th className="border border-slate-300 px-2 py-2 text-center">Qtde env.</th>
            <th className="border border-slate-300 px-2 py-2 text-center">Qtde rec.</th>
            <th className="border border-slate-300 px-2 py-2">Fornecedor / NF</th>
            <th className="border border-slate-300 px-2 py-2 text-center w-14">Visto</th>
          </tr>
        </thead>
        <tbody>
          {(transfer.items || []).map((item, idx) => (
            <tr key={item.id} className="border-b border-slate-200">
              <td className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-500">{idx + 1}</td>
              <td className="border border-slate-300 px-2 py-2 font-bold text-slate-900">{item.productName}</td>
              <td className="border border-slate-300 px-2 py-2 text-slate-600">{item.category}</td>
              <td className="border border-slate-300 px-2 py-2 text-center font-mono">{item.unit}</td>
              <td className="border border-slate-300 px-2 py-2 text-center font-black">{item.quantitySent}</td>
              <td className="border border-slate-300 px-2 py-2 text-center font-black">
                {received ? (item.quantityReceived ?? item.quantitySent) : ''}
              </td>
              <td className="border border-slate-300 px-2 py-2 text-slate-600">
                {item.supplier || ''} {item.nfCompraNumber ? `(${item.nfCompraNumber})` : ''}
              </td>
              <td className="border border-slate-300 px-2 py-2 text-center">{item.conferido ? '✓' : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-100 font-bold">
          <tr>
            <td colSpan={4} className="border border-slate-300 px-2 py-2 text-right">Totais</td>
            <td className="border border-slate-300 px-2 py-2 text-center font-black">{totalQty}</td>
            <td colSpan={3} className="border border-slate-300 px-2 py-2 text-right font-mono">
              {totalCost > 0 ? `Valor estimado: ${formatBRL(totalCost)}` : ''}
            </td>
          </tr>
        </tfoot>
      </table>

      {transfer.notes && (
        <div className="mt-3 text-[11px] text-slate-600">
          <strong>Observações:</strong> {transfer.notes}
        </div>
      )}

      <div className="pt-8 mt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-[11px]">
        <div className="space-y-3 text-center">
          <div className="border-b border-slate-400 pb-1 h-14 flex items-end justify-center">
            <span className="font-serif italic text-slate-800 text-sm">{transfer.sentBy}</span>
          </div>
          <div>
            <span className="font-bold text-slate-900 block">Expedição — origem</span>
            <span className="text-[10px] text-slate-500 block">{transfer.originLocation}</span>
            <span className="text-[10px] text-slate-500">Data: {formatDate(transfer.dateSent)}</span>
          </div>
        </div>
        <div className="space-y-3 text-center">
          <div className="border-b border-slate-400 pb-1 h-14 flex items-end justify-center">
            {transfer.receiverSignature?.startsWith('data:image') ? (
              <img src={transfer.receiverSignature} alt="Assinatura" className="h-12 object-contain" />
            ) : transfer.receivedBy ? (
              <span className="font-serif italic text-emerald-900 text-sm font-bold">
                ✓ {transfer.receivedBy}
              </span>
            ) : (
              <span className="text-slate-300 italic text-[11px]">Assinatura do recebedor</span>
            )}
          </div>
          <div>
            <span className="font-bold text-slate-900 block">
              {transfer.receivedBy ? `Recebido por ${transfer.receivedBy}` : 'Recebimento — destino'}
            </span>
            <span className="text-[10px] text-slate-500 block">
              {transfer.receiverRole || transfer.destinationLocation}
            </span>
            <span className="text-[10px] text-slate-500">
              Data: {transfer.receivedDate ? formatDate(transfer.receivedDate) : '____/____/________'}
            </span>
          </div>
        </div>
      </div>

      <p className="pt-4 mt-2 text-center text-[9px] text-slate-400 border-t border-slate-200">
        Documento interno de conferência logística. Emitente conforme cadastro fiscal da empresa (CNPJ e logotipo da NF-e).
      </p>
    </article>
  );
};
