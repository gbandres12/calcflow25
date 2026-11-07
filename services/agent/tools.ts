import {
  Customer,
  FiscalConfig,
  FinancialAccount,
  InventoryItem,
  OrderStatus,
  SaleOrder,
  SaleOrderItem,
  Transaction,
  TransactionStatus,
  TransactionType
} from '../../types.js';
import {
  DEDUCTION_METHOD,
  PaymentKind,
  appendReceiptToOrder,
  applyPaymentToTransaction,
  applySaleStock,
  applySaleToCustomer,
  buildBudgetOrder,
  buildOpenSaleTransaction,
  buildPaymentReceipt,
  buildSaleOrder,
  formatBRL,
  listOpenInstallments,
  newReceiptId,
  reconcileReceiptsAgainstPayments,
  stockAfterSale
} from '../domain/telegramWrites.js';
import { buildOrderPdfTitle, buildSalesOrderPdf } from '../domain/salesOrderPdf.js';
import {
  applyEmitToOrder,
  consultNfeStatusOnNotaAs,
  emitNfeOnNotaAs,
  fetchDanfePdf,
  formatFreteSummary,
  nfeEnvironmentLabel,
  onlyDigits,
  parseModalidadeFrete,
  pickNfeItems,
  readFiscalConfig,
  remainingItemsForNfe,
  totalsOf,
  validateFiscalForEmit
} from '../domain/telegramNfe.js';
import { avulsaExternalRef, listOrderNfes, overlayNfeFields, upsertLinkedNfe } from '../saleNfe.js';
import { newId, nextAvulsaReference } from '../ids.js';
import { formatSuggestions, pickUnique, rankNamed } from './search.js';

export interface ErpRepo {
  getTable(companyId: string, table: string): Promise<any[]>;
  upsert(companyId: string, table: string, record: any): Promise<any>;
}

export interface AgentUser {
  id: string;
  name: string;
  role: string;
  permissions: Record<string, boolean>;
}

export interface AgentContext {
  companyId: string;
  user: AgentUser;
  repo: ErpRepo;
  /** Desliga toda escrita por variável de ambiente, para subir só com consulta. */
  allowWrites: boolean;
  today: string;
}

export type ToolDocument = {
  filename: string;
  bytes: Uint8Array;
  caption: string;
};

export type ToolOutcome =
  | { kind: 'data'; data: any; document?: ToolDocument }
  | { kind: 'confirm'; action: string; payload: any; summary: string };

const normalize = (text: string): string =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const toNumber = (value: any): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Saldo por conta na mesma fórmula do FinancialAccounts: abatimento não é caixa. */
function accountBalance(account: FinancialAccount, transactions: Transaction[]): number {
  const cashOf = (transaction: Transaction): number => {
    if (transaction.payments?.length) {
      return transaction.payments
        .filter((payment) => !payment.isDiscountOrDeduction)
        .filter((payment) => (payment.accountId || transaction.accountId) === account.id)
        .reduce((sum, payment) => sum + toNumber(payment.amount), 0);
    }
    return toNumber(transaction.paidAmount);
  };

  const settled = transactions.filter(
    (transaction) =>
      transaction.accountId === account.id &&
      (transaction.status === TransactionStatus.CONFIRMADO ||
        transaction.status === TransactionStatus.PAGO ||
        transaction.status === TransactionStatus.PARCIAL)
  );

  const totalIn = settled
    .filter((transaction) => transaction.type === TransactionType.SALE)
    .reduce((sum, transaction) => sum + cashOf(transaction), 0);

  const totalOut = settled
    .filter((transaction) => transaction.type !== TransactionType.SALE)
    .reduce((sum, transaction) => sum + cashOf(transaction), 0);

  return toNumber(account.initialBalance) + totalIn - totalOut;
}

function requirePermission(ctx: AgentContext, permission: 'financial' | 'orders' | 'inventory') {
  if (ctx.user.permissions?.[permission] === false) {
    throw new Error(`Seu acesso no ERP não inclui ${permission === 'financial' ? 'o Financeiro' : 'esse módulo'}.`);
  }
}

function requireWrites(ctx: AgentContext) {
  if (!ctx.allowWrites) {
    throw new Error('O agente está em modo somente consulta. Peça ao administrador para liberar os lançamentos.');
  }
}

function requireFiscal(ctx: AgentContext) {
  if (ctx.user.permissions?.fiscal === false) {
    throw new Error('Seu acesso no ERP não inclui a emissão fiscal.');
  }
  if (ctx.user.permissions?.fiscal !== true) {
    requirePermission(ctx, 'orders');
  }
}

function hasProcessingNfe(order: SaleOrder): boolean {
  if (order.nfeStatus === 'processando') return true;
  return listOrderNfes(order).some((nfe) => nfe.nfeStatus === 'processando');
}

export interface ConsultativeNfeOverrides {
  naturezaOperacao?: string;
  cfop?: string;
  formaPagamento?: string;
  modalidadeFrete?: string | number;
  valorFrete?: number;
  placaVeiculo?: string;
  ufPlaca?: string;
  motoristaNome?: string;
  motoristaCpf?: string;
  transportadoraNome?: string;
  transportadoraDocumento?: string;
  ticketPesagem?: string;
  observacao?: string;
}

function inspectCustomerFiscal(customer: Customer) {
  const docClean = onlyDigits(customer.document);
  const pendenciasObrigatorias: string[] = [];
  const avisosFiscais: string[] = [];

  if (!docClean || (docClean.length !== 11 && docClean.length !== 14)) {
    pendenciasObrigatorias.push('CPF (11 dígitos) ou CNPJ (14 dígitos) válido é obrigatório.');
  }
  if (!customer.name || customer.name.trim().length < 2) {
    pendenciasObrigatorias.push('Nome ou razão social do cliente é obrigatório.');
  }

  const ieDigits = onlyDigits(customer.ie);
  if (!customer.isentoIE && !ieDigits) {
    avisosFiscais.push('Sem Inscrição Estadual (IE) — vai como não contribuinte (se for Produtor Rural ou PJ contribuinte, informe a IE).');
  }
  if (!customer.street?.trim()) {
    avisosFiscais.push('Sem logradouro — vai "Zona Rural / Rodovia".');
  }
  if (!customer.city?.trim() || !customer.state?.trim()) {
    avisosFiscais.push('Cidade/UF incompletas — assume o município da usina.');
  }
  if (onlyDigits(customer.zipCode).length !== 8) {
    avisosFiscais.push('Sem CEP de 8 dígitos — usa o CEP padrão da usina.');
  }

  return {
    id: customer.id,
    nome: customer.name,
    documento: customer.document || '',
    tipoPessoa: docClean.length === 14 ? 'PJ' : docClean.length === 11 ? 'PF' : 'Indefinido',
    ie: customer.ie || '',
    isentoIE: Boolean(customer.isentoIE),
    telefone: customer.phone || '',
    email: customer.email || '',
    endereco: {
      logradouro: customer.street || '',
      numero: customer.number || '',
      bairro: customer.neighborhood || '',
      cidade: customer.city || '',
      uf: customer.state || '',
      cep: customer.zipCode || '',
      codigoIbge: customer.ibgeCode || ''
    },
    aptoParaEmitir: pendenciasObrigatorias.length === 0,
    pendenciasObrigatorias,
    avisosFiscais
  };
}

function applyItemFiscalOverrides(items: SaleOrderItem[], cfopOverride?: string): SaleOrderItem[] {
  const cleanCfop = onlyDigits(cfopOverride);
  if (cleanCfop.length !== 4) return items;
  return items.map((item) => ({ ...item, cfop: cleanCfop }));
}

