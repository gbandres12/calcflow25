import React, { useState } from 'react';
import { FileUp } from 'lucide-react';
import { Company, TransferItem, TransferShipment, User } from '../types';
import { NfImportModal } from './NfImportModal';

interface Props {
  currentUser?: User;
  company?: Company;
  existingCount?: number;
  onAddTransfer: (transfer: Omit<TransferShipment, 'id'>) => void;
}

export const TransferFromNfPanel: React.FC<Props> = ({ currentUser, existingCount = 0, onAddTransfer }) => {
  const [open, setOpen] = useState(false);
  const [driver, setDriver] = useState('');
  const [plate, setPlate] = useState('');

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">Nova remessa a partir da NF de compra</p>
        <p className="text-xs text-slate-500">Sobe o XML da SEFAZ (melhor) ou o PDF do DANFE e a relação Santarém → fazenda já sai preenchida.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Motorista" className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
        <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Placa" className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs w-24 uppercase" />
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1F33] text-white text-xs font-semibold">
          <FileUp size={14} /> Importar NF-e / PDF
        </button>
      </div>
      <NfImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onApply={(items: TransferItem[], meta) => {
          const year = new Date().getFullYear();
          const next = String((existingCount || 0) + 1).padStart(3, '0');
          onAddTransfer({
            code: `TRF-${year}-${next}`,
            originLocation: 'Polo de Compras Santarém (Av. Mendonça Furtado)',
            destinationLocation: 'Fazenda Usina Matriz (Zona Rural / Rodovia)',
            dateSent: new Date().toISOString().slice(0, 10),
            sentBy: currentUser?.name || 'Compras Santarém',
            carrierOrDriver: driver || undefined,
            vehiclePlate: plate || undefined,
            notes: meta.notes,
            items,
            status: 'EM_TRANSITO',
            stockIntegrated: false,
            createdAt: new Date().toISOString()
          });
        }}
      />
    </div>
  );
};

export default TransferFromNfPanel;
