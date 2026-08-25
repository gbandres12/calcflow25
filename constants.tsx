
import { 
  Customer, 
  InventoryItem, 
  Transaction, 
  TransactionType, 
  TransactionStatus, 
  Company, 
  FinancialAccount, 
  AccountType, 
  CostCenter, 
  User, 
  UserRole,
  Machine,
  StoreItem,
  SaleOrder,
  OrderStatus,
  FuelRecord,
  FuelPurchase,
  Category,
  FiscalConfig
} from './types';

export const DEFAULT_FISCAL_CONFIG: FiscalConfig = {
  id: 'fiscal-main-config',
  apiKey: '', // Chave obtida no portal da NotaAs (https://notaas.com.br)
  environment: 'sandbox', // 'sandbox' (Testes) ou 'production' (SEFAZ Real)
  cnpjEmitente: '10.375.218/0001-50',
  inscricaoEstadual: '15.489.201-9',
  razaoSocial: 'CALCARIOFLOW MINERACAO E INDUSTRIA LTDA',
  nomeFantasia: 'CalcárioFlow Mineração',
  regimeTributario: '1', // Simples Nacional
  serieNFe: '1',
  proxNumeroNFe: 1042,
  naturezaOperacaoPadrao: 'Venda de produção do estabelecimento',
  cfopPadraoEstadual: '5101',
  cfopPadraoInterestadual: '6101',
  aliquotaIcmsPadrao: 0,
  observacoesFiscaisPadrao: 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.',
  autoEmitirAoFinalizar: false
};

export const COMPANY_INFO: Company = {
  id: 'calcarioflow-matriz',
  name: 'CalcárioFlow Mineração & Indústria',
  code: 'MATRIZ-01',
  address: 'Rodovia Mineral BR-163, Km 42 - Distrito Industrial',
  city: 'Santarém',
  state: 'PA',
  document: '10.375.218/0001-50',
  phone: '(93) 3522-8000',
  isActive: true
};

export const INITIAL_COMPANIES: Company[] = [COMPANY_INFO];

export const INFLOW_CATEGORIES = [
  'Venda Calcário Moído Granel',
  'Venda Calcário Ensacado',
  'Venda Calcário Dolomítico',
  'Serviço de Moagem / Moagem Terceirizada',
  'Frete e Entrega',
  'Rendimento Financeiro',
  'Outras Receitas Operacionais'
];

export const OUTFLOW_CATEGORIES = [
  'Compra de Brita / Minério Bruto',
  'Combustível (Diesel S10 / S500)',
  'Manutenção de Britador e Moinho',
  'Peças de Desgaste e Telas',
  'Energia Elétrica (Alta Tensão)',
  'Salários e Encargos da Equipe',
  'Alimentação e Refeitório Pátio',
  'EPIs e Segurança do Trabalho',
  'Lubrificantes e Graxas Industriais',
  'Frete e Logística de Transporte',
  'Impostos e Taxas Minerárias (CFEM)',
  'Honorários e Serviços Técnicos',
  'Manutenção de Veículos e Pás',
  'Material de Escritório e TI',
  'Outras Despesas Operacionais'
];

export const STANDARD_CATEGORIES = [...INFLOW_CATEGORIES, ...OUTFLOW_CATEGORIES];

export const INITIAL_USERS: User[] = [
  { 
    id: 'u1', 
    name: 'Carlos Mendes (Diretor Geral)', 
    email: 'admin@calcarioflow.com.br', 
    role: UserRole.ADMIN, 
    status: 'Ativo',
    lastAccess: new Date().toISOString()
  },
  { 
    id: 'u2', 
    name: 'Eng. Roberto Albuquerque', 
    email: 'producao@calcarioflow.com.br', 
    role: UserRole.MANAGER, 
    status: 'Ativo',
    lastAccess: new Date(Date.now() - 3600000).toISOString()
  },
  { 
    id: 'u3', 
    name: 'Mariana Rocha (Comercial)', 
    email: 'vendas@calcarioflow.com.br', 
    role: UserRole.MANAGER, 
    status: 'Ativo',
    lastAccess: new Date(Date.now() - 7200000).toISOString()
  },
  { 
    id: 'u4', 
    name: 'José Balança (Operador)', 
    email: 'operador@calcarioflow.com.br', 
    role: UserRole.OPERATOR, 
    status: 'Ativo',
    lastAccess: new Date(Date.now() - 14400000).toISOString()
  }
];