function buildConsultativeOrderOverrides(
  baseOrder: Partial<SaleOrder>,
  overrides: ConsultativeNfeOverrides,
  config: FiscalConfig | null
): {
  shipping: number;
  frete: SaleOrder['frete'];
  paymentMethod?: string;
  nfeNaturezaOperacao?: string;
  nfeInfCpl?: string;
} {
  const hasExplicitFreightValue = overrides.valorFrete !== undefined && overrides.valorFrete !== null;
  const shipping = hasExplicitFreightValue
    ? Math.max(0, toNumber(overrides.valorFrete))
    : Math.max(0, toNumber(baseOrder.frete?.valor ?? baseOrder.shipping ?? 0));

  const hasAnyTransportInput = Boolean(
    overrides.modalidadeFrete !== undefined ||
      hasExplicitFreightValue ||
      overrides.placaVeiculo ||
      overrides.motoristaNome ||
      overrides.transportadoraNome ||
      overrides.ticketPesagem ||
      baseOrder.frete
  );

  const modalidade =
    overrides.modalidadeFrete !== undefined && overrides.modalidadeFrete !== null && String(overrides.modalidadeFrete).trim() !== ''
      ? parseModalidadeFrete(overrides.modalidadeFrete, shipping > 0)
      : (baseOrder.frete?.modalidade ?? (shipping > 0 ? 0 : 9));

  const anyBaseFrete = baseOrder.frete as any;
  const placa = String(overrides.placaVeiculo || baseOrder.frete?.veiculo?.placa || anyBaseFrete?.placa || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const uf = String(overrides.ufPlaca || baseOrder.frete?.veiculo?.uf || anyBaseFrete?.uf || config?.ufEmitente || 'PA')
    .trim()
    .toUpperCase();
  const motorista = String(overrides.motoristaNome || anyBaseFrete?.motorista || '').trim();
  const transpNome = String(
    overrides.transportadoraNome || baseOrder.frete?.transportadora?.nome || anyBaseFrete?.transportadoraNome || ''
  ).trim();
  const transpDoc = onlyDigits(
    overrides.transportadoraDocumento ||
      overrides.motoristaCpf ||
      baseOrder.frete?.transportadora?.documento ||
      anyBaseFrete?.transportadoraDocumento
  );
  const ticketPesagem = String(overrides.ticketPesagem || anyBaseFrete?.ticketPesagem || '').trim();

  const frete: SaleOrder['frete'] = hasAnyTransportInput
    ? ({
        modalidade,
        valor: shipping,
        veiculo: placa ? { placa, uf } : undefined,
        transportadora:
          transpNome || transpDoc
            ? {
                ...(transpNome ? { nome: transpNome } : {}),
                ...(transpDoc ? { documento: transpDoc } : {})
              }
            : undefined,
        ...(motorista ? { motorista } : {}),
        ...(ticketPesagem ? { ticketPesagem } : {})
      } as SaleOrder['frete'])
    : undefined;

  const paymentMethod = overrides.formaPagamento || baseOrder.paymentMethod || undefined;
  const nfeNaturezaOperacao =
    (overrides.naturezaOperacao || baseOrder.nfeNaturezaOperacao || config?.naturezaOperacaoPadrao || '').trim() || undefined;
  const nfeInfCpl =
    (overrides.observacao !== undefined ? String(overrides.observacao || '').trim() : baseOrder.nfeInfCpl || baseOrder.notes || '') ||
    undefined;

  return {
    shipping,
    frete,
    paymentMethod,
    nfeNaturezaOperacao,
    nfeInfCpl
  };
}

function nfeProposalSummary(params: {
  title: string;
  customer: Customer;
  items: SaleOrderItem[];
  total: number;
  shipping?: number;
  frete?: SaleOrder['frete'];
  paymentMethod?: string;
  naturezaOperacao?: string;
  observacao?: string;
  config: FiscalConfig | null;
  warnings: string[];
  extra?: string[];
}): string {
  const ieLabel = params.customer.isentoIE
    ? 'Isento'
    : params.customer.ie
      ? params.customer.ie
      : 'Não informada (Não contribuinte)';
  const addressParts = [
    params.customer.street ? `${params.customer.street}${params.customer.number ? `, ${params.customer.number}` : ''}` : null,
    params.customer.neighborhood || null,
    params.customer.city ? `${params.customer.city}${params.customer.state ? `/${params.customer.state}` : ''}` : null,
    params.customer.zipCode ? `CEP ${params.customer.zipCode}` : null
  ].filter(Boolean);

  return [
    params.title,
    '',
    `Cliente: ${params.customer.name}`,
    params.customer.document ? `CPF/CNPJ: ${params.customer.document} · IE: ${ieLabel}` : `IE: ${ieLabel}`,
    addressParts.length ? `Endereço: ${addressParts.join(' · ')}` : null,
    params.naturezaOperacao ? `Natureza: ${params.naturezaOperacao}` : null,
    ...params.items.map(
      (item) =>
        `• ${item.quantity} ${item.unit} de ${item.productName} a ${formatBRL(item.unitPrice)} — ${formatBRL(item.total)}${
          item.cfop ? ` (CFOP ${item.cfop})` : ''
        }`
    ),
    params.shipping && params.shipping > 0 ? `Frete na nota: ${formatBRL(params.shipping)}` : null,
    `Total da NF-e: ${formatBRL(params.total)}`,
    `Frete / Transporte: ${formatFreteSummary(params.frete, params.shipping)}`,
    params.paymentMethod ? `Pagamento: ${params.paymentMethod}` : null,
    params.observacao ? `Observações na nota: ${params.observacao}` : null,
    `Ambiente: ${nfeEnvironmentLabel(params.config)}`,
    ...(params.warnings.length ? ['Avisos fiscais:', ...params.warnings.map((warning) => `• ${warning}`)] : []),
    ...(params.extra || []),
    '',
    'Quer ajustar quantidade, preço, placa, frete, IE, endereço ou observação? É só me dizer aqui no chat que eu atualizo o rascunho.',
    'Se estiver tudo certo, toque em Emitir NF-e. A nota vai para a SEFAZ e não tem como desfazer pelo chat.'
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function resolveCustomer(
  customers: Customer[],
  term: string
): { customer: Customer | null; suggestions: Customer[] } {
  const query = String(term || '').trim();
  if (!query) return { customer: null, suggestions: [] };

  const digits = query.replace(/\D/g, '');
  if (digits.length >= 11) {
    const byDocument = customers.find((customer) => String(customer.document || '').replace(/\D/g, '') === digits);
    if (byDocument) return { customer: byDocument, suggestions: [byDocument] };
  }

  const ranked = rankNamed(customers, query, (customer) => customer.name);
  return {
    customer: pickUnique(ranked),
    suggestions: ranked.slice(0, 5).map((entry) => entry.item)
  };
}

function missingCustomerError(term: string, suggestions: Customer[]): Error {
  const names = suggestions.map((customer) => customer.name).filter(Boolean);
  if (names.length) {
    return new Error(
      `Não achei um cliente único para "${term}". Encontrei: ${names.join('; ')}. Confirme o nome como está no cadastro.`
    );
  }
  return new Error(`Não encontrei o cliente ${term}. Cadastre-o no ERP ou me passe o nome exatamente como está no cadastro.`);
}

function resolveProduct(inventory: InventoryItem[], term: string): InventoryItem | null {
  const query = String(term || '').trim();
  if (!query) return null;
  const exactId = inventory.find((item) => normalize(item.id) === normalize(query));
  if (exactId) return exactId;
  const exactName = inventory.find((item) => normalize(item.name) === normalize(query));
  if (exactName) return exactName;
  const ranked = rankNamed(inventory, query, (item) => `${item.name} ${item.id} ${item.code || ''}`);
  return pickUnique(ranked);
}

function parseOrderLines(inventory: InventoryItem[], lines: any[]) {
  if (!Array.isArray(lines) || !lines.length) throw new Error('Informe ao menos um produto com quantidade.');

  return lines.map((line: any) => {
    const term = String(line.produto || line.productId || '');
    const product = resolveProduct(inventory, term);
    if (!product) {
      const ranked = rankNamed(inventory, term, (item) => `${item.name} ${item.id} ${item.code || ''}`);
      const names = formatSuggestions(ranked, (item) => item.name);
      if (names.length) {
        throw new Error(`Produto "${term}" não é único. Encontrei: ${names.join('; ')}. Qual deles?`);
      }
      throw new Error(`Produto "${term}" não existe no estoque.`);
    }
    return {
      productId: product.id,
      quantity: toNumber(line.quantidade),
      unitPrice: line.precoUnitario != null ? toNumber(line.precoUnitario) : undefined
    };
  });
}

function findOrder(orders: SaleOrder[], reference: string): SaleOrder | null {
  const query = normalize(reference);
  if (!query) return null;
  return (
    orders.find((order) => normalize(order.reference) === query) ||
    orders.find((order) => normalize(order.reference).includes(query)) ||
    orders.find((order) => order.id === reference) ||
    null
  );
}

interface ResolveInstallmentArgs {
  parcelaId?: string;
  pedidoRef?: string;
  clienteNome?: string;
}

/**
 * Descobre em qual parcela lançar. Com mais de uma em aberto, devolve erro
 * listando as opções: quem escolhe é a pessoa no chat, não o modelo.
 */
async function resolveInstallment(
  ctx: AgentContext,
  args: ResolveInstallmentArgs
): Promise<{ transaction: Transaction; order: SaleOrder | null; transactions: Transaction[]; orders: SaleOrder[] }> {
  const [transactions, orders, customers] = await Promise.all([
    ctx.repo.getTable(ctx.companyId, 'transactions') as Promise<Transaction[]>,
    ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
    ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>
  ]);

  if (args.parcelaId) {
    const transaction = transactions.find((item) => item.id === args.parcelaId);
    if (!transaction) throw new Error('Parcela não encontrada. Liste as parcelas em aberto de novo.');
    const order = transaction.orderId ? orders.find((item) => item.id === transaction.orderId) || null : null;
    return { transaction, order, transactions, orders };
  }

  const order = args.pedidoRef ? findOrder(orders, args.pedidoRef) : null;
  if (args.pedidoRef && !order) throw new Error(`Não encontrei o pedido ${args.pedidoRef}.`);

  const resolvedCustomer = args.clienteNome ? resolveCustomer(customers, args.clienteNome) : { customer: null, suggestions: [] };
  const customer = resolvedCustomer.customer;
  if (args.clienteNome && !customer) throw missingCustomerError(args.clienteNome, resolvedCustomer.suggestions);

  const open = listOpenInstallments(transactions, {
    orderId: order?.id,
    customerId: customer?.id
  });

  if (!open.length) throw new Error('Não há parcela em aberto para esse filtro.');
  if (open.length > 1) {
    const options = open
      .map((item) => `${item.transactionId}: ${item.description} — saldo ${formatBRL(item.outstanding)}`)
      .join('; ');
    throw new Error(
      `Há ${open.length} parcelas em aberto. Pergunte ao usuário em qual aplicar e chame de novo com o parcelaId. Opções: ${options}`
    );
  }

  const transaction = transactions.find((item) => item.id === open[0].transactionId)!;
  return { transaction, order: order || null, transactions, orders };
}

async function proposePayment(
  ctx: AgentContext,
  kind: PaymentKind,
  args: ResolveInstallmentArgs & { valor: any; formaPagamento?: string; motivo?: string }
): Promise<ToolOutcome> {
  requirePermission(ctx, 'financial');
  requireWrites(ctx);

  const amount = toNumber(args.valor);
  if (amount <= 0) throw new Error('Informe o valor do lançamento.');

  const { transaction, order } = await resolveInstallment(ctx, args);
  const outstanding = Math.max(0, toNumber(transaction.amount) - toNumber(transaction.paidAmount));
  if (amount > outstanding + 0.01) {
    throw new Error(
      `O valor de ${formatBRL(amount)} passa do saldo da parcela (${formatBRL(outstanding)}). Confirme o valor com o usuário.`
    );
  }

  const isDeduction = kind === 'ABATIMENTO';
  const summary = [
    `${isDeduction ? 'Abatimento' : 'Recebimento'} a confirmar`,
    `Parcela: ${transaction.description}`,
    order ? `Pedido: ${order.reference}` : null,
    `Valor: ${formatBRL(amount)}`,
    `Saldo da parcela depois: ${formatBRL(Math.max(0, outstanding - amount))}`,
    `Forma: ${isDeduction ? DEDUCTION_METHOD : args.formaPagamento || 'PIX'}`,
    args.motivo ? `Motivo: ${args.motivo}` : null
  ]
    .filter(Boolean)
    .join('\n');

  return {
    kind: 'confirm',
    action: isDeduction ? 'registrar_abatimento' : 'registrar_recebimento',
    payload: {
      transactionId: transaction.id,
      orderId: order?.id || transaction.orderId || null,
      amount,
      kind,
      paymentMethod: args.formaPagamento,
      notes: args.motivo
    },
    summary
  };
}

export async function executeTool(name: string, rawArgs: any, ctx: AgentContext): Promise<ToolOutcome> {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};

  switch (name) {
    case 'consultar_caixa': {
      requirePermission(ctx, 'financial');
      const [accounts, transactions] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'financial_accounts') as Promise<FinancialAccount[]>,
        ctx.repo.getTable(ctx.companyId, 'transactions') as Promise<Transaction[]>
      ]);

      const contas = accounts.map((account) => ({
        id: account.id,
        nome: account.name,
        tipo: account.type,
        saldo: accountBalance(account, transactions)
      }));

      return {
        kind: 'data',
        data: { contas, saldoTotal: contas.reduce((sum, account) => sum + account.saldo, 0) }
      };
    }

    case 'listar_recebiveis_em_aberto': {
      requirePermission(ctx, 'financial');
      const [transactions, orders, customers] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'transactions') as Promise<Transaction[]>,
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>
      ]);

      const order = args.pedidoRef ? findOrder(orders, args.pedidoRef) : null;
      const resolvedCustomer = args.clienteNome ? resolveCustomer(customers, args.clienteNome) : { customer: null, suggestions: [] };
      const customer = resolvedCustomer.customer;
      if (args.clienteNome && !customer) {
        return {
          kind: 'data',
          data: {
            total: 0,
            quantidade: 0,
            parcelas: [],
            sugestoes: resolvedCustomer.suggestions.map((item) => item.name)
          }
        };
      }
      const open = listOpenInstallments(transactions, { orderId: order?.id, customerId: customer?.id });

      return {
        kind: 'data',
        data: {
          total: open.reduce((sum, item) => sum + item.outstanding, 0),
          quantidade: open.length,
          parcelas: open.slice(0, 20).map((item) => ({
            parcelaId: item.transactionId,
            descricao: item.description,
            vencimento: item.dueDate,
            saldo: item.outstanding,
            cliente: customers.find((c) => c.id === item.customerId)?.name,
            pedido: orders.find((o) => o.id === item.orderId)?.reference
          }))
        }
      };
    }

    case 'resumo_do_dia': {
      requirePermission(ctx, 'financial');
      const date = String(args.data || ctx.today);
      const transactions = (await ctx.repo.getTable(ctx.companyId, 'transactions')) as Transaction[];

      let entradas = 0;
      let saidas = 0;
      let abatimentos = 0;

      for (const transaction of transactions) {
        for (const payment of transaction.payments || []) {
          if (String(payment.paymentDate || '').slice(0, 10) !== date) continue;
          const value = toNumber(payment.amount);
          if (payment.isDiscountOrDeduction) abatimentos += value;
          else if (transaction.type === TransactionType.SALE) entradas += value;
          else saidas += value;
        }
      }

      return {
        kind: 'data',
        data: { data: date, entradas, saidas, abatimentos, resultado: entradas - saidas }
      };
    }

    case 'buscar_cliente': {
      const customers = (await ctx.repo.getTable(ctx.companyId, 'customers')) as Customer[];
      const resolved = resolveCustomer(customers, String(args.termo || ''));
      const customer = resolved.customer;
      if (!customer) {
        return {
          kind: 'data',
          data: {
            encontrado: false,
            sugestoes: resolved.suggestions.map((item) => ({
              nome: item.name,
              documento: item.document,
              cidade: item.city
            }))
          }
        };
      }

      const [orders, transactions] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'transactions') as Promise<Transaction[]>
      ]);

      const open = listOpenInstallments(transactions, { customerId: customer.id });
      const fiscalInfo = inspectCustomerFiscal(customer);

      return {
        kind: 'data',
        data: {
          encontrado: true,
          id: customer.id,
          nome: customer.name,
          documento: customer.document,
          ie: customer.ie || '',
          isentoIE: Boolean(customer.isentoIE),
          telefone: customer.phone,
          email: customer.email || '',
          logradouro: customer.street || '',
          numero: customer.number || '',
          bairro: customer.neighborhood || '',
          cidade: customer.city,
          uf: customer.state || '',
          cep: customer.zipCode || '',
          codigoIbge: customer.ibgeCode || '',
          aptoParaEmitirNfe: fiscalInfo.aptoParaEmitir,
          pendenciasFiscais: fiscalInfo.pendenciasObrigatorias,
          avisosFiscais: fiscalInfo.avisosFiscais,
          saldoDevedor: open.reduce((sum, item) => sum + item.outstanding, 0),
          pedidos: orders
            .filter((order) => order.customerId === customer.id)
            .slice(-8)
            .map((order) => {
              const remaining = remainingItemsForNfe(order);
              return {
                referencia: order.reference,
                data: order.date,
                total: order.total,
                status: order.status,
                nfeStatus: order.nfeStatus || 'nao_emitida',
                quantidadePendenteNfe: remaining.reduce((sum, item) => sum + item.quantity, 0)
              };
            })
        }
      };
    }

    case 'diagnosticar_emissao_nfe': {
      requireFiscal(ctx);
      const [orders, customers, inventory, fiscalRows] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
        ctx.repo.getTable(ctx.companyId, 'inventory') as Promise<InventoryItem[]>,
        ctx.repo.getTable(ctx.companyId, 'fiscal_config')
      ]);

      const config = readFiscalConfig(fiscalRows);
      const selectedOrder = args.pedidoRef ? findOrder(orders, String(args.pedidoRef)) : null;

      let resolvedCustomer: { customer: Customer | null; suggestions: Customer[] } = { customer: null, suggestions: [] };
      if (selectedOrder) {
        const orderCustomer = customers.find((item) => item.id === selectedOrder.customerId) || null;
        resolvedCustomer = { customer: orderCustomer, suggestions: orderCustomer ? [orderCustomer] : [] };
      } else if (args.clienteNome) {
        resolvedCustomer = resolveCustomer(customers, String(args.clienteNome));
      }

      const customer = resolvedCustomer.customer;
      const customerDiagnostic = customer ? inspectCustomerFiscal(customer) : null;

      const formatOrderForNfe = (order: SaleOrder) => {
        const remaining = remainingItemsForNfe(order);
        const withdrawals = (order.withdrawals || []).map((w) => {
          const anyW = w as any;
          return {
            ticket: w.weighTicketNumber || anyW.ticketNumber || '',
            data: w.date || '',
            pesoLiquido: w.netWeight ?? w.quantityWithdrawn,
            placa: w.plateNumber || w.truckPlate || anyW.vehiclePlate || '',
            motorista: w.driverName || '',
            transportadora: w.transporterName || anyW.carrierName || '',
            notaVinculada: w.nfeNumero || anyW.invoiceNumber || ''
          };
        });
        return {
          referencia: order.reference,
          data: order.date,
          status: order.status,
          totalPedido: order.total,
          formaPagamento: order.paymentMethod || 'A combinar',
          nfeStatus: order.nfeStatus || 'nao_emitida',
          freteAtual: order.frete || null,
          observacaoAtual: order.nfeInfCpl || order.notes || '',
          quantidadePendenteTotal: remaining.reduce((sum, item) => sum + item.quantity, 0),
          itensPendentes: remaining.map((item) => ({
            produto: item.productName,
            quantidadePendente: item.quantity,
            unidade: item.unit || 'TON',
            precoUnitario: item.unitPrice,
            subtotal: item.total,
            cfop: item.cfop || '',
            ncm: item.ncm || '25171000'
          })),
          carregamentosBalanca: withdrawals,
          notasEmitidas: listOrderNfes(order).map((nfe) => ({
            tipo: nfe.tipo,
            status: nfe.nfeStatus,
            numero: nfe.nfeNumero,
            total: nfe.total
          }))
        };
      };

      const candidateOrders = customer
        ? orders
            .filter((order) => order.customerId === customer.id && order.status !== OrderStatus.CANCELLED)
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
            .slice(0, 8)
            .map(formatOrderForNfe)
        : [];

      const roteiroConsultivo: string[] = [];
      if (!customer) {
        if (resolvedCustomer.suggestions.length) {
          roteiroConsultivo.push(
            `Confirme com o usuário qual destes clientes é o destinatário: ${resolvedCustomer.suggestions
              .map((item) => item.name)
              .join('; ')}.`
          );
        } else {
          roteiroConsultivo.push(
            'Cliente não encontrado. Pergunte o nome completo, CPF/CNPJ, IE (ou se é isento/não contribuinte), endereço e cidade/UF para cadastrar com salvar_cliente_fiscal.'
          );
        }
      } else {
        if (!customerDiagnostic?.aptoParaEmitir) {
          roteiroConsultivo.push(
            `Bloqueio fiscal no cadastro de ${customer.name}: ${customerDiagnostic?.pendenciasObrigatorias.join(
              ' '
            )} Peça o dado ao usuário e salve com salvar_cliente_fiscal.`
          );
        }
        if (customerDiagnostic?.avisosFiscais.length) {
          roteiroConsultivo.push(
            `Avisos no cadastro de ${customer.name}: ${customerDiagnostic.avisosFiscais.join(
              ' '
            )} Pergunte se quer informar IE/endereço antes de emitir ou seguir assim.`
          );
        }
      }

      if (selectedOrder) {
        const formatted = formatOrderForNfe(selectedOrder);
        if (formatted.quantidadePendenteTotal <= 0) {
          roteiroConsultivo.push(
            `O pedido ${selectedOrder.reference} já teve toda a quantidade faturada. Pergunte se deseja emitir uma NF-e avulsa solta.`
          );
        } else {
          roteiroConsultivo.push(
            `Confirme se vai faturar o saldo total do pedido ${selectedOrder.reference} (${formatted.quantidadePendenteTotal} ton) ou uma quantidade parcial (por carregamento/caminhão).`
          );
        }
        if (formatted.carregamentosBalanca.length) {
          roteiroConsultivo.push(
            'Existem tickets de balança no pedido: ofereça usar o peso líquido, placa e motorista de um carregamento específico na nota.'
          );
        }
      } else if (candidateOrders.length) {
        roteiroConsultivo.push(
          'O cliente tem pedidos recentes listados em pedidosDoCliente. Pergunte se a NF-e é de algum desses pedidos ou se é uma NF-e avulsa sem pedido.'
        );
      } else if (customer) {
        roteiroConsultivo.push(
          'O cliente não tem pedidos em aberto. Pergunte qual produto, quantidade (ton) e preço unitário deseja para montar a NF-e avulsa.'
        );
      }

      roteiroConsultivo.push(
        'Pergunte se deseja informar placa do caminhão, motorista, modalidade/valor do frete (CIF, FOB ou sem frete), forma de pagamento e alguma observação na nota (ex: número de ticket, fazenda, inscrição de produtor).'
      );

      return {
        kind: 'data',
        data: {
          apiKeyConfigurada: Boolean(String(config?.apiKey || '').trim()),
          ambiente: nfeEnvironmentLabel(config),
          naturezaOperacaoPadrao: config?.naturezaOperacaoPadrao || 'Venda de producao do estabelecimento',
          cfopEstadualPadrao: config?.cfopPadraoEstadual || '5101',
          cfopInterestadualPadrao: config?.cfopPadraoInterestadual || '6101',
          cliente: customerDiagnostic
            ? { encontrado: true, ...customerDiagnostic }
            : {
                encontrado: false,
                termoBuscado: args.clienteNome || null,
                sugestoes: resolvedCustomer.suggestions.map((item) => ({
                  id: item.id,
                  nome: item.name,
                  documento: item.document,
                  cidade: item.city,
                  uf: item.state
                }))
              },
          pedidoSelecionado: selectedOrder ? formatOrderForNfe(selectedOrder) : null,
          pedidosDoCliente: candidateOrders,
          produtosDisponiveis: inventory.map((item) => ({
            id: item.id,
            nome: item.name,
            precoUnitario: item.unitPrice,
            unidade: item.unit || 'TON',
            ncm: item.ncm || '25171000',
            cfop: item.cfop || ''
          })),
          roteiroConsultivo
        }
      };
    }

    case 'salvar_cliente_fiscal': {
      requireFiscal(ctx);
      requireWrites(ctx);

      const customers = (await ctx.repo.getTable(ctx.companyId, 'customers')) as Customer[];
      let existing: Customer | null = null;
      if (args.clienteId) {
        existing = customers.find((item) => item.id === String(args.clienteId)) || null;
      }
      if (!existing && args.documento) {
        const cleanDoc = onlyDigits(args.documento);
        if (cleanDoc.length >= 11) {
          existing = customers.find((item) => onlyDigits(item.document) === cleanDoc) || null;
        }
      }
      if (!existing && args.nome) {
        const resolved = resolveCustomer(customers, String(args.nome));
        existing = resolved.customer;
      }

      const name = String(args.nome || existing?.name || '').trim();
      if (!name || name.length < 2) {
        throw new Error('Informe o nome completo ou razão social do cliente.');
      }

      const rawDoc = args.documento !== undefined ? String(args.documento).trim() : existing?.document || '';
      const docDigits = onlyDigits(rawDoc);
      if (rawDoc && docDigits.length !== 11 && docDigits.length !== 14) {
        throw new Error('O documento precisa ser um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
      }

      const ieRaw = args.ie !== undefined ? String(args.ie || '').trim() : existing?.ie || '';
      const isentoIE =
        args.isentoIE !== undefined
          ? Boolean(args.isentoIE)
          : normalize(ieRaw) === 'isento' || Boolean(existing?.isentoIE);
      const cleanIe = normalize(ieRaw) === 'isento' ? '' : ieRaw;

      const updated: Customer = {
        ...(existing || {
          id: newId('cust'),
          name,
          document: rawDoc,
          phone: '',
          email: '',
          city: 'Santarém',
          totalSpent: 0,
          lastOrderDate: ''
        }),
        name,
        document: rawDoc || existing?.document || '',
        ie: cleanIe || undefined,
        isentoIE,
        phone: args.telefone !== undefined ? String(args.telefone || '').trim() : existing?.phone || '',
        email: args.email !== undefined ? String(args.email || '').trim() : existing?.email || '',
        street: args.logradouro !== undefined ? String(args.logradouro || '').trim() : existing?.street,
        number: args.numero !== undefined ? String(args.numero || '').trim() : existing?.number,
        neighborhood: args.bairro !== undefined ? String(args.bairro || '').trim() : existing?.neighborhood,
        city: args.cidade !== undefined ? String(args.cidade || '').trim() : existing?.city || 'Santarém',
        state: args.uf !== undefined ? String(args.uf || '').trim().toUpperCase() : existing?.state || 'PA',
        zipCode: args.cep !== undefined ? String(args.cep || '').trim() : existing?.zipCode,
        ibgeCode: args.codigoIbge !== undefined ? onlyDigits(args.codigoIbge) : existing?.ibgeCode,
        companyId: ctx.companyId
      };

      await ctx.repo.upsert(ctx.companyId, 'customers', updated);
      const fiscalCheck = inspectCustomerFiscal(updated);

      return {
        kind: 'data',
        data: {
          acao: existing ? 'atualizado' : 'cadastrado',
          cliente: fiscalCheck
        }
      };
    }

    case 'consultar_estoque': {
      const inventory = (await ctx.repo.getTable(ctx.companyId, 'inventory')) as InventoryItem[];
      const term = String(args.termo || '').trim();
      const ranked = term ? rankNamed(inventory, term, (item) => `${item.name} ${item.id} ${item.code || ''}`) : [];
      const items = term ? ranked.map((entry) => entry.item) : inventory;

      return {
        kind: 'data',
        data: {
          produtos: items.map((item) => ({
            id: item.id,
            nome: item.name,
            quantidade: item.quantity,
            unidade: item.unit || 'Ton',
            precoUnitario: item.unitPrice,
            estoqueMinimo: item.minStock,
            critico: toNumber(item.quantity) <= toNumber(item.minStock)
          }))
        }
      };
    }

    case 'listar_vendas': {
      const [orders, customers] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>
      ]);

      const resolvedCustomer = args.clienteNome
        ? resolveCustomer(customers, args.clienteNome)
        : { customer: null, suggestions: [] as Customer[] };
      if (args.clienteNome && !resolvedCustomer.customer) {
        return {
          kind: 'data',
          data: {
            pedidos: [],
            sugestoes: resolvedCustomer.suggestions.map((item) => item.name)
          }
        };
      }
      const customer = resolvedCustomer.customer;
      const limit = Math.min(Number(args.limite) || 10, 25);

      const filtered = orders
        .filter((order) => (customer ? order.customerId === customer.id : true))
        .filter((order) => (args.status ? normalize(order.status) === normalize(args.status) : true))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, limit);

      return {
        kind: 'data',
        data: {
          pedidos: filtered.map((order) => ({
            referencia: order.reference,
            cliente: customers.find((item) => item.id === order.customerId)?.name,
            data: order.date,
            total: order.total,
            status: order.status,
            nfeStatus: order.nfeStatus || 'nao_emitida',
            recebido: (order.receipts || []).reduce((sum, receipt) => sum + toNumber(receipt?.amount), 0)
          }))
        }
      };
    }

    case 'status_nfe_pedido': {
      const [orders, fiscalRows] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'fiscal_config')
      ]);
      let order = findOrder(orders, String(args.pedidoRef || ''));
      if (!order) return { kind: 'data', data: { encontrado: false } };

      const config = readFiscalConfig(fiscalRows);
      if (config && hasProcessingNfe(order)) {
        const nfes = listOrderNfes(order);
        let changed = false;
        for (const nfe of nfes) {
          if (nfe.nfeStatus === 'processando' && nfe.nfeId) {
            const consulted = await consultNfeStatusOnNotaAs(nfe.nfeId, config, nfe.nfeNumero || '', nfe.nfeSerie || '1');
            if (consulted && consulted.nfeStatus && consulted.nfeStatus !== 'processando') {
              order = upsertLinkedNfe(order, {
                ...nfe,
                nfeStatus: consulted.nfeStatus,
                nfeNumero: consulted.nfeNumero || nfe.nfeNumero,
                nfeChave: consulted.nfeChave || nfe.nfeChave,
                nfeProtocolo: consulted.nfeProtocolo || nfe.nfeProtocolo,
                nfeDanfeUrl: consulted.nfeDanfeUrl || nfe.nfeDanfeUrl,
                nfeXmlUrl: consulted.nfeXmlUrl || nfe.nfeXmlUrl,
                nfeErro: consulted.nfeErro || nfe.nfeErro
              });
              changed = true;
            }
          }
        }
        if (changed && ctx.allowWrites) {
          await ctx.repo.upsert(ctx.companyId, 'sales_orders', { ...order, origin: 'telegram' });
        }
      }

      const remaining = remainingItemsForNfe(order);

      return {
        kind: 'data',
        data: {
          encontrado: true,
          referencia: order.reference,
          nfeStatus: order.nfeStatus || 'nao_emitida',
          numero: order.nfeNumero,
          chave: order.nfeChave,
          erro: order.nfeErro,
          notas: listOrderNfes(order).map((nfe) => ({
            id: nfe.id,
            nfeId: nfe.nfeId,
            tipo: nfe.tipo,
            status: nfe.nfeStatus,
            numero: nfe.nfeNumero,
            chave: nfe.nfeChave,
            total: nfe.total
          })),
          quantidadePendente: remaining.reduce((sum, item) => sum + item.quantity, 0)
        }
      };
    }

    case 'enviar_danfe_nfe': {
      requireFiscal(ctx);
      const [orders, customers, fiscalRows] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
        ctx.repo.getTable(ctx.companyId, 'fiscal_config')
      ]);

      const order = findOrder(orders, String(args.pedidoRef || ''));
      if (!order) throw new Error(`Não encontrei o pedido ${args.pedidoRef || ''}.`);

      const config = readFiscalConfig(fiscalRows);
      if (!config || !String(config.apiKey || '').trim()) {
        throw new Error('Cadastre a Project Key da NotaAs nas Configurações Fiscais.');
      }

      const nfes = listOrderNfes(order).filter((nfe) => nfe.nfeStatus === 'autorizada' && nfe.nfeId);
      const targetNfe = args.numeroNota
        ? nfes.find((nfe) => String(nfe.nfeNumero || '') === String(args.numeroNota).trim())
        : nfes.at(-1);

      const nfeId = targetNfe?.nfeId || (order.nfeStatus === 'autorizada' ? order.nfeId : undefined);
      const nfeNumero = targetNfe?.nfeNumero || order.nfeNumero || 'nfe';

      if (!nfeId) {
        throw new Error(`O pedido ${order.reference} ainda não tem NF-e autorizada com DANFE disponível.`);
      }

      const bytes = await fetchDanfePdf(nfeId, config);
      if (!bytes) {
        throw new Error('Não consegui baixar o DANFE na NotaAs agora. Tente novamente em instantes.');
      }

      const customer = customers.find((item) => item.id === order.customerId);
      return {
        kind: 'data',
        data: {
          enviado: true,
          referencia: order.reference,
          numeroNota: nfeNumero,
          chave: targetNfe?.nfeChave || order.nfeChave
        },
        document: {
          filename: `DANFE-${nfeNumero}.pdf`,
          bytes,
          caption: `DANFE NF-e ${nfeNumero} · ${customer?.name || order.reference}`
        }
      };
    }

    case 'conferir_lancamentos': {
      requirePermission(ctx, 'financial');
      const [orders, transactions] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'transactions') as Promise<Transaction[]>
      ]);

      const issues = reconcileReceiptsAgainstPayments(orders, transactions);
      return {
        kind: 'data',
        data: {
          divergencias: issues.length,
          detalhes: issues.slice(0, 15)
        }
      };
    }

    case 'registrar_abatimento':
      return proposePayment(ctx, 'ABATIMENTO', args as any);

    case 'registrar_recebimento':
      return proposePayment(ctx, 'PAGAMENTO', args as any);

    case 'criar_orcamento': {
      requirePermission(ctx, 'orders');
      requireWrites(ctx);

      const [customers, inventory, orders] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
        ctx.repo.getTable(ctx.companyId, 'inventory') as Promise<InventoryItem[]>,
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>
      ]);

      const resolvedCustomer = resolveCustomer(customers, String(args.clienteNome || ''));
      const customer = resolvedCustomer.customer;
      if (!customer) throw missingCustomerError(String(args.clienteNome || ''), resolvedCustomer.suggestions);

      const items = parseOrderLines(inventory, args.itens);

      // Monta só para validar e mostrar o total; o pedido real nasce na confirmação.
      const preview = buildBudgetOrder({
        companyId: ctx.companyId,
        customer,
        items,
        inventory,
        existingOrders: orders,
        sellerName: ctx.user.name,
        notes: args.observacao
      });

      const summary = [
        'Novo orçamento a confirmar',
        `Cliente: ${customer.name}`,
        ...preview.items.map(
          (item) => `• ${item.quantity} ${item.unit} de ${item.productName} a ${formatBRL(item.unitPrice)}`
        ),
        `Total: ${formatBRL(preview.total)}`,
        'Entra como Orçamento: não baixa estoque nem gera financeiro até ser confirmado no ERP.'
      ].join('\n');

      return {
        kind: 'confirm',
        action: 'criar_orcamento',
        payload: {
          customerId: customer.id,
          items,
          notes: args.observacao || null
        },
        summary
      };
    }

    case 'criar_pedido_venda': {
      requirePermission(ctx, 'orders');
      requireWrites(ctx);

      const [customers, inventory, orders, accounts] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
        ctx.repo.getTable(ctx.companyId, 'inventory') as Promise<InventoryItem[]>,
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'financial_accounts') as Promise<FinancialAccount[]>
      ]);

      const resolvedCustomer = resolveCustomer(customers, String(args.clienteNome || ''));
      const customer = resolvedCustomer.customer;
      if (!customer) throw missingCustomerError(String(args.clienteNome || ''), resolvedCustomer.suggestions);

      const items = parseOrderLines(inventory, args.itens);
      const accountId = accounts[0]?.id || 'acc-1';
      const preview = buildSaleOrder({
        companyId: ctx.companyId,
        customer,
        items,
        inventory,
        existingOrders: orders,
        sellerName: ctx.user.name,
        notes: args.observacao,
        accountId,
        paymentMethod: args.formaPagamento
      });

      const summary = [
        'Confira o PEDIDO DE VENDA antes de gravar:',
        '',
        `Cliente: ${customer.name}`,
        customer.document ? `Documento: ${customer.document}` : null,
        customer.city ? `Cidade: ${customer.city}${customer.state ? `/${customer.state}` : ''}` : null,
        ...preview.items.map((item) => {
          const remaining = stockAfterSale(inventory, preview.items, item.productId);
          return [
            `Produto: ${item.productName}`,
            `Quantidade: ${item.quantity} ${item.unit} x ${formatBRL(item.unitPrice)}`,
            `Subtotal: ${formatBRL(item.total)}`,
            `Estoque depois: ${remaining} ${item.unit}`
          ].join('\n');
        }),
        `Total: ${formatBRL(preview.total)}`,
        `Pagamento: ${preview.paymentMethod || 'A combinar'} (parcela em aberto no financeiro)`,
        `Vendedor: ${preview.sellerName}`,
        '',
        'Se estiver certo, toque em Confirmar. Vou gravar o pedido e te mandar o PDF para encaminhar no WhatsApp.'
      ]
        .filter((line) => line !== null)
        .join('\n');

      return {
        kind: 'confirm',
        action: 'criar_pedido_venda',
        payload: {
          customerId: customer.id,
          items,
          notes: args.observacao || null,
          paymentMethod: args.formaPagamento || null,
          accountId
        },
        summary
      };
    }

    case 'emitir_nfe_pedido': {
      requireFiscal(ctx);
      requireWrites(ctx);

      const [orders, customers, fiscalRows] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
        ctx.repo.getTable(ctx.companyId, 'fiscal_config')
      ]);

      const order = findOrder(orders, String(args.pedidoRef || ''));
      if (!order) throw new Error(`Não encontrei o pedido ${args.pedidoRef || ''}.`);
      if (order.status === OrderStatus.BUDGET) {
        throw new Error(`O ${order.reference} ainda é orçamento. Confirme a venda antes de emitir a NF-e.`);
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new Error(`O ${order.reference} está cancelado. Não emito NF-e dele.`);
      }
      if (hasProcessingNfe(order)) {
        throw new Error(`O ${order.reference} já tem uma NF-e em processamento na SEFAZ. Espere autorizar ou rejeitar.`);
      }

      const customer = customers.find((item) => item.id === order.customerId);
      const rawItems = Array.isArray(args.itens) && args.itens.length ? pickNfeItems(order, args.itens) : remainingItemsForNfe(order);
      const items = applyItemFiscalOverrides(rawItems, args.cfop);
      if (!items.length) {
        throw new Error(`O ${order.reference} já está faturado. Para outra nota, use nota avulsa.`);
      }

      const config = readFiscalConfig(fiscalRows);
      if (!String(config?.apiKey || '').trim()) {
        throw new Error('Cadastre a Project Key da NotaAs nas Configurações Fiscais antes de emitir pelo Telegram.');
      }

      const consultative = buildConsultativeOrderOverrides(order, args, config);
      const totals = totalsOf(items, consultative.shipping);
      const previewOrder: SaleOrder = {
        ...order,
        items,
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        total: totals.total,
        frete: consultative.frete,
        paymentMethod: consultative.paymentMethod || order.paymentMethod,
        nfeNaturezaOperacao: consultative.nfeNaturezaOperacao,
        nfeInfCpl: consultative.nfeInfCpl
      };
      const validation = validateFiscalForEmit(previewOrder, customer);
      if (!validation.valid) throw new Error(validation.errors.join(' '));

      const isPartial = Array.isArray(args.itens) && args.itens.length > 0;

      return {
        kind: 'confirm',
        action: 'emitir_nfe_pedido',
        payload: {
          orderId: order.id,
          items,
          shipping: totals.shipping,
          frete: consultative.frete || null,
          paymentMethod: consultative.paymentMethod || null,
          naturezaOperacao: consultative.nfeNaturezaOperacao || null,
          notes: consultative.nfeInfCpl || null
        },
        summary: nfeProposalSummary({
          title: `NF-e do pedido ${order.reference}`,
          customer: customer!,
          items,
          total: totals.total,
          shipping: totals.shipping,
          frete: consultative.frete,
          paymentMethod: consultative.paymentMethod || order.paymentMethod,
          naturezaOperacao: consultative.nfeNaturezaOperacao,
          observacao: consultative.nfeInfCpl,
          config,
          warnings: validation.warnings,
          extra: isPartial ? ['Emissão com quantidade/itens ajustados conforme combinado no chat.'] : undefined
        })
      };
    }

    case 'emitir_nfe_avulsa': {
      requireFiscal(ctx);
      requireWrites(ctx);

      const [orders, customers, inventory, fiscalRows] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
        ctx.repo.getTable(ctx.companyId, 'inventory') as Promise<InventoryItem[]>,
        ctx.repo.getTable(ctx.companyId, 'fiscal_config')
      ]);

      const config = readFiscalConfig(fiscalRows);
      if (!String(config?.apiKey || '').trim()) {
        throw new Error('Cadastre a Project Key da NotaAs nas Configurações Fiscais antes de emitir pelo Telegram.');
      }

      if (args.pedidoRef) {
        const order = findOrder(orders, String(args.pedidoRef));
        if (!order) throw new Error(`Não encontrei o pedido ${args.pedidoRef}.`);
        if (order.status === OrderStatus.CANCELLED) {
          throw new Error(`O ${order.reference} está cancelado. Não emito NF-e dele.`);
        }
        if (hasProcessingNfe(order)) {
          throw new Error(`O ${order.reference} já tem uma NF-e em processamento na SEFAZ. Espere autorizar ou rejeitar.`);
        }

        const customer = customers.find((item) => item.id === order.customerId);
        const rawItems = pickNfeItems(order, args.itens);
        const items = applyItemFiscalOverrides(rawItems, args.cfop);
        if (!items.length) {
          throw new Error(`Não restou quantidade para faturar no ${order.reference}.`);
        }

        const consultative = buildConsultativeOrderOverrides({ ...order, shipping: 0 }, args, config);
        const totals = totalsOf(items, consultative.shipping);
        const previewOrder: SaleOrder = {
          ...order,
          items,
          subtotal: totals.subtotal,
          shipping: totals.shipping,
          total: totals.total,
          frete: consultative.frete,
          paymentMethod: consultative.paymentMethod || order.paymentMethod,
          nfeNaturezaOperacao: consultative.nfeNaturezaOperacao,
          nfeInfCpl: consultative.nfeInfCpl,
          isAvulsa: true
        };
        const validation = validateFiscalForEmit(previewOrder, customer);
        if (!validation.valid) throw new Error(validation.errors.join(' '));

        return {
          kind: 'confirm',
          action: 'emitir_nfe_avulsa',
          payload: {
            orderId: order.id,
            items,
            shipping: totals.shipping,
            frete: consultative.frete || null,
            paymentMethod: consultative.paymentMethod || null,
            naturezaOperacao: consultative.nfeNaturezaOperacao || null,
            notes: consultative.nfeInfCpl || null,
            standalone: false
          },
          summary: nfeProposalSummary({
            title: `NF-e avulsa do pedido ${order.reference}`,
            customer: customer!,
            items,
            total: totals.total,
            shipping: totals.shipping,
            frete: consultative.frete,
            paymentMethod: consultative.paymentMethod || order.paymentMethod,
            naturezaOperacao: consultative.nfeNaturezaOperacao,
            observacao: consultative.nfeInfCpl,
            config,
            warnings: validation.warnings,
            extra: ['Essa nota é parcial: abate do saldo fiscal do pedido e permite emitir outras notas depois.']
          })
        };
      }

      const resolvedCustomer = resolveCustomer(customers, String(args.clienteNome || ''));
      const customer = resolvedCustomer.customer;
      if (!customer) throw missingCustomerError(String(args.clienteNome || ''), resolvedCustomer.suggestions);

      const lines = parseOrderLines(inventory, args.itens);
      const preview = buildSaleOrder({
        companyId: ctx.companyId,
        customer,
        items: lines,
        inventory,
        existingOrders: orders,
        sellerName: ctx.user.name,
        notes: args.observacao,
        paymentMethod: args.formaPagamento
      });
      const items = applyItemFiscalOverrides(preview.items, args.cfop);
      const consultative = buildConsultativeOrderOverrides(preview, args, config);
      const totals = totalsOf(items, consultative.shipping);
      const validation = validateFiscalForEmit(
        {
          ...preview,
          items,
          subtotal: totals.subtotal,
          shipping: totals.shipping,
          total: totals.total,
          frete: consultative.frete,
          nfeNaturezaOperacao: consultative.nfeNaturezaOperacao,
          nfeInfCpl: consultative.nfeInfCpl,
          isAvulsa: true
        },
        customer
      );
      if (!validation.valid) throw new Error(validation.errors.join(' '));

      return {
        kind: 'confirm',
        action: 'emitir_nfe_avulsa',
        payload: {
          customerId: customer.id,
          items,
          shipping: totals.shipping,
          frete: consultative.frete || null,
          paymentMethod: consultative.paymentMethod || null,
          naturezaOperacao: consultative.nfeNaturezaOperacao || null,
          notes: consultative.nfeInfCpl || null,
          standalone: true
        },
        summary: nfeProposalSummary({
          title: 'NF-e avulsa (sem pedido de venda)',
          customer,
          items,
          total: totals.total,
          shipping: totals.shipping,
          frete: consultative.frete,
          paymentMethod: consultative.paymentMethod,
          naturezaOperacao: consultative.nfeNaturezaOperacao,
          observacao: consultative.nfeInfCpl,
          config,
          warnings: validation.warnings,
          extra: ['Não baixa estoque nem abre parcela. Só emite a nota.']
        })
      };
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

