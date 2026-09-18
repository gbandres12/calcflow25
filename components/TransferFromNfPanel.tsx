import React, { useState } from 'react';
import { FileUp } from 'lucide-react';
import { Company, StoreItem, TransferShipment, User } from '../types';
import { NfImportModal } from './NfImportModal';

interface Props {
  currentUser?: User;
  company?: Company;
  storeItems: StoreItem[];
  transfers: TransferShipment[];
  onAddTransfer: (transfer: Omit<TransferShipment, 'id'>) => void;
}

export const TransferFromNfPanel: React.FC<Props> = ({
  currentUser,
  company,
  storeItems,
  transfers,
  onAddTransfer
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-[#0F5948] hover:bg-[#1B6B58] text-white px-5 py-2.5 rounded-2xl font-semibold text-sm shadow-lg shadow-[#0F5948]/20"
      >
        <FileUp size={18} />
        Importar NF de Santarém
      </button>
      <NfImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        storeItems={storeItems}
        transfers={transfers}
        currentUser={currentUser}
        company={company}
        onApply={(shipment) => {
          onAddTransfer(shipment);
          setOpen(false);
        }}
      />
    </>
  );
};

export default TransferFromNfPanel;