export const INITIAL_COST_CENTERS: CostCenter[] = [
  { id: 'cc1', name: 'Administrativo & Diretoria', color: '#1E293B' },
  { id: 'cc2', name: 'Produção / Moinhos & Britagem', color: '#10B981' },
  { id: 'cc3', name: 'Frota, Pátio & Balança', color: '#F59E0B' },
  { id: 'cc4', name: 'Comercial & Vendas Agro', color: '#8B5CF6' },
  { id: 'cc5', name: 'Manutenção Eletromecânica', color: '#EF4444' },
  { id: 'cc6', name: 'Logística & Carregamento', color: '#0EA5E9' },
  { id: 'cc7', name: 'Tributos & CFEM Mineral', color: '#64748B' }
];

export const INITIAL_ACCOUNTS: FinancialAccount[] = [
  { 
    id: 'acc-1', 
    name: 'Banco do Brasil - Conta Movimento Agro', 
    type: AccountType.BANCO, 
    bankName: 'Banco do Brasil (001)', 
    accountNumber: 'Ag: 0451-2 / CC: 18.940-3', 
    initialBalance: 148500.00 
  },
  { 
    id: 'acc-2', 
    name: 'Sicredi - Cooperativa de Crédito', 
    type: AccountType.BANCO, 
    bankName: 'Sicredi (748)', 
    accountNumber: 'Ag: 0812 / CC: 45.210-9', 
    initialBalance: 86320.00 
  },
  { 
    id: 'acc-3', 
    name: 'Caixa Balança & Frente de Pátio', 
    type: AccountType.CAIXA, 
    bankName: 'Cofre Operacional', 
    accountNumber: 'Terminal Pátio #01', 
    initialBalance: 12450.00 
  }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  { 
    id: 'britado', 
    name: 'Calcário Britado Grosso (Matéria-prima)', 
    quantity: 480, 
    unitPrice: 42.00, 
    minStock: 100,
    unit: 'Ton',
    ncm: '2517.10.00',
    cfop: '5101',
    origem: '0',
    unidadeTributavel: 'TON'
  },
  { 
    id: 'moido', 
    name: 'Calcário Agrícola Calcítico Moído (Granel)', 
    quantity: 360, 
    unitPrice: 98.00, 
    minStock: 60,
    unit: 'Ton',
    ncm: '2517.10.00',
    cfop: '5101',
    origem: '0',
    unidadeTributavel: 'TON'
  },
  { 
    id: 'dolomitico', 
    name: 'Calcário Dolomítico Moído (Granel)', 
    quantity: 210, 
    unitPrice: 105.00, 
    minStock: 50,
    unit: 'Ton',
    ncm: '2518.10.00',
    cfop: '5101',
    origem: '0',
    unidadeTributavel: 'TON'
  },
  { 
    id: 'ensacado', 
    name: 'Calcário Filler Super Fino (Sacos 50kg)', 
    quantity: 1450, 
    unitPrice: 19.50, 
    minStock: 250,
    unit: 'Sacos',
    ncm: '2517.10.00',
    cfop: '5101',
    origem: '0',
    unidadeTributavel: 'UN'
  }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    name: 'Fazenda Planalto Agropecuária Ltda',
    document: '12.894.541/0001-88',
    email: 'compras@fazendaplanalto.agr.br',
    phone: '(93) 99182-3401',
    totalSpent: 184500.00,
    tipoPessoa: 'PJ',
    ie: '15.982.110-4',
    isentoIE: false,
    street: 'Rodovia Santarém-Cuiabá, Km 88',
    number: 'S/N',
    neighborhood: 'Zona Rural',
    city: 'Santarém',
    state: 'PA',
    zipCode: '68000-000',
    ibgeCode: '1506807'
  },
  {
    id: 'cust-2',
    name: 'Cooperativa Agroindustrial do Vale',
    document: '04.912.834/0001-20',
    email: 'insumos@coopagrovale.com.br',
    phone: '(93) 98412-9900',
    totalSpent: 92800.00,
    tipoPessoa: 'PJ',
    ie: '15.441.980-0',
    isentoIE: false,
    street: 'Av. dos Pioneiros',
    number: '1250',
    neighborhood: 'Distrito Agroindustrial',
    city: 'Itaituba',
    state: 'PA',
    zipCode: '68180-010',
    ibgeCode: '1503606'
  },
  {
    id: 'cust-3',
    name: 'Grupo Maeda Sementes e Grãos',
    document: '33.104.920/0002-14',
    email: 'suprimentos@grupomaeda.com.br',
    phone: '(93) 99233-1188',
    totalSpent: 145200.00,
    tipoPessoa: 'PJ',
    ie: '15.890.312-5',
    isentoIE: false,
    street: 'Estrada da Soja, Lote 45',
    number: '450',
    neighborhood: 'Setor de Armazéns',
    city: 'Belterra',
    state: 'PA',
    zipCode: '68143-000',
    ibgeCode: '1501451'
  },
  {
    id: 'cust-4',
    name: 'Fazenda Santa Maria (João Batista da Silva)',
    document: '482.910.332-91',
    email: 'joao.batista.agro@gmail.com',
    phone: '(93) 99104-5566',
    totalSpent: 48600.00,
    tipoPessoa: 'PRODUTOR',
    ie: '15.302.914-1',
    isentoIE: false,
    street: 'Gleba Nova Esperança, Vicinal 03',
    number: 'Km 12',
    neighborhood: 'Comunidade Rural',
    city: 'Mojui dos Campos',
    state: 'PA',
    zipCode: '68142-000',
    ibgeCode: '1504752'
  },
  {
    id: 'cust-5',
    name: 'Agrocomercial Grão Forte Distribuidora',
    document: '18.392.019/0001-72',
    email: 'pedidos@graoforteagro.com.br',
    phone: '(93) 3524-1122',
    totalSpent: 67400.00,
    tipoPessoa: 'PJ',
    ie: '15.118.402-9',
    isentoIE: false,
    street: 'Rua das Castanheiras',
    number: '310',
    neighborhood: 'Centro',
    city: 'Santarém',
    state: 'PA',
    zipCode: '68005-100',
    ibgeCode: '1506807'
  }
];