/** Executa de verdade, depois do Confirmar no chat. */
export async function commitAction(
  action: string,
  payload: any,
  ctx: AgentContext
): Promise<{
  message: string;
  records: { table: string; id: string }[];
  document?: { filename: string; bytes: Uint8Array; caption: string };
}> {
  requireWrites(ctx);

  if (action === 'registrar_abatimento' || action === 'registrar_recebimento') {
    requirePermission(ctx, 'financial');

    const [transactions, orders, customers, accounts] = await Promise.all([
      ctx.repo.getTable(ctx.companyId, 'transactions') as Promise<Transaction[]>,
      ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
      ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
      ctx.repo.getTable(ctx.companyId, 'financial_accounts') as Promise<FinancialAccount[]>
    ]);

    const transaction = transactions.find((item) => item.id === payload.transactionId);
    if (!transaction) throw new Error('Parcela não encontrada. Nada foi lançado.');

    const order = payload.orderId ? orders.find((item) => item.id === payload.orderId) || null : null;
    const customer = customers.find((item) => item.id === (order?.customerId || transaction.customerId)) || null;
    const accountId = transaction.accountId || accounts[0]?.id || 'acc-1';
    const account = accounts.find((item) => item.id === accountId);
    const receiptId = newReceiptId();
    const kind: PaymentKind = payload.kind === 'ABATIMENTO' ? 'ABATIMENTO' : 'PAGAMENTO';

    const updatedTransaction = applyPaymentToTransaction(transaction, {
      amount: payload.amount,
      kind,
      date: ctx.today,
      accountId,
      paymentMethod: payload.paymentMethod,
      notes: payload.notes,
      receiptId,
      requestedBy: ctx.user.name
    });

    const records: { table: string; id: string }[] = [];
    await ctx.repo.upsert(ctx.companyId, 'transactions', { ...updatedTransaction, origin: 'telegram' });
    records.push({ table: 'transactions', id: updatedTransaction.id });

    if (order) {
      const receipt = buildPaymentReceipt({
        order,
        customer,
        amount: payload.amount,
        kind,
        date: ctx.today,
        accountId,
        accountName: account?.name,
        paymentMethod: payload.paymentMethod,
        notes: payload.notes,
        receivedBy: ctx.user.name,
        receiptId
      });
      const updatedOrder = appendReceiptToOrder(order, receipt);
      await ctx.repo.upsert(ctx.companyId, 'sales_orders', { ...updatedOrder, origin: 'telegram' });
      records.push({ table: 'sales_orders', id: updatedOrder.id });
    }

    const remaining = Math.max(0, toNumber(updatedTransaction.amount) - toNumber(updatedTransaction.paidAmount));
    return {
      message: `${kind === 'ABATIMENTO' ? 'Abatimento' : 'Recebimento'} de ${formatBRL(
        payload.amount
      )} lançado em "${transaction.description}". Saldo da parcela: ${formatBRL(remaining)}.`,
      records
    };
  }

  if (action === 'criar_orcamento') {
    requirePermission(ctx, 'orders');

    const [customers, inventory, orders] = await Promise.all([
      ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
      ctx.repo.getTable(ctx.companyId, 'inventory') as Promise<InventoryItem[]>,
      ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>
    ]);

    const customer = customers.find((item) => item.id === payload.customerId);
    if (!customer) throw new Error('Cliente não encontrado. Nada foi criado.');

    const order = buildBudgetOrder({
      companyId: ctx.companyId,
      customer,
      items: payload.items,
      inventory,
      existingOrders: orders,
      sellerName: ctx.user.name,
      notes: payload.notes || undefined,
      date: ctx.today
    });

    await ctx.repo.upsert(ctx.companyId, 'sales_orders', { ...order, origin: 'telegram' });

    return {
      message: `Orçamento ${order.reference} criado para ${customer.name}, total ${formatBRL(
        order.total
      )}. Confirme a venda no ERP para baixar estoque e gerar o financeiro.`,
      records: [{ table: 'sales_orders', id: order.id }]
    };
  }

  if (action === 'criar_pedido_venda') {
    requirePermission(ctx, 'orders');

    const [customers, inventory, orders, accounts, fiscalRows] = await Promise.all([
      ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
      ctx.repo.getTable(ctx.companyId, 'inventory') as Promise<InventoryItem[]>,
      ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
      ctx.repo.getTable(ctx.companyId, 'financial_accounts') as Promise<FinancialAccount[]>,
      ctx.repo.getTable(ctx.companyId, 'fiscal_config')
    ]);

    const customer = customers.find((item) => item.id === payload.customerId);
    if (!customer) throw new Error('Cliente não encontrado. Nada foi criado.');

    const accountId = payload.accountId || accounts[0]?.id || 'acc-1';
    const order = buildSaleOrder({
      companyId: ctx.companyId,
      customer,
      items: payload.items,
      inventory,
      existingOrders: orders,
      sellerName: ctx.user.name,
      notes: payload.notes || undefined,
      date: ctx.today,
      accountId,
      paymentMethod: payload.paymentMethod || undefined
    });

    const nextInventory = applySaleStock(inventory, order.items);
    const transaction = buildOpenSaleTransaction(order, accountId, ctx.today);
    const nextCustomer = applySaleToCustomer(customer, order);
    const records: { table: string; id: string }[] = [];

    await ctx.repo.upsert(ctx.companyId, 'sales_orders', { ...order, origin: 'telegram' });
    records.push({ table: 'sales_orders', id: order.id });

    await ctx.repo.upsert(ctx.companyId, 'transactions', { ...transaction, origin: 'telegram' });
    records.push({ table: 'transactions', id: transaction.id });

    await ctx.repo.upsert(ctx.companyId, 'customers', nextCustomer);
    records.push({ table: 'customers', id: nextCustomer.id });

    for (const product of nextInventory) {
      const original = inventory.find((item) => item.id === product.id);
      if (original && original.quantity !== product.quantity) {
        await ctx.repo.upsert(ctx.companyId, 'inventory', product);
        records.push({ table: 'inventory', id: product.id });
      }
    }

    const fiscal = Array.isArray(fiscalRows) ? fiscalRows[0] : null;
    let document: { filename: string; bytes: Uint8Array; caption: string } | undefined;
    try {
      const bytes = await buildSalesOrderPdf({
        order,
        customer: nextCustomer,
        brand: fiscal,
        printedAt: new Date().toLocaleString('pt-BR'),
        companyName: fiscal?.razaoSocial || fiscal?.nomeFantasia || 'CBA Mineração',
        companyDocument: fiscal?.cnpjEmitente,
        companyPhone: fiscal?.telefoneEmitente,
        companyCity:
          fiscal?.cidadeEmitente && fiscal?.ufEmitente
            ? `${fiscal.cidadeEmitente} – ${fiscal.ufEmitente}`
            : undefined
      });
      document = {
        filename: `${buildOrderPdfTitle(order, nextCustomer)}.pdf`,
        bytes,
        caption: `Pedido ${order.reference} · ${customer.name} · ${formatBRL(order.total)}\nBaixe e encaminhe no WhatsApp.`
      };
    } catch (error: any) {
      console.warn('[TELEGRAM] Falha ao gerar PDF do pedido:', error?.message);
    }

    return {
      message: [
        `Pedido ${order.reference} gravado para ${customer.name}.`,
        `Total ${formatBRL(order.total)}. Estoque e financeiro atualizados.`,
        document ? 'O PDF vai em seguida, para você baixar e mandar no WhatsApp.' : 'O pedido está no ERP; o PDF não saiu agora.'
      ].join(' '),
      records,
      document
    };
  }

  if (action === 'emitir_nfe_pedido' || action === 'emitir_nfe_avulsa') {
    requireFiscal(ctx);

    const [orders, customers, fiscalRows] = await Promise.all([
      ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
      ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
      ctx.repo.getTable(ctx.companyId, 'fiscal_config')
    ]);

    const config = readFiscalConfig(fiscalRows);
    if (!config || !String(config.apiKey || '').trim()) {
      throw new Error('Cadastre a Project Key da NotaAs nas Configurações Fiscais. Nada foi emitido.');
    }

    const standalone = Boolean(payload.standalone);
    let order: SaleOrder;
    let customer: Customer | undefined;
    let items: SaleOrderItem[] = payload.items || [];
    const tipo: 'pedido' | 'avulsa' = action === 'emitir_nfe_pedido' ? 'pedido' : 'avulsa';
    const shippingOverride =
      payload.shipping !== undefined && payload.shipping !== null ? Math.max(0, toNumber(payload.shipping)) : undefined;

    if (standalone) {
      customer = customers.find((item) => item.id === payload.customerId);
      if (!customer) throw new Error('Cliente não encontrado. Nada foi emitido.');
      if (!items.length) throw new Error('A nota avulsa precisa de itens.');
      const totals = totalsOf(items, shippingOverride ?? 0);
      order = {
        id: newId('ord'),
        reference: nextAvulsaReference(orders),
        customerId: customer.id,
        sellerName: ctx.user.name,
        date: ctx.today,
        isAvulsa: true,
        items,
        subtotal: totals.subtotal,
        discount: 0,
        shipping: totals.shipping,
        total: totals.total,
        status: OrderStatus.FINALIZED,
        paymentMethod: payload.paymentMethod || 'Outros',
        payments: [],
        notes: payload.notes || undefined,
        frete: payload.frete || undefined,
        nfeNaturezaOperacao: payload.naturezaOperacao || undefined,
        nfeInfCpl: payload.notes || undefined,
        companyId: ctx.companyId,
        nfeReferenciaExterna: undefined
      };
    } else {
      order = orders.find((item) => item.id === payload.orderId) as SaleOrder;
      if (!order) throw new Error('Pedido não encontrado. Nada foi emitido.');
      if (hasProcessingNfe(order)) {
        throw new Error(`O ${order.reference} já tem uma NF-e em processamento. Nada foi emitido de novo.`);
      }
      customer = customers.find((item) => item.id === order.customerId);
      const remaining = remainingItemsForNfe(order);
      if (!remaining.length) throw new Error(`O ${order.reference} já está faturado. Nada foi emitido.`);
      items = items.length ? items : remaining;
    }

    if (!customer) throw new Error('Cliente do pedido não encontrado. Nada foi emitido.');

    const shippingForEmit = shippingOverride !== undefined ? shippingOverride : tipo === 'pedido' ? order.shipping : 0;
    const totals = totalsOf(items, shippingForEmit);
    const linkedId = tipo === 'avulsa' ? `nfa-${Date.now().toString(36)}` : `nfp-${Date.now().toString(36)}`;
    const emitOrder: SaleOrder = {
      ...order,
      items,
      subtotal: totals.subtotal,
      discount: 0,
      shipping: totals.shipping,
      total: totals.total,
      frete: payload.frete || order.frete,
      paymentMethod: payload.paymentMethod || order.paymentMethod,
      nfeNaturezaOperacao: payload.naturezaOperacao || order.nfeNaturezaOperacao,
      nfeInfCpl: payload.notes !== undefined && payload.notes !== null ? payload.notes : order.nfeInfCpl,
      isAvulsa: tipo === 'avulsa',
      nfeReferenciaExterna: tipo === 'avulsa' ? avulsaExternalRef(order.reference, linkedId) : order.reference
    };

    const result = await emitNfeOnNotaAs({ order: emitOrder, customer, config });
    const orderWithFiscalExtras: SaleOrder = {
      ...order,
      ...(payload.frete ? { frete: payload.frete } : {}),
      ...(payload.notes ? { nfeInfCpl: payload.notes } : {}),
      ...(payload.naturezaOperacao ? { nfeNaturezaOperacao: payload.naturezaOperacao } : {})
    };
    let updatedOrder = applyEmitToOrder({ order: orderWithFiscalExtras, items, tipo, result, linkedId });
    if (standalone) {
      const linked = listOrderNfes(updatedOrder).at(-1);
      if (linked) updatedOrder = { ...overlayNfeFields(updatedOrder, linked), isAvulsa: true };
    }
    await ctx.repo.upsert(ctx.companyId, 'sales_orders', { ...updatedOrder, origin: 'telegram' });

    if (result.success && config.id) {
      await ctx.repo.upsert(ctx.companyId, 'fiscal_config', {
        ...config,
        proxNumeroNFe: (Number(config.proxNumeroNFe) || 1042) + 1
      });
    }

    if (!result.success) {
      throw new Error(result.nfeErro || 'A SEFAZ rejeitou a NF-e. Nada autorizado.');
    }

    let document: { filename: string; bytes: Uint8Array; caption: string } | undefined;
    if (result.nfeStatus === 'autorizada' && result.nfeId) {
      try {
        const bytes = await fetchDanfePdf(result.nfeId, config);
        if (bytes) {
          const numero = result.nfeNumero || 'nfe';
          document = {
            filename: `DANFE-${numero}.pdf`,
            bytes,
            caption: `DANFE NF-e ${numero} · ${customer.name} · ${formatBRL(totals.total)}`
          };
        }
      } catch (error: any) {
        console.warn('[TELEGRAM] Falha ao baixar DANFE:', error?.message);
      }
    }

    const numero = result.nfeNumero ? `nº ${result.nfeNumero}` : '';
    const statusText =
      result.nfeStatus === 'autorizada'
        ? `autorizada ${numero}`.trim()
        : result.nfeStatus === 'processando'
          ? 'enviada e ainda processando na SEFAZ'
          : result.nfeStatus;
    return {
      message: [
        `NF-e ${statusText} para ${customer.name}.`,
        standalone ? `Registro ${updatedOrder.reference}.` : `Pedido ${order.reference}.`,
        result.nfeChave ? `Chave ${result.nfeChave}.` : null,
        document
          ? 'O DANFE vai em seguida.'
          : result.nfeStatus === 'autorizada'
            ? 'A nota está no ERP; o DANFE não saiu agora (peça /danfe ' + updatedOrder.reference + ').'
            : 'Acompanhe pelo status da nota neste chat ou no ERP.'
      ]
        .filter(Boolean)
        .join(' '),
      records: [{ table: 'sales_orders', id: updatedOrder.id }],
      document
    };
  }

  throw new Error(`Ação desconhecida: ${action}`);
}

