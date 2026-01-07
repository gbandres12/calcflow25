
import { Customer, InventoryItem, Transaction, TransactionType, TransactionStatus, Company, FinancialAccount, AccountType, CostCenter, User, UserRole } from './types';

// IDs oficiais sincronizados com o seu banco de dados (UUIDs válidos)
export const ID_CBA_STM = '68ed0b32-c9c7-40de-8b10-af2900000029';
export const ID_MUC_RR = '68ed0b32-c9c7-40de-8b10-af2a0000002a';
export const ID_LDS_STM = '68ed0b32-c9c7-40de-8b10-af2b0000002b';

export const INFLOW_CATEGORIES = [
  'Vendas',
  'Distribuição entre Filiais',
  'Empréstimo entre Filiais',
  'Outros'
];

export const OUTFLOW_CATEGORIES = [
  'Combustível',
  'Manutenção Veículos',
  'Peças',
  'Salários',
  'Alimentação',
  'Serviços Terceiros',
  'Impostos',
  'Aluguel',
  'Energia Elétrica',
  'Água/Esgoto',
  'Internet/Telefone',
  'Material de Escritório',
  'Material de Construção',
  'EPIs',
  'Marketing',
  'Pró-labore',
  'Outros'
];

// Mantido para compatibilidade onde for necessário a lista completa
export const STANDARD_CATEGORIES = [...INFLOW_CATEGORIES, ...OUTFLOW_CATEGORIES];

export const INITIAL_USERS: User[] = [
  { 
    id: 'u1', 
    name: 'Admin Sistema', 
    email: 'admin@calcarioflow.com.br', 
    role: UserRole.ADMIN, 
    status: 'Ativo',
    lastAccess: new Date().toISOString()
  }
];

export const INITIAL_COMPANIES: Company[] = [
  { 
    id: ID_CBA_STM, 
    name: 'CBA Santarém', 
    code: 'CBA-STM',
    address: 'Rodovia Br 163, 1030 - Sale, Santarem - PA', 
    city: 'Santarém', 
    state: 'PA', 
    document: '10.375.218/0002-65',
    phone: '(93) 3522-1000',
    isActive: true
  },
  { 
    id: ID_LDS_STM, 
    name: 'Loja do Sertanejo Santarém', 
    code: 'LDS-STM',
    address: 'Rua do Comércio, 500', 
    city: 'Santarém', 
    state: 'PA', 
    document: '25.143.614/0001-53',
    phone: '(93) 3522-3000',
    isActive: true
  },
  { 
    id: ID_MUC_RR, 
    name: 'Mucajaí - Roraima', 
    code: 'MUC-RR',
    address: 'Area Vicinal Apiau Km 04, Mucajai - RR', 
    city: 'Mucajaí', 
    state: 'RR', 
    document: '10.375.218/0004-27',
    phone: '(95) 3415-2000',
    isActive: true
  }
];

export const INITIAL_COST_CENTERS: CostCenter[] = [
  { id: 'cc1', name: 'Administrativo', color: '#1B3C73' },
  { id: 'cc2', name: 'Produção / Moagem', color: '#10B981' },
  { id: 'cc3', name: 'Frota / Logística', color: '#F59E0B' },
  { id: 'cc4', name: 'Vendas / Comercial', color: '#8B5CF6' },
  { id: 'cc5', name: 'Marketing / Branding', color: '#EC4899' },
  { id: 'cc6', name: 'Recursos Humanos', color: '#3B82F6' },
  { id: 'cc7', name: 'Manutenção / Obras', color: '#EF4444' },
  { id: 'cc8', name: 'TI / Tecnologia', color: '#0EA5E9' },
  { id: 'cc9', name: 'Impostos / Taxas', color: '#64748B' }
];

export const INITIAL_ACCOUNTS: FinancialAccount[] = [
  { id: 'acc_c1', companyId: ID_CBA_STM, name: 'Caixa Geral - STM', type: AccountType.CAIXA, initialBalance: 0 }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  { id: 'britado', companyId: ID_CBA_STM, name: 'Calcário Britado', quantity: 100, unitPrice: 40.00, minStock: 20 },
  { id: 'moido', companyId: ID_CBA_STM, name: 'Calcário Moído', quantity: 50, unitPrice: 95.00, minStock: 15 }
];

export const INITIAL_CUSTOMERS: Customer[] = [];
export const INITIAL_TRANSACTIONS: Transaction[] = [];