export const INITIAL_MACHINES: Machine[] = [
  {
    id: 'mach-1',
    name: 'Britador Cônico Metso Nordberg HP200',
    type: 'Britador',
    plateOrId: 'BRIT-01',
    currentHorimeter: 4820,
    status: 'Operacional',
    lastMaintenance: '2026-08-10'
  },
  {
    id: 'mach-2',
    name: 'Moinho Pendular Raymond 5R',
    type: 'Outros',
    plateOrId: 'MOINHO-01',
    currentHorimeter: 3150,
    status: 'Operacional',
    lastMaintenance: '2026-08-15'
  },
  {
    id: 'mach-3',
    name: 'Pá Carregadeira Caterpillar 938K',
    type: 'Pá Carregadeira',
    plateOrId: 'PC-CAT-02',
    currentHorimeter: 5430,
    status: 'Operacional',
    lastMaintenance: '2026-08-01'
  },
  {
    id: 'mach-4',
    name: 'Caminhão Basculante Volvo FMX 460 8x4',
    type: 'Caminhão',
    plateOrId: 'QVK-8820',
    currentHorimeter: 8940,
    status: 'Operacional',
    lastMaintenance: '2026-07-28'
  },
  {
    id: 'mach-5',
    name: 'Escavadeira Hidráulica Komatsu PC200',
    type: 'Escavadeira',
    plateOrId: 'ESC-KOM-01',
    currentHorimeter: 4210,
    status: 'Manutenção',
    lastMaintenance: '2026-08-20'
  }
];