export const READ_ONLY_TOOLS = [
  'consultar_caixa',
  'listar_recebiveis_em_aberto',
  'resumo_do_dia',
  'buscar_cliente',
  'diagnosticar_emissao_nfe',
  'consultar_estoque',
  'listar_vendas',
  'status_nfe_pedido',
  'enviar_danfe_nfe',
  'conferir_lancamentos'
];

export const WRITE_TOOLS = [
  'salvar_cliente_fiscal',
  'registrar_abatimento',
  'registrar_recebimento',
  'criar_orcamento',
  'criar_pedido_venda',
  'emitir_nfe_pedido',
  'emitir_nfe_avulsa'
];

const nfeConsultativeProperties = {
  naturezaOperacao: {
    type: 'STRING',
    description: 'Natureza da operação na NF-e (ex: Venda de producao do estabelecimento, Remessa para entrega futura).'
  },
  cfop: {
    type: 'STRING',
    description: 'CFOP de 4 dígitos para sobrescrever nos itens (ex: 5101 estadual, 6101 interestadual, 5922, 5116).'
  },
  formaPagamento: {
    type: 'STRING',
    description: 'PIX, Boleto, A prazo, Transferência, Dinheiro ou Sem pagamento.'
  },
  modalidadeFrete: {
    type: 'STRING',
    description: 'CIF (0 - por conta do emitente), FOB (1 - por conta do destinatário), Sem frete (9), Terceiros (2) ou Próprio destinatário (4).'
  },
  valorFrete: {
    type: 'NUMBER',
    description: 'Valor do frete em R$ para destacar na NF-e (se CIF).'
  },
  placaVeiculo: {
    type: 'STRING',
    description: 'Placa do caminhão/veículo (ex: QVA1B23 ou ABC1234).'
  },
  ufPlaca: {
    type: 'STRING',
    description: 'UF da placa do veículo (ex: PA, MT).'
  },
  motoristaNome: {
    type: 'STRING',
    description: 'Nome do motorista que retirou/transporta a carga.'
  },
  motoristaCpf: {
    type: 'STRING',
    description: 'CPF do motorista (opcional).'
  },
  transportadoraNome: {
    type: 'STRING',
    description: 'Nome/razão social da transportadora (se houver).'
  },
  transportadoraDocumento: {
    type: 'STRING',
    description: 'CNPJ/CPF da transportadora (se houver).'
  },
  ticketPesagem: {
    type: 'STRING',
    description: 'Número do ticket de balança/pesagem para sair nas informações complementares da nota.'
  },
  observacao: {
    type: 'STRING',
    description: 'Observações / informações complementares da NF-e (ex: fazenda, matrícula, contrato, produtor rural).'
  }
};

