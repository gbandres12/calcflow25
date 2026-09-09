import React from 'react';
import TransferManagement from './TransferManagement';
import { TransferFromNfPanel } from './TransferFromNfPanel';
import { TransferShipment, StoreItem, Company, User } from '../types';

interface Props {
  transfers: TransferShipment[];
  storeItems: StoreItem[];
  company?: Company;
  currentUser?: User;
  onAddTransfer: (transfer: Omit<TransferShipment, 'id'>) => void;
  onUpdateTransfer: (transfer: TransferShipment) => void;
  onDeleteTransfer: (transferId: string) => void;
  onIntegrateWithStoreItems?: (items: { name: string; category: any; quantity: number; unit: string }[]) => void;
}

const TransfersPage: React.FC<Props> = (props) => (
  <div className="space-y-4">
    <TransferFromNfPanel
      currentUser={props.currentUser}
      company={props.company}
      existingCount={(props.transfers || []).length}
      onAddTransfer={props.onAddTransfer}
    />
    <TransferManagement {...props} />
  </div>
);

export default TransfersPage;
