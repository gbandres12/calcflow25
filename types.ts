
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
  fiscal?: boolean;
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
  cnpj?: string;
  corporateName?: string;
  tradeName?: string;
  ie?: string;
  stateRegistration?: string;
  city?: string;
  state?: string;
  phone?: string;
  isActive: boolean;
}

/** read/write por módulo (mesma chave de ALL_TABLES em dataService.ts). */
export type CompanyModulePermissions = Record<string, { read: boolean; write: boolean }>;

/** Vínculo do usuário logado com uma empresa (matriz ou filial). */
export interface CompanyMembership {
  companyId: string;
  companyName?: string;
  role: string;
  permissions: CompanyModulePermissions;
  isBranch: boolean;
  parentCompanyId?: string | null;
}

/** Uma filial (ou a matriz) cadastrada em public.companies, com quem tem acesso. */
export interface CompanyBranch {
  id: string;
  name: string;
  parentCompanyId: string | null;
  ownerUserId?: string | null;
  isActive: boolean;
  isBranch: boolean;
  createdAt?: string;
  members: Array<{
    userId: string;
    role: string;
    permissions: CompanyModulePermissions;
    name?: string;
    email?: string;
  }>;
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
  ncm?: string;
  cst?: string; // CST ICMS / CSOSN Padrão
  cstPis?: string; // CST PIS Padrão
  cstCofins?: string; // CST COFINS Padrão
  cfop?: string;
  origem?: string;
  aliquotaIcms?: number;
  aliquotaPis?: number;
  aliquotaCofins?: number;
  unidadeTributavel?: string;
  fatorConversao?: number;
  observacoesFiscais?: string;
  informacoesComplementares?: string; // Informações Complementares pré-definidas para a NF-e
  infAdProd?: string; // Informação adicional do produto (tag infAdProd, por item)

