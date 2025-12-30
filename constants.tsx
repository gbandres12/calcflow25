
import { Customer, InventoryItem, Transaction, TransactionType, TransactionStatus, Company, FinancialAccount, AccountType, CostCenter, User, UserRole } from './types';

export const INITIAL_USERS: User[] = [
  { 
    id: 'u1', 
    name: 'Admin Sistema', 
    email: 'admin@calcarioflow.com.br', 
    role: UserRole.ADMIN, 
    status: 'Ativo',
    lastAccess: new Date().toISOString()
  },
  { 
    id: 'u2', 
    name: 'Gerente Barreiras', 
    email: 'gerente.ba@lojasertanejo.com', 
    role: UserRole.MANAGER, 
    status: 'Ativo',
    lastAccess: new Date().toISOString()
  }
];

export const INITIAL_COMPANIES: Company[] = [
  { 
    id: 'c1', 
    name: 'Calcário Amazônia STM', 
    address: 'Rod. Santarém-Cuiabá, KM 12', 
    city: 'Santarém', 
    state: 'PA', 
    document: '11.222.333/0001-01',
    phone: '(93) 3522-1000'
  },
  { 
    id: 'c2', 
    name: 'Loja do Sertanejo', 
    address: 'Av. das Palmeiras, 500', 
    city: 'Barreiras', 
    state: 'BA', 
    document: '44.555.666/0001-02',
    phone: '(77) 3611-2000'
  }
];

export const INITIAL_COST_CENTERS: CostCenter[] = [
  { id: 'cc1', name: 'Administrativo', color: '#1B3C73' },
  { id: 'cc2', name: 'Produção / Moagem', color: '#334D13' },
  { id: 'cc3', name: 'Logística / Frota', color: '#B45309' },
  { id: 'cc4', name: 'Vendas / Comercial', color: '#6D28D9' }
];

export const INITIAL_ACCOUNTS: FinancialAccount[] = [
  { id: 'acc_c1', companyId: 'c1', name: 'Caixa Geral - STM', type: AccountType.CAIXA, initialBalance: 0 }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  { id: 'britado', companyId: 'c1', name: 'Calcário Britado', quantity: 100, unitPrice: 40.00, minStock: 20 },
  { id: 'moido', companyId: 'c1', name: 'Calcário Moído', quantity: 50, unitPrice: 95.00, minStock: 15 }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  { id: 'cust1', companyId: 'c1', name: 'Fazenda Rio Verde', document: '12.345.678/0001-90', email: 'contato@rioverde.com', phone: '(93) 9999-0001', totalSpent: 0 }
];

export const INITIAL_TRANSACTIONS: Transaction[] = [];