/** Declarações no formato de function calling do Gemini. */
export const toolDeclarations = [
  {
    name: 'consultar_caixa',
    description: 'Saldo atual de cada conta financeira (banco, caixa, carteira) e o saldo total da empresa.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'listar_recebiveis_em_aberto',
    description:
      'Parcelas de venda com saldo em aberto. Use antes de qualquer abatimento ou recebimento para obter o parcelaId.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteNome: { type: 'STRING', description: 'Nome ou CPF/CNPJ do cliente.' },
        pedidoRef: { type: 'STRING', description: 'Referência do pedido, por exemplo PED-2026-0012.' }
      }
    }
  },
  {
    name: 'resumo_do_dia',
    description: 'Entradas, saídas e abatimentos liquidados numa data (padrão: hoje).',
    parameters: {
      type: 'OBJECT',
      properties: { data: { type: 'STRING', description: 'Data no formato AAAA-MM-DD.' } }
    }
  },
  {
    name: 'buscar_cliente',
    description:
      'Localiza cliente por nome parcial ou documento, retornando também dados fiscais (CPF/CNPJ, IE, endereço, pendências para NF-e) e últimos pedidos.',
    parameters: {
      type: 'OBJECT',
      properties: { termo: { type: 'STRING', description: 'Nome ou documento do cliente.' } },
      required: ['termo']
    }
  },
  {
    name: 'diagnosticar_emissao_nfe',
    description:
      'SEMPRE chame no início de uma conversa de emissão de NF-e. Diagnostica cadastro fiscal do cliente (CPF/CNPJ, IE, endereço), pedidos do cliente com saldo a faturar, tickets de balança/carregamentos, produtos disponíveis e devolve um roteiroConsultivo do que perguntar ao usuário.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteNome: { type: 'STRING', description: 'Nome parcial ou CPF/CNPJ do cliente.' },
        pedidoRef: { type: 'STRING', description: 'Referência do pedido, se o usuário já informou (ex: PED-2026-0012).' }
      }
    }
  },
  {
    name: 'salvar_cliente_fiscal',
    description:
      'Cadastra um cliente novo ou atualiza os dados fiscais de um cliente existente (CPF/CNPJ, Inscrição Estadual/IE, isentoIE, logradouro, número, bairro, cidade, UF, CEP, código IBGE, telefone, email) diretamente pelo chat durante a emissão consultiva da NF-e.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId: { type: 'STRING', description: 'ID do cliente existente, se já localizado.' },
        nome: { type: 'STRING', description: 'Nome completo ou razão social do cliente.' },
        documento: { type: 'STRING', description: 'CPF (11 dígitos) ou CNPJ (14 dígitos).' },
        ie: { type: 'STRING', description: 'Inscrição Estadual (IE) ou "ISENTO".' },
        isentoIE: { type: 'BOOLEAN', description: 'True se for explicitamente isento de IE.' },
        logradouro: { type: 'STRING', description: 'Rua, rodovia, ramal ou fazenda.' },
        numero: { type: 'STRING', description: 'Número ou KM (ou SN).' },
        bairro: { type: 'STRING', description: 'Bairro, comunidade ou Zona Rural.' },
        cidade: { type: 'STRING', description: 'Município (ex: Santarém).' },
        uf: { type: 'STRING', description: 'Sigla do estado (ex: PA).' },
        cep: { type: 'STRING', description: 'CEP com 8 dígitos.' },
        codigoIbge: { type: 'STRING', description: 'Código IBGE do município (7 dígitos), se informado.' },
        telefone: { type: 'STRING' },
        email: { type: 'STRING' }
      },
      required: ['nome']
    }
  },
  {
    name: 'consultar_estoque',
    description: 'Quantidade, preço e estoque mínimo dos produtos.',
    parameters: {
      type: 'OBJECT',
      properties: { termo: { type: 'STRING', description: 'Filtro pelo nome do produto.' } }
    }
  },
  {
    name: 'listar_vendas',
    description: 'Pedidos de venda mais recentes, com total e quanto já foi recebido.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteNome: { type: 'STRING' },
        status: { type: 'STRING', description: 'Orçamento, Venda Confirmada ou Cancelado.' },
        limite: { type: 'NUMBER' }
      }
    }
  },
  {
    name: 'status_nfe_pedido',
    description:
      'Situação fiscal das NF-e de um pedido (consulta a SEFAZ/NotaAs em tempo real se estiver processando), inclusive avulsas e quantidade ainda sem nota.',
    parameters: {
      type: 'OBJECT',
      properties: { pedidoRef: { type: 'STRING' } },
      required: ['pedidoRef']
    }
  },
  {
    name: 'enviar_danfe_nfe',
    description: 'Baixa o PDF do DANFE de uma NF-e autorizada do pedido e envia o documento direto no chat do Telegram.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pedidoRef: { type: 'STRING', description: 'Referência do pedido (ex: PED-2026-0012 ou AVU-2026-0001).' },
        numeroNota: { type: 'STRING', description: 'Número da NF-e específica, se o pedido tiver mais de uma.' }
      },
      required: ['pedidoRef']
    }
  },
  {
    name: 'conferir_lancamentos',
    description: 'Compara, por pedido, a soma dos recibos com a soma dos pagamentos e aponta divergências.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'registrar_abatimento',
    description:
      'Prepara um abatimento/desconto numa parcela. Não grava nada: devolve um resumo para o usuário confirmar no botão.',
    parameters: {
      type: 'OBJECT',
      properties: {
        parcelaId: { type: 'STRING', description: 'Id da parcela vindo de listar_recebiveis_em_aberto.' },
        pedidoRef: { type: 'STRING' },
        clienteNome: { type: 'STRING' },
        valor: { type: 'NUMBER' },
        motivo: { type: 'STRING' }
      },
      required: ['valor']
    }
  },
  {
    name: 'registrar_recebimento',
    description:
      'Prepara a baixa de um recebimento numa parcela. Não grava nada: devolve um resumo para o usuário confirmar no botão.',
    parameters: {
      type: 'OBJECT',
      properties: {
        parcelaId: { type: 'STRING', description: 'Id da parcela vindo de listar_recebiveis_em_aberto.' },
        pedidoRef: { type: 'STRING' },
        clienteNome: { type: 'STRING' },
        valor: { type: 'NUMBER' },
        formaPagamento: { type: 'STRING', description: 'PIX, Dinheiro, Transferência, Boleto...' }
      },
      required: ['valor']
    }
  },
  {
    name: 'criar_orcamento',
    description:
      'Prepara um orçamento de venda. Não grava nada: devolve um resumo para o usuário confirmar no botão. O orçamento vira venda dentro do ERP.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteNome: { type: 'STRING' },
        itens: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              produto: { type: 'STRING' },
              quantidade: { type: 'NUMBER' },
              precoUnitario: { type: 'NUMBER' }
            },
            required: ['produto', 'quantidade']
          }
        },
        observacao: { type: 'STRING' }
      },
      required: ['clienteNome', 'itens']
    }
  },
  {
    name: 'criar_pedido_venda',
    description:
      'Prepara um PEDIDO DE VENDA real (não orçamento). Confira cliente, produto, quantidade, preço e total. Não grava nada até o usuário tocar em Confirmar. Depois gera o PDF para WhatsApp.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteNome: { type: 'STRING' },
        itens: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              produto: { type: 'STRING' },
              quantidade: { type: 'NUMBER' },
              precoUnitario: { type: 'NUMBER' }
            },
            required: ['produto', 'quantidade']
          }
        },
        formaPagamento: { type: 'STRING', description: 'PIX, boleto, a prazo...' },
        observacao: { type: 'STRING' }
      },
      required: ['clienteNome', 'itens']
    }
  },
  {
    name: 'emitir_nfe_pedido',
    description:
      'Prepara o resumo e o botão de confirmação da NF-e de um pedido de venda. Aceita emitir o saldo total ou parcial (itens), customizar preço, CFOP, natureza da operação, frete, placa do caminhão, motorista, ticket de pesagem e observações. Chame novamente sempre que o usuário pedir para alterar algum dado antes de transmitir.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pedidoRef: { type: 'STRING', description: 'Referência do pedido, por exemplo PED-2026-0012.' },
        itens: {
          type: 'ARRAY',
          description: 'Opcional. Informe se o usuário quiser faturar quantidade parcial ou ajustar preço/CFOP do item.',
          items: {
            type: 'OBJECT',
            properties: {
              produto: { type: 'STRING' },
              quantidade: { type: 'NUMBER' },
              precoUnitario: { type: 'NUMBER' },
              cfop: { type: 'STRING' },
              ncm: { type: 'STRING' }
            },
            required: ['quantidade']
          }
        },
        ...nfeConsultativeProperties
      },
      required: ['pedidoRef']
    }
  },
  {
    name: 'emitir_nfe_avulsa',
    description:
      'Prepara o resumo e o botão de confirmação de uma NF-e avulsa: parcial vinculada a um pedido (pedidoRef + itens) ou nota solta sem pedido (clienteNome + itens), sem baixar estoque nem abrir financeiro. Aceita placa, motorista, frete, CFOP, natureza da operação e observações.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pedidoRef: { type: 'STRING', description: 'Se for nota parcial vinculada a um pedido existente.' },
        clienteNome: { type: 'STRING', description: 'Nome ou documento do cliente (obrigatório na nota solta sem pedido).' },
        itens: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              produto: { type: 'STRING' },
              quantidade: { type: 'NUMBER' },
              precoUnitario: { type: 'NUMBER' },
              cfop: { type: 'STRING' },
              ncm: { type: 'STRING' }
            },
            required: ['produto', 'quantidade']
          }
        },
        ...nfeConsultativeProperties
      }
    }
  }
];