export const INITIAL_STORE_ITEMS: StoreItem[] = [
  { id: 'store-1', name: 'Jogo de Martelos de Aço Manganês (Moinho)', category: 'Peças', quantity: 16, unit: 'Unid', minStock: 6 },
  { id: 'store-2', name: 'Telas de Peneira Vibratória 100 Mesh', category: 'Peças', quantity: 12, unit: 'Placas', minStock: 4 },
  { id: 'store-3', name: 'Graxa de Alta Pressão EP2 (Balde 20kg)', category: 'Lubrificantes', quantity: 8, unit: 'Baldes', minStock: 3 },
  { id: 'store-4', name: 'Óleo Hidráulico ISO 68 (Tambor 200L)', category: 'Lubrificantes', quantity: 3, unit: 'Tambores', minStock: 1 },
  { id: 'store-5', name: 'Correias em V Perfil B-112', category: 'Peças', quantity: 24, unit: 'Unid', minStock: 8 },
  { id: 'store-6', name: 'Kit Respiradores e Protetores Auriculares', category: 'EPI', quantity: 45, unit: 'Kits', minStock: 15 }
];

export const INITIAL_ORDERS: SaleOrder[] = [
  {
    id: 'ord-1',
    reference: 'PED-2026-0101',
    customerId: 'cust-1',
    sellerName: 'Mariana Rocha',
    date: '2026-08-22',
    deliveryDate: '2026-08-24',
    items: [
      {
        productId: 'moido',
        productCode: 'CALC-MOI',
        productName: 'Calcário Agrícola Calcítico Moído (Granel)',
        unit: 'Ton',
        quantity: 500,
        unitPrice: 100.00,
        discount: 0,
        total: 50000.00,
        ncm: '2517.10.00',
        cfop: '5101'
      }
    ],
    subtotal: 50000.00,
    discount: 0,
    shipping: 0,
    total: 50000.00,
    status: OrderStatus.FINALIZED,
    nfeStatus: 'autorizada',
    nfeNumero: '1041',
    nfeSerie: '1',
    nfeChave: '15260810375218000150550010000010411894021984',
    nfeProtocolo: '115260004928192',
    nfeEmissao: '2026-08-22T14:35:00.000Z',
    nfeNaturezaOperacao: 'Venda de produção do estabelecimento',
    receipts: [
      {
        id: 'REC-2026-0042',
        orderId: 'ord-1',
        customerId: 'cust-1',
        customerName: 'Fazenda Planalto Agropecuária Ltda',
        customerDocument: '12.894.541/0001-88',
        amount: 5000.00,
        date: '2026-08-22',
        paymentMethod: 'PIX',
        accountId: 'acc-1',
        accountName: 'Banco do Brasil - Conta Movimento Agro',
        receivedBy: 'Mariana Rocha (Comercial)',
        description: 'Entrada / Sinal de Venda - PED-2026-0101',
        type: 'ENTRADA',
        totalOrderAmount: 50000.00,
        totalPaidSoFar: 5000.00,
        remainingDebt: 45000.00,
        notes: 'Entrada referente a 10% do lote de 500 Toneladas de Calcário Moído.'
      }
    ],
    withdrawals: [
      {
        id: 'with-1',
        orderId: 'ord-1',
        date: '2026-08-23',
        driverName: 'Marcos Vinicius de Souza',
        driverDocument: '712.940.112-04',
        plateNumber: 'OBX-9821',
        truckType: 'Bitrem 9 Eixos',
        weighTicketNumber: 'TB-8941',
        quantityWithdrawn: 48.5,
        remainingBalanceQuantity: 451.5,
        operatorName: 'José Balança',
        notes: 'Carregamento liberado conforme entrada'
      },
      {
        id: 'with-2',
        orderId: 'ord-1',
        date: '2026-08-24',
        driverName: 'Claudemir Antunes Pereira',
        driverDocument: '501.229.482-19',
        plateNumber: 'QVR-3290',
        truckType: 'Carreta Caçamba 3 Eixos',
        weighTicketNumber: 'TB-8956',
        quantityWithdrawn: 34.0,
        remainingBalanceQuantity: 417.5,
        operatorName: 'José Balança',
        notes: 'Segunda viagem da Fazenda Planalto'
      }
    ],
    payments: [
      {
        id: 'pay-1',
        amount: 5000.00,
        paidAmount: 5000.00,
        date: '2026-08-22',
        status: TransactionStatus.CONFIRMADO,
        accountId: 'acc-1',
        description: 'Entrada / PIX no ato'
      },
      {
        id: 'pay-2',
        amount: 22500.00,
        paidAmount: 0,
        date: '2026-09-22',
        status: TransactionStatus.PENDENTE,
        accountId: 'acc-1',
        description: '1ª Parcela (30 dias)'
      },
      {
        id: 'pay-3',
        amount: 22500.00,
        paidAmount: 0,
        date: '2026-10-22',
        status: TransactionStatus.PENDENTE,
        accountId: 'acc-1',
        description: '2ª Parcela (60 dias)'
      }
    ],
    notes: 'Contrato Safra: Entrada de R$ 5.000 paga no ato + 2 parcelas de R$ 22.500. Retiradas parciais de calcário na balança conforme cronograma da fazenda.'
  },
  {
    id: 'ord-2',
    reference: 'PED-2026-0102',
    customerId: 'cust-3',
    sellerName: 'Mariana Rocha',
    date: '2026-08-23',
    deliveryDate: '2026-08-26',
    items: [
      {
        productId: 'dolomitico',
        productCode: 'CALC-DOL',
        productName: 'Calcário Dolomítico Moído (Granel)',
        unit: 'Ton',
        quantity: 80,
        unitPrice: 105.00,
        discount: 0,
        total: 8400.00,
        ncm: '2518.10.00',
        cfop: '5101'
      }
    ],
    subtotal: 8400.00,
    discount: 0,
    shipping: 800.00,
    total: 9200.00,
    status: OrderStatus.FINALIZED,
    nfeStatus: 'nao_emitida',
    payments: [
      {
        id: 'pay-2',
        amount: 9200.00,
        paidAmount: 9200.00,
        date: '2026-08-23',
        status: TransactionStatus.CONFIRMADO,
        accountId: 'acc-2',
        description: 'Pagamento Sicredi via Pix'
      }
    ]
  },
  {
    id: 'ord-3',
    reference: 'ORC-2026-0103',
    customerId: 'cust-2',
    sellerName: 'Mariana Rocha',
    date: '2026-08-24',
    validUntil: '2026-08-31',
    items: [
      {
        productId: 'moido',
        productCode: 'CALC-MOI',
        productName: 'Calcário Agrícola Calcítico Moído (Granel)',
        unit: 'Ton',
        quantity: 200,
        unitPrice: 95.00,
        discount: 600.00,
        total: 18400.00,
        ncm: '2517.10.00',
        cfop: '5101'
      }
    ],
    subtotal: 19000.00,
    discount: 600.00,
    shipping: 0,
    total: 18400.00,
    status: OrderStatus.BUDGET,
    nfeStatus: 'nao_emitida',
    payments: [],
    notes: 'Orçamento para safra 2026/2027 com frete por conta do cliente (FOB).'
  }
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    accountId: 'acc-1',
    costCenterId: 'cc4',
    date: '2026-08-22',
    type: TransactionType.SALE,
    status: TransactionStatus.CONFIRMADO,
    description: 'Venda Faturada - PED-2026-0101 (Fazenda Planalto - 120T)',
    category: 'Venda Calcário Moído Granel',
    amount: 12960.00,
    paidAmount: 12960.00,
    quantity: 120,
    customerId: 'cust-1',
    orderId: 'ord-1'
  },
  {
    id: 'tx-2',
    accountId: 'acc-2',
    costCenterId: 'cc4',
    date: '2026-08-23',
    type: TransactionType.SALE,
    status: TransactionStatus.CONFIRMADO,
    description: 'Venda Faturada - PED-2026-0102 (Grupo Maeda - 80T)',
    category: 'Venda Calcário Dolomítico',
    amount: 9200.00,
    paidAmount: 9200.00,
    quantity: 80,
    customerId: 'cust-3',
    orderId: 'ord-2'
  },
  {
    id: 'tx-3',
    accountId: 'acc-1',
    costCenterId: 'cc2',
    date: '2026-08-20',
    type: TransactionType.EXPENSE,
    status: TransactionStatus.CONFIRMADO,
    description: 'Energia Elétrica Industrial - Alta Tensão Equatorial',
    category: 'Energia Elétrica (Alta Tensão)',
    amount: 14820.00,
    paidAmount: 14820.00
  },
  {
    id: 'tx-4',
    accountId: 'acc-1',
    costCenterId: 'cc3',
    date: '2026-08-21',
    type: TransactionType.EXPENSE,
    status: TransactionStatus.CONFIRMADO,
    description: 'Compra de Carga Diesel S10 (5.000 Litros) - Distribuidora Ipiranga',
    category: 'Combustível (Diesel S10 / S500)',
    amount: 29500.00,
    paidAmount: 29500.00
  },
  {
    id: 'tx-5',
    accountId: 'acc-2',
    costCenterId: 'cc5',
    date: '2026-08-18',
    type: TransactionType.EXPENSE,
    status: TransactionStatus.CONFIRMADO,
    description: 'Reposição de Martelos de Aço Manganês Moinho Raymond',
    category: 'Peças de Desgaste e Telas',
    amount: 6400.00,
    paidAmount: 6400.00
  },
  {
    id: 'tx-6',
    accountId: 'acc-3',
    costCenterId: 'cc3',
    date: '2026-08-24',
    type: TransactionType.EXPENSE,
    status: TransactionStatus.CONFIRMADO,
    description: 'Alimentação da equipe de britagem e pátio',
    category: 'Alimentação e Refeitório Pátio',
    amount: 680.00,
    paidAmount: 680.00
  }
];

