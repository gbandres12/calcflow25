import React from 'react';
import { FiscalNotesPage } from './FiscalNotesPage';
import { SaleOrder, Customer, Company } from '../types';

interface FiscalManagementProps {
  orders: SaleOrder[];
  customers: Customer[];
  company: Company;
  companyId?: string;
  onUpdateOrder: (order: SaleOrder) => void;
}

/** Tela Fiscal: somente notas, situação e emissão. Configuração foi para Configurações. */
export const FiscalManagement: React.FC<FiscalManagementProps> = (props) => {
  return <FiscalNotesPage {...props} />;
};

export default FiscalManagement;