  // Reforma Tributária (RTC - EC 132/2023)
  cClassTrib?: string; // Código de Classificação Tributária RTC
  cstIbsCbs?: string; // CST IBS/CBS
  aliquotaIbs?: number; // Alíquota estimada IBS (%)
  reducaoBcIbs?: number; // Redução de BC IBS (%)
  aliquotaCbs?: number; // Alíquota estimada CBS (%)
  reducaoBcCbs?: number; // Redução de BC CBS (%)
  sujeitoIs?: boolean; // Sujeito ao Imposto Seletivo (IS)
  aliquotaIs?: number; // Alíquota Imposto Seletivo (%)
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

export type StoreItemCategory = 'Peças' | 'Lubrificantes' | 'EPI' | 'Ferramentas' | 'Insumos' | 'Outros';

export interface StoreItem {
  id: string;
  name: string;
  category: StoreItemCategory;
  quantity: number;
  unit: string;
  minStock: number;
  companyId?: string;
  /** Código do fornecedor (cProd da NF) para casar próximas compras. */
  supplierSku?: string;
  supplierCnpj?: string;
  ncm?: string;
  unitCost?: number;
  lastNfNumber?: string;
  lastNfeChave?: string;
  status?: 'ativo' | 'pendente_cadastro';
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
  paymentMethod: string;
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
  quantityWithdrawn: number;
  productName?: string;
  weighTicketNumber?: string;
  totalOrderQuantity?: number;
  totalWithdrawnSoFar?: number;
  remainingBalanceQuantity?: number;
  loadedBy?: string;
  operatorName?: string;
  notes?: string;
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
  costCenter?: string;
  date: string;
  dueDate?: string;
  paymentDate?: string;
  type: TransactionType;
  status: TransactionStatus;
  description: string;
  category: string;
  amount: number;
  originalAmount?: number;
  discount?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  paidAmount: number;
  quantity?: number;
  productId?: string;
  customerId?: string;
  contactId?: string;
  contactName?: string;
  orderId?: string;
  notes?: string;
  companyId?: string;
  receiptId?: string;
  paymentMethod?: string;
  payments?: TransactionPayment[];
}

export type NfeStatus = 'nao_emitida' | 'rascunho' | 'processando' | 'autorizada' | 'rejeitada' | 'cancelada';

export type SaleNfeTipo = 'pedido' | 'avulsa' | 'devolucao' | 'transferencia';

export interface SaleOrderItem {
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
  cst?: string;
  csosn?: string;
  aliquotaIcms?: number;
  aliquotaPis?: number;
  aliquotaCofins?: number;
  cClassTrib?: string;
  aliquotaIbs?: number;
  aliquotaCbs?: number;
  aliquotaIs?: number;
  informacoesComplementares?: string;
  infAdProd?: string;
  /** Texto da coluna Descrição no pedido impresso (se vazio, usa productName). */
  productDescription?: string;
  /** Garantias comerciais registradas no pedido e impressas no documento. */
  hasGarantias?: boolean;
  prntMinimoGarantido?: number;
  mgoMinimoGarantido?: number;
  garantiaNota?: string;
}

/** NF-e vinculada ao pedido (completa, avulsa/parcial, devolução ou transferência). */
export interface SaleOrderLinkedNfe {
  id: string;
  tipo: SaleNfeTipo;
  reference: string;
  items: SaleOrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  frete?: FreteInfo;
  nfeStatus: NfeStatus;
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
  nfeInfCpl?: string;
  nfePayload?: any;
  nfeRawResponse?: any;
  createdAt: string;
  notes?: string;
}

/** Modalidade de frete padrão SEFAZ (grupo transp / modFrete) */
export type FreteModalidade = 0 | 1 | 2 | 3 | 4 | 9;

export interface FreteTransportadora {
  documento?: string; // CNPJ ou CPF (só dígitos)
  nome?: string; // Razão social / nome do transportador
  ie?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  rntrc?: string; // Registro ANTT
}

export type TransportadorTipoServico = 'INTERNO' | 'ENTREGA' | 'AMBOS';
export type TransportadorContratacao = 'EMPRESA' | 'CLIENTE' | 'AMBOS';

/** Cadastro mestre reutilizado nas operações internas e na emissão de NF-e. */
export interface Transportador extends FreteTransportadora {
  id: string;
  companyId?: string;
  nome: string;
  documento: string;
  tipoServico: TransportadorTipoServico;
  contratacao: TransportadorContratacao;
  telefone?: string;
  email?: string;
  cnh?: string;
  categoriaCnh?: string;
  validadeCnh?: string;
  placa?: string;
  ufPlaca?: string;
  modeloVeiculo?: string;
  ativo: boolean;
  observacoes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FreteVeiculo {
  placa?: string;
  uf?: string;
  rntrc?: string;
}

export interface FreteVolume {
  quantidade?: number; // qVol
  especie?: string; // ex: GRANEL, SACAS, CAIXAS
  marca?: string;
  pesoLiquido?: number; // pesoL (kg)
  pesoBruto?: number; // pesoB (kg)
}

export interface FreteInfo {
  modalidade?: FreteModalidade | number;
  valor?: number; // vFrete — compõe o total da NF-e
  transportadorId?: string; // vínculo com o cadastro mestre
  transportadora?: FreteTransportadora;
  veiculo?: FreteVeiculo;
  volumes?: FreteVolume;
}

export const FRETE_MODALIDADES: { value: FreteModalidade; sigla: string; label: string; descricao: string }[] = [
  { value: 9, sigla: 'Sem frete', label: '9 — Sem ocorrência de frete', descricao: 'Nenhum valor de transporte na nota.' },
  { value: 0, sigla: 'CIF', label: '0 — CIF · Frete por conta do remetente', descricao: 'Emitente paga o frete. Valor soma no total da NF-e.' },
  { value: 1, sigla: 'FOB', label: '1 — FOB · Frete por conta do destinatário', descricao: 'Destinatário paga o frete fora da nota ou a cobrar.' },
  { value: 2, sigla: 'Terceiros', label: '2 — Frete por conta de terceiros', descricao: 'Transportadora contratada por terceiro.' },
  { value: 3, sigla: 'Próprio remetente', label: '3 — Transporte próprio do remetente', descricao: 'Frota própria do emitente, sem cobrança de frete.' },
  { value: 4, sigla: 'Próprio destinatário', label: '4 — Transporte próprio do destinatário', descricao: 'Cliente retira com frota própria (FOB próprio).' },
];

export function freteModalidadeLabel(mod?: number): string {
  const found = FRETE_MODALIDADES.find(m => m.value === mod);
  return found ? found.label : `${mod ?? 9} — Modalidade de frete`;
}

export interface SaleOrder {
  id: string;
  reference: string;
  customerId: string;
  sellerName: string;
  date: string;
  deliveryDate?: string;
  validUntil?: string;
  isAvulsa?: boolean;
  /** Verdadeiro até alguém clicar em "Fazer lançamento financeiro" no pedido. */
  withoutFinance?: boolean;
  items: SaleOrderItem[];
  /** Notas emitidas a partir desta venda (pedido completo + avulsas parciais). */
  nfes?: SaleOrderLinkedNfe[];
  /** Referência única enviada à API fiscal (ex.: PED-2026-0001#AV#nfa-xxx). */
  nfeReferenciaExterna?: string;
  /** Título do bloco "Produto" no PDF/impressão do pedido. */
  productSheetTitle?: string;
  /** Linhas de especificação no PDF (uma linha por parágrafo). */
  productSheetBody?: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  /** Dados de frete/transporte da NF-e (modFrete SEFAZ: 9/0 CIF/1 FOB/2/3/4). `shipping` é mantido sincronizado com `frete.valor`. */
  frete?: FreteInfo;
  paidAmount?: number;
  remainingAmount?: number;
  paymentStatus?: 'pago' | 'parcial' | 'pendente';
  withdrawalStatus?: 'aguardando' | 'parcial' | 'total';
  status: OrderStatus;
  paymentMethod?: string;
  payments: SalePayment[];
  receipts?: PaymentReceipt[];
  withdrawals?: OrderWithdrawal[];
  isBarter?: boolean;
  barterCrop?: 'Milho' | 'Soja' | 'Sorgo' | 'Outro' | string;
  barterCommodityType?: 'MILHO' | 'SOJA' | string;
  cornTons?: number;
  cornUnitValue?: number;
  cornPricePerTon?: number;
  barterEquivalentValue?: number;
  notes?: string;
  companyId?: string;
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
  nfeInfCpl?: string;
  nfePayload?: any;
  nfeRawResponse?: any;
}

export interface FiscalConfig {
  id: string;
  companyId?: string;
  apiKey: string;
  apiProvider?: 'notaas' | 'focusnfe' | 'nuvemfiscal' | 'custom';
  apiBaseUrl?: string;
  modoEmissao?: 'api_real' | 'sandbox_local';
  environment: 'sandbox' | 'production';
  cnpjEmitente: string;
  inscricaoEstadual: string;
  inscricaoMunicipal?: string;
  cnae?: string;
  razaoSocial: string;
  nomeFantasia: string;
  telefoneEmitente?: string;
  emailEmitente?: string;
  logradouroEmitente?: string;
  numeroEmitente?: string;
  complementoEmitente?: string;
  bairroEmitente?: string;
  cidadeEmitente?: string;
  ufEmitente?: string;
  cepEmitente?: string;
  ibgeEmitente?: string;
  regimeTributario: '1' | '2' | '3';
  serieNFe: string;
  proxNumeroNFe: number;
  naturezaOperacaoPadrao: string;
  cfopPadraoEstadual: string;
  cfopPadraoInterestadual: string;
  cfopTransferenciaEstadual?: string;
  cfopTransferenciaInterestadual?: string;
  aliquotaIcmsPadrao?: number;
  cstIcmsPadrao?: string;
  cstPisCofins?: string;
  aliquotaPis?: number;
  aliquotaCofins?: number;
  observacoesFiscaisPadrao?: string;
  autoEmitirAoFinalizar?: boolean;
  logoDataUrl?: string;
}

export type TransferStatus = 'EM_TRANSITO' | 'CONFERIDO_E_RECEBIDO' | 'RECEBIDO_COM_DIVERGENCIA' | 'CANCELADO';

export interface TransferItem {
  id: string;
  productId?: string;
  productName: string;
  category?: StoreItemCategory;
  quantitySent: number;
  quantityReceived?: number;
  unit: string;
  unitCost?: number;
  totalCost?: number;
  nfCompraNumber?: string;
  supplier?: string;
  conferido?: boolean;
  divergenceNotes?: string;
  cProd?: string;
  ncm?: string;
  cfop?: string;
  infAdProd?: string;
  included?: boolean;
}

export interface TransferShipment {
  id: string;
  companyId?: string;
  code: string;
  originLocation: string;
  destinationLocation: string;
  dateSent: string;
  sentBy: string;
  carrierOrDriver?: string;
  vehiclePlate?: string;
  notes?: string;
  items: TransferItem[];
  status: TransferStatus;
  receivedDate?: string;
  receivedBy?: string;
  receiverRole?: string;
  conferenceNotes?: string;
  receiverSignature?: string;
  stockIntegrated?: boolean;
  createdAt?: string;
  updatedAt?: string;
  nfeChave?: string;
  nfeNumero?: string;
  nfeSerie?: string;
  nfeXml?: string;
  nfeXmlRef?: string;
  nfeFileName?: string;
  supplierCnpj?: string;
  supplierName?: string;
}

export type View = 'dashboard' | 'inventory' | 'sales' | 'purchases' | 'milling' | 'customers' | 'transportadores' | 'transactions' | 'daily' | 'accounts' | 'orders' | 'quotes' | 'fleet' | 'yard' | 'fuel' | 'cashflow' | 'users' | 'settings' | 'fiscal' | 'fiscal_config' | 'transfers' | 'branches';