export const INITIAL_FUEL_PURCHASES: FuelPurchase[] = [
  {
    id: 'fp-1',
    date: '2026-08-21',
    liters: 5000,
    pricePerLiter: 5.90,
    totalCost: 29500.00,
    supplier: 'Distribuidora Ipiranga de Petróleo',
    fuelType: 'S10'
  },
  {
    id: 'fp-2',
    date: '2026-08-10',
    liters: 4000,
    pricePerLiter: 5.65,
    totalCost: 22600.00,
    supplier: 'Vibra Energia S.A.',
    fuelType: 'S500'
  }
];

export const INITIAL_FUEL_RECORDS: FuelRecord[] = [
  {
    id: 'fr-1',
    machineId: 'mach-3',
    date: '2026-08-24',
    liters: 220,
    pricePerLiter: 5.90,
    totalCost: 1298.00,
    horimeter: 5430,
    fuelType: 'S10'
  },
  {
    id: 'fr-2',
    machineId: 'mach-4',
    date: '2026-08-24',
    liters: 310,
    pricePerLiter: 5.90,
    totalCost: 1829.00,
    horimeter: 8940,
    fuelType: 'S10'
  }
];

export const INITIAL_MAINTENANCES = [
  {
    id: 'maint-1',
    machineId: 'mach-1',
    date: '2026-08-10',
    description: 'Troca de óleo do redutor e regulagem da abertura do cone',
    cost: 2400.00,
    type: 'Preventiva' as const,
    horimeter: 4800
  },
  {
    id: 'maint-2',
    machineId: 'mach-5',
    date: '2026-08-20',
    description: 'Substituição de mangueiras hidráulicas do braço escavador',
    cost: 3800.00,
    type: 'Corretiva' as const,
    horimeter: 4210
  }
];

