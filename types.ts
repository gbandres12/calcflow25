
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
  OPERATIONAL_SUPERVISOR = 'Supervisor Operacional',
  OPERATOR = 'Operador'
}

export type FuelType = 'S10' | 'S500';

export interface UserPermissions {
  financial: boolean;
  users: boolean;
  inventory: boolean;
  orders: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  status: 'Ativo' | 'Inativo';
  lastAccess?: string;
  avatar?: string;
  companyId?: string;
  companyName?: string;
  cnpj?: string;
  phone?: string;
  jobTitle?: string;
  city?: string;
  state?: string;
  onboardingCompleted?: boolean;
  onboardingStep?: number;
  createdAt?: string;
  plan?: 'STARTER' | 'PRO' | 'ENTERPRISE';
  permissions?: UserPermissions;
}
