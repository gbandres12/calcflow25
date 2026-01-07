
export enum TransactionType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  EXPENSE = 'EXPENSE'
}

export enum TransactionStatus {
  PENDENTE = 'pendente',
  PAGO = 'pago',
  CONFIRMADO = 'confirmado',
  ATRASADO = 'atrasado',
  PARCIAL = 'parcial'
}

export enum OrderStatus {
  BUDGET = 'Orçamento',
  FINALIZED = 'Venda Confirmada',
  CANCELLED = 'Cancelado'
}

export enum AccountType {
  BANCO = 'banco',
  CAIXA = 'caixa',
  CARTEIRA_DIGITAL = 'carteira_digital'
}

export enum UserRole {
  ADMIN = 'Administrador',
  MANAGER = 'Gerente',
  OPERATOR = 'Operador'
}

export type FuelType = 'S10' | 'S500';

export interface User {
  id: string;
  companyId?: string; // Opcional para Admins Globais, Obrigatório para Operadores de Filial
  name: string;
  email: string;
  role: UserRole;
  status: 'Ativo' | 'Inativo';
  lastAccess?: string;
  avatar?: string;
}

export interface CostCenter {
  id: string;
  name: string;
  color: string;
}

export interface Company {
  id: string;
  name: string;
  code: string;
  address?: string;
  document?: string;
  city?: string;
  state?: string;
  phone?: string;
  isActive: boolean;
}

export interface FinancialAccount {
  id: string;
  companyId: string;
  name: string;
  type: AccountType;
  bankName?: string;
  accountNumber?: string;
  initialBalance: number;
}

export interface Customer {
  id: string;
  companyId: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  totalSpent: number;
}

export interface InventoryItem {
  id: 'britado' | 'moido' | string;
  companyId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  minStock: number;
}

export interface Machine {
  id: string;
  companyId: string;
  name: string;
  type: 'Trator' | 'Caminhão' | 'Britador' | 'Pá Carregadeira' | 'Escavadeira' | 'Outros';
  plateOrId: string;
  currentHorimeter: number;
  status: 'Operacional' | 'Manutenção' | 'Parado';
  lastMaintenance?: string;
}

export interface StoreItem {
  id: string;
  companyId: string;
  name: string;
  category: 'Peças' | 'Lubrificantes' | 'EPI' | 'Ferramentas' | 'Outros';
  quantity: number;
  unit: string;
  minStock: number;
}

export interface MaintenanceRecord {
  id: string;
  companyId: string;
  machineId: string;
  date: string;
  description: string;
  cost: number;
  type: 'Preventiva' | 'Corretiva';
  horimeter: number;
}

export interface FuelRecord {
  id: string;
  companyId: string;
  machineId: string;
  date: string;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  horimeter: number;
  fuelType: FuelType;
}

export interface FuelPurchase {
  id: string;
  companyId: string;
  date: string;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  supplier: string;
  fuelType: FuelType;
}

export interface SalePayment {
  id: string;
  amount: number;
  paidAmount?: number;
  date: string;
  status: TransactionStatus;
  accountId: string;
  description?: string;
}

export interface Transaction {
  id: string;
  companyId: string;
  accountId: string;
  costCenterId?: string;
  date: string;
  type: TransactionType;
  status: TransactionStatus;
  description: string;
  category: string;
  amount: number;
  paidAmount: number;
  quantity?: number;
  productId?: string;
  customerId?: string;
  orderId?: string;
  notes?: string;
}

export interface SaleOrder {
  id: string;
  reference: string;
  companyId: string;
  customerId: string;
  sellerName: string;
  date: string;
  deliveryDate?: string;
  validUntil?: string;
  items: {
    productId: string;
    productCode: string;
    productName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    total: number;
  }[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  payments: SalePayment[];
  notes?: string;
}

export type View = 'dashboard' | 'inventory' | 'sales' | 'purchases' | 'milling' | 'customers' | 'transactions' | 'accounts' | 'orders' | 'fleet' | 'yard' | 'fuel' | 'cashflow' | 'users';
