
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

export interface Category {
  id: string;
  name: string;
  type: 'INFLOW' | 'OUTFLOW';
  companyId?: string;
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
  name: string;
  type: AccountType;
  bankName?: string;
  accountNumber?: string;
  initialBalance: number;
  companyId?: string;
}

export interface Customer {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  totalSpent: number;
  companyId?: string;
  tipoPessoa?: 'PJ' | 'PF' | 'PRODUTOR';
  ie?: string;
  isentoIE?: boolean;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  ibgeCode?: string;
}

export interface InventoryItem {
  id: 'britado' | 'moido' | string;
  code?: string;
  name: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  costPrice?: number;
  minStock: number;
  unit?: string;
  companyId?: string;
  
  // Área Fiscal
  ncm?: string;
  cst?: string;
  cfop?: string;
  origem?: string;
  aliquotaIcms?: number;
  aliquotaPis?: number;
  aliquotaCofins?: number;
  unidadeTributavel?: string;
  fatorConversao?: number;
  observacoesFiscais?: string;
}

export interface Machine {
  id: string;
  name: string;
  type: 'Trator' | 'Caminhão' | 'Britador' | 'Pá Carregadeira' | 'Escavadeira' | 'Outros';
  plateOrId: string;
  currentHorimeter: number;
  status: 'Operacional' | 'Manutenção' | 'Parado';
  lastMaintenance?: string;
  companyId?: string;
}

export interface StoreItem {
  id: string;
  name: string;
  category: 'Peças' | 'Lubrificantes' | 'EPI' | 'Ferramentas' | 'Outros';
  quantity: number;
  unit: string;
  minStock: number;
  companyId?: string;
}

export interface MaintenanceRecord {
  id: string;
  machineId: string;
  date: string;
  description: string;
  cost: number;
  type: 'Preventiva' | 'Corretiva';
  horimeter: number;
  companyId?: string;
}

export interface FuelRecord {
  id: string;
  machineId: string;
  date: string;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  horimeter: number;
  fuelType: FuelType;
  companyId?: string;
}

export interface FuelPurchase {
  id: string;
  date: string;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  supplier: string;
  fuelType: FuelType;
  companyId?: string;
}

export interface PaymentReceipt {
  id: string;
  orderId?: string;
  orderReference?: string;
  customerId: string;
  customerName: string;
  customerDocument?: string;
  amount: number;
  date: string;
  paymentMethod: string; // 'Dinheiro' | 'PIX' | 'Transferência Bancária' | 'Boleto' | 'Cartão de Débito' | 'Cartão de Crédito' | 'Cheque'
  accountId?: string;
  accountName?: string;
  receivedBy?: string;
  description: string;
  type: 'ENTRADA' | 'PARCELA' | 'ABATIMENTO' | 'AVULSO';
  totalOrderAmount?: number;
  totalPaidSoFar?: number;
  remainingDebt?: number;
  notes?: string;
}

export interface OrderWithdrawal {
  id: string;
  orderId: string;
  orderReference?: string;
  date: string;
  driverName: string;
  driverCpf?: string;
  driverDocument?: string;
  plateNumber: string;
  truckModel?: string;
  truckType?: string;
  quantityWithdrawn: number; // Toneladas retiradas
  productName?: string;
  weighTicketNumber?: string;
  totalOrderQuantity?: number;
  totalWithdrawnSoFar?: number;
  remainingBalanceQuantity?: number;
  loadedBy?: string;
  operatorName?: string;
  notes?: string;
}

export interface SalePayment {
  id: string;
  amount: number;
  paidAmount?: number;
  date: string;
  status: TransactionStatus;
  accountId: string;
  description?: string;
  paymentMethod?: string;
}

export interface TransactionPayment {
  id: string;
  transactionId: string;
  amount: number;
  paymentDate: string;
  accountId: string;
  paymentMethod: string;
  notes?: string;
  isDiscountOrDeduction?: boolean;
  createdAt?: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  costCenterId?: string;
  costCenter?: string; // Nome livre ou sugerido por IA
  date: string; // Data de competência / vencimento (due_date)
  dueDate?: string;
  paymentDate?: string; // Data efetiva do pagamento
  type: TransactionType;
  status: TransactionStatus;
  description: string;
  category: string;
  amount: number; // Valor LÍQUIDO final
  originalAmount?: number; // Valor cheio antes do desconto
  discount?: number; // Desconto monetário total calculado
  discountType?: 'percentage' | 'fixed';
  discountValue?: number; // % ou R$ digitado
  paidAmount: number; // Soma já paga
  quantity?: number;
  productId?: string;
  customerId?: string;
  contactId?: string; // ID do cliente ou fornecedor
  contactName?: string; // Nome do cliente ou fornecedor vinculado
  orderId?: string;
  notes?: string;
  companyId?: string;
  receiptId?: string;
  paymentMethod?: string;
  payments?: TransactionPayment[]; // Histórico de pagamentos parciais / abatimentos
}

export type NfeStatus = 'nao_emitida' | 'processando' | 'autorizada' | 'rejeitada' | 'cancelada';

export interface SaleOrder {
  id: string;
  reference: string;
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
    ncm?: string;
    cfop?: string;
  }[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paidAmount?: number;
  remainingAmount?: number;
  paymentStatus?: 'pago' | 'parcial' | 'pendente';
  withdrawalStatus?: 'aguardando' | 'parcial' | 'total';
  status: OrderStatus;
  payments: SalePayment[];
  receipts?: PaymentReceipt[];
  withdrawals?: OrderWithdrawal[];
  // Barter / Permuta Agro (Calcário x Grãos)
  isBarter?: boolean;
  barterCrop?: 'Milho' | 'Soja' | 'Sorgo' | 'Outro' | string;
  barterCommodityType?: 'MILHO' | 'SOJA' | string;
  cornTons?: number; // Toneladas ou sacas de grãos
  cornUnitValue?: number; // Cotação da saca / tonelada de grãos
  cornPricePerTon?: number;
  barterEquivalentValue?: number;
  notes?: string;
  companyId?: string;
  // Fiscal / NotaAs fields
  nfeStatus?: NfeStatus;
  nfeId?: string;
  nfeChave?: string;
  nfeNumero?: string;
  nfeSerie?: string;
  nfeProtocolo?: string;
  nfeDanfeUrl?: string;
  nfeXmlUrl?: string;
  nfeEmissao?: string;
  nfeErro?: string;
  nfeNaturezaOperacao?: string;
}

export interface FiscalConfig {
  id: string;
  apiKey: string;
  environment: 'sandbox' | 'production';
  cnpjEmitente: string;
  inscricaoEstadual: string;
  razaoSocial: string;
  nomeFantasia: string;
  regimeTributario: '1' | '2' | '3'; // 1 = Simples Nacional, 2 = Simples Nacional Excesso, 3 = Regime Normal
  serieNFe: string;
  proxNumeroNFe: number;
  naturezaOperacaoPadrao: string;
  cfopPadraoEstadual: string;
  cfopPadraoInterestadual: string;
  aliquotaIcmsPadrao?: number;
  observacoesFiscaisPadrao?: string;
  autoEmitirAoFinalizar?: boolean;
}

export type View = 'dashboard' | 'inventory' | 'sales' | 'purchases' | 'milling' | 'customers' | 'transactions' | 'daily' | 'accounts' | 'orders' | 'fleet' | 'yard' | 'fuel' | 'cashflow' | 'users' | 'settings' | 'fiscal';

