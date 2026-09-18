import React from 'react';
import TransferManagement from './TransferManagement';
import { TransferShipment, StoreItem, Company, User } from '../types';

interface Props {
  transfers: TransferShipment[];
  storeItems: StoreItem[];
  company?: Company;
  currentUser?: User;
  onAddTransfer: (transfer: Omit<TransferShipment, 'id'>) => void;
  onUpdateTransfer: (transfer: TransferShipment) => void;
  onDeleteTransfer: (transferId: string) => void;
  onIntegrateWithStoreItems?: (items: {
    name: string;
    category: StoreItem['category'];
    quantity: number;
    unit: string;
    productId?: string;
    cProd?: string;
    ncm?: string;
    supplierCnpj?: string;
    unitCost?: number;
    nfNumber?: string;
    nfeChave?: string;
  }[]) => void;
}

const TransfersPage: React.FC<Props> = (props) => <TransferManagement {...props} />;

export default TransfersPage;
