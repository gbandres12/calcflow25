import {
  Customer,
  FinancialAccount,
  FiscalConfig,
  InventoryItem,
  OrderStatus,
  SaleOrder,
  Transaction,
  TransactionStatus,
  TransactionType
} from '../../types';
import {
  DEDUCTION_METHOD,
  PaymentKind,
  appendReceiptToOrder,
  applyPaymentToTransaction,
  assessStockForItems,
  buildBudgetOrder,
  buildConfirmSaleEffects,
  buildPaymentReceipt,
  formatBRL,
  listOpenInstallments,
  newReceiptId,
  reconcileReceiptsAgainstPayments
} from '../domain/telegramWrites';
import { avaliarAptidaoNfe, emitirNfeParaPedidoTelegram } from '../domain/telegramNfe';
import { mergeSaleDraft, SaleDraftSlots } from './saleDraft';

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
  chatId?: string;
  saleDraft?: SaleDraftSlots | null;
  persistSaleDraft?: (slots: SaleDraftSlots) => Promise<void>;
  clearSaleDraft?: () => Promise<void>;
}

export type ToolOutcome =
  | { kind: 'data'; data: any }
  | { kind: 'confirm'; action: string; payload: any; summary: string };

export interface CommitResult {
  message: string;
  records: { table: string; id: string }[];
  document?: { buffer: Buffer; filename: string; mimeType?: string };
}

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

function requirePermission(ctx: AgentContext, permission: 'financial' | 'orders' | 'inventory' | 'fiscal') {
  if (ctx.user.permissions?.[permission] === false) {
    const labels: Record<string, string> = {
      financial: 'o Financeiro',
      orders: 'Pedidos',
      inventory: 'o Estoque',
      fiscal: 'o Fiscal / NF-e'
    };
    throw new Error(`Seu acesso no ERP não inclui ${labels[permission] || 'esse módulo'}.`);
  }
}

function requireWrites(ctx: AgentContext) {
  if (!ctx.allowWrites) {
    throw new Error('O agente está em modo somente consulta. Peça ao administrador para liberar os lançamentos.');
  }
}

function findCustomers(customers: Customer[], term: string, limit = 3): Customer[] {
  const query = normalize(term);
  if (!query) return [];
  const digits = query.replace(/\D/g, '');

  const exactName = customers.filter((customer) => normalize(customer.name) === query);
  if (exactName.length) return exactName.slice(0, limit);

  if (digits) {
    const byDoc = customers.filter(
      (customer) => String(customer.document || '').replace(/\D/g, '') === digits
    );
    if (byDoc.length) return byDoc.slice(0, limit);
  }

  return customers
    .filter((customer) => normalize(customer.name).includes(query))
    .slice(0, limit);
}

function findCustomer(customers: Customer[], term: string): Customer | null {
  return findCustomers(customers, term, 1)[0] || null;
}

async function loadFiscalConfig(ctx: AgentContext): Promise<FiscalConfig | null> {
  const rows = (await ctx.repo.getTable(ctx.companyId, 'fiscal_config')) as FiscalConfig[];
  return rows.find((row) => row && (row as any).id !== '__seed__') || rows[0] || null;
}

async function persistDraftPatch(ctx: AgentContext, patch: Partial<SaleDraftSlots>): Promise<SaleDraftSlots> {
  const next = mergeSaleDraft(ctx.saleDraft, patch);
  ctx.saleDraft = next;
  if (ctx.persistSaleDraft) await ctx.persistSaleDraft(next);
  return next;
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

  const customer = args.clienteNome ? findCustomer(customers, args.clienteNome) : null;
  if (args.clienteNome && !customer) throw new Error(`Não encontrei o cliente ${args.clienteNome}.`);

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
      const customer = args.clienteNome ? findCustomer(customers, args.clienteNome) : null;
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
      const matches = findCustomers(customers, String(args.termo || ''), 3);
      if (!matches.length) {
        return {
          kind: 'data',
          data: {
            encontrado: false,
            quantidade: 0,
            mensagem:
              'Não cadastro cliente pelo Telegram. Cadastra no ERP e me chama de novo.'
          }
        };
      }

      if (matches.length > 1) {
        return {
          kind: 'data',
          data: {
            encontrado: true,
            quantidade: matches.length,
            precisaoEscolha: true,
            opcoes: matches.map((customer) => ({
              id: customer.id,
              nome: customer.name,
              documento: customer.document,
              cidade: customer.city
            })),
            mensagem: 'Achei mais de um. Qual desses é?'
          }
        };
      }

      const customer = matches[0];
      const [orders, transactions] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'transactions') as Promise<Transaction[]>
      ]);

      const open = listOpenInstallments(transactions, { customerId: customer.id });
      await persistDraftPatch(ctx, {
        customerId: customer.id,
        customerLabel: `${customer.name}${customer.document ? `, CNPJ/CPF ${customer.document}` : ''}`
      });

      return {
        kind: 'data',
        data: {
          encontrado: true,
          quantidade: 1,
          id: customer.id,
          nome: customer.name,
          documento: customer.document,
          telefone: customer.phone,
          cidade: customer.city,
          saldoDevedor: open.reduce((sum, item) => sum + item.outstanding, 0),
          pedidos: orders
            .filter((order) => order.customerId === customer.id)
            .slice(-5)
            .map((order) => ({ referencia: order.reference, total: order.total, status: order.status })),
          mensagem: `É ${customer.name}${customer.document ? `, documento ${customer.document}` : ''}?`
        }
      };
    }

    case 'consultar_estoque': {
      const inventory = (await ctx.repo.getTable(ctx.companyId, 'inventory')) as InventoryItem[];
      const term = normalize(String(args.termo || ''));
      const items = term
        ? inventory.filter((item) => normalize(item.name).includes(term) || normalize(item.id).includes(term))
        : inventory;

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

      const customer = args.clienteNome ? findCustomer(customers, args.clienteNome) : null;
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
            recebido: (order.receipts || []).reduce((sum, receipt) => sum + toNumber(receipt?.amount), 0)
          }))
        }
      };
    }

    case 'status_nfe_pedido': {
      const orders = (await ctx.repo.getTable(ctx.companyId, 'sales_orders')) as SaleOrder[];
      const order = findOrder(orders, String(args.pedidoRef || ''));
      if (!order) return { kind: 'data', data: { encontrado: false } };

      return {
        kind: 'data',
        data: {
          encontrado: true,
          referencia: order.reference,
          statusPedido: order.status,
          nfeStatus: order.nfeStatus || 'nao_emitida',
          numero: order.nfeNumero,
          chave: order.nfeChave,
          erro: order.nfeErro
        }
      };
    }

    case 'validar_aptidao_nfe': {
      const [orders, customers] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>
      ]);
      const order = findOrder(orders, String(args.pedidoRef || ctx.saleDraft?.pedidoRef || ''));
      if (!order) return { kind: 'data', data: { apto: false, faltas: ['Pedido não encontrado.'] } };
      const customer = customers.find((item) => item.id === order.customerId);
      if (!customer) return { kind: 'data', data: { apto: false, faltas: ['Cliente do pedido não encontrado.'] } };
      const config = await loadFiscalConfig(ctx);
      const aptidao = avaliarAptidaoNfe({
        order,
        customer,
        config,
        naturezaOverride: args.natureza || ctx.saleDraft?.natureza,
        cfopOverride: args.cfop || ctx.saleDraft?.cfop
      });
      return { kind: 'data', data: aptidao };
    }

    case 'atualizar_rascunho_venda': {
      const patch: Partial<SaleDraftSlots> = {};
      if (args.intent) patch.intent = args.intent;
      if (args.customerId) patch.customerId = String(args.customerId);
      if (args.customerLabel) patch.customerLabel = String(args.customerLabel);
      if (args.destino) patch.destino = args.destino;
      if (args.emitirNfe != null) patch.emitirNfe = Boolean(args.emitirNfe);
      if (args.aceitarEstoqueCritico != null) patch.aceitarEstoqueCritico = Boolean(args.aceitarEstoqueCritico);
      if (args.observacao != null) patch.observacao = String(args.observacao);
      if (args.frete != null) patch.frete = args.frete;
      if (args.natureza) patch.natureza = String(args.natureza);
      if (args.cfop) patch.cfop = String(args.cfop);
      if (args.pedidoRef) patch.pedidoRef = String(args.pedidoRef);
      if (Array.isArray(args.itens)) {
        patch.itens = args.itens.map((line: any) => ({
          productId: String(line.productId || line.produtoId || ''),
          productName: line.productName || line.produto,
          quantity: toNumber(line.quantity ?? line.quantidade),
          unit: line.unit || line.unidade,
          unitPrice: line.unitPrice != null || line.precoUnitario != null
            ? toNumber(line.unitPrice ?? line.precoUnitario)
            : undefined
        }));
      }
      const next = await persistDraftPatch(ctx, patch);
      return { kind: 'data', data: { ok: true, rascunho: next } };
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

      const customerMatches = findCustomers(customers, String(args.clienteNome || ''), 3);
      if (!customerMatches.length) {
        throw new Error(
          `Não encontrei o cliente ${args.clienteNome}. Não cadastro cliente pelo Telegram — cadastra no ERP e me chama de novo.`
        );
      }
      if (customerMatches.length > 1) {
        throw new Error(
          `Achei mais de um cliente. Qual desses?\n${customerMatches
            .map((c, i) => `${i + 1}) ${c.name}${c.document ? ` — ${c.document}` : ''}`)
            .join('\n')}`
        );
      }
      const customer = customerMatches[0];

      const lines = Array.isArray(args.itens) ? args.itens : [];
      if (!lines.length) throw new Error('Informe ao menos um produto com quantidade.');

      const items = lines.map((line: any) => {
        const term = normalize(String(line.produto || line.productId || ''));
        const product =
          inventory.find((item) => normalize(item.id) === term) ||
          inventory.find((item) => normalize(item.name) === term) ||
          inventory.find((item) => normalize(item.name).includes(term));
        if (!product) throw new Error(`Produto "${line.produto}" não existe no estoque.`);
        return {
          productId: product.id,
          quantity: toNumber(line.quantidade),
          unitPrice: line.precoUnitario != null ? toNumber(line.precoUnitario) : undefined
        };
      });

      const stock = assessStockForItems(items, inventory);
      const stockIssues = stock.filter((row) => row.insufficient || row.criticalAfter);
      if (stockIssues.length && !args.aceitarEstoqueCritico && !ctx.saleDraft?.aceitarEstoqueCritico) {
        const detail = stockIssues
          .map((row) =>
            row.insufficient
              ? `${row.productName}: pediu ${row.quantity}, tem ${row.available}`
              : `${row.productName}: depois da venda fica em ${row.available - row.quantity} (mínimo ${row.minStock})`
          )
          .join('; ');
        throw new Error(
          `Estoque apertado (${detail}). Pergunte se pode seguir mesmo assim e só então chame de novo com aceitarEstoqueCritico=true.`
        );
      }

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
        'Baixa estoque: não',
        'Gera parcela: não',
        'Envia NF-e à SEFAZ: não'
      ].join('\n');

      await persistDraftPatch(ctx, {
        customerId: customer.id,
        customerLabel: customer.name,
        itens: items.map((item, index) => ({
          productId: item.productId,
          productName: preview.items[index]?.productName,
          quantity: item.quantity,
          unit: preview.items[index]?.unit,
          unitPrice: item.unitPrice ?? preview.items[index]?.unitPrice
        })),
        destino: 'orcamento',
        emitirNfe: false,
        observacao: args.observacao,
        aceitarEstoqueCritico: Boolean(args.aceitarEstoqueCritico)
      });

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

    case 'confirmar_pedido': {
      requirePermission(ctx, 'orders');
      requireWrites(ctx);

      const [orders, customers, inventory] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
        ctx.repo.getTable(ctx.companyId, 'inventory') as Promise<InventoryItem[]>
      ]);

      const order = findOrder(orders, String(args.pedidoRef || ''));
      if (!order) throw new Error('Pedido/orçamento não encontrado.');
      if (order.status !== OrderStatus.BUDGET) {
        throw new Error(`Só confirmo orçamento. ${order.reference} está como ${order.status}.`);
      }

      const customer = customers.find((item) => item.id === order.customerId);
      if (!customer) throw new Error('Cliente do pedido não encontrado.');

      const stock = assessStockForItems(
        (order.items || []).map((item) => ({ productId: item.productId, quantity: item.quantity })),
        inventory
      );
      const stockIssues = stock.filter((row) => row.insufficient || row.criticalAfter);
      if (stockIssues.length && !args.aceitarEstoqueCritico && !ctx.saleDraft?.aceitarEstoqueCritico) {
        throw new Error(
          `Estoque apertado. Pergunte se pode seguir e chame de novo com aceitarEstoqueCritico=true. Detalhe: ${stockIssues
            .map((row) => row.productName)
            .join(', ')}`
        );
      }

      const summary = [
        `Confirmar pedido ${order.reference}`,
        `Cliente: ${customer.name}`,
        ...order.items.map(
          (item) => `• ${item.quantity} ${item.unit} de ${item.productName} a ${formatBRL(item.unitPrice)}`
        ),
        `Total: ${formatBRL(order.total)}`,
        'Baixa estoque: sim',
        'Gera parcela: sim',
        'Envia NF-e à SEFAZ: não'
      ].join('\n');

      return {
        kind: 'confirm',
        action: 'confirmar_pedido',
        payload: { orderId: order.id, pedidoRef: order.reference },
        summary
      };
    }

    case 'emitir_nfe': {
      requirePermission(ctx, 'fiscal');
      requireWrites(ctx);

      const [orders, customers] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>
      ]);
      const order = findOrder(orders, String(args.pedidoRef || ''));
      if (!order) throw new Error('Pedido não encontrado.');
      const customer = customers.find((item) => item.id === order.customerId);
      if (!customer) throw new Error('Cliente do pedido não encontrado.');
      const config = await loadFiscalConfig(ctx);
      const aptidao = avaliarAptidaoNfe({
        order,
        customer,
        config,
        naturezaOverride: args.natureza,
        cfopOverride: args.cfop
      });
      if (!aptidao.apto) {
        throw new Error(`Não dá para emitir ainda:\n• ${aptidao.faltas.join('\n• ')}`);
      }

      const summary = [
        `Emitir NF-e do pedido ${order.reference}`,
        `Cliente: ${customer.name}`,
        `Total: ${formatBRL(order.total)}`,
        `Natureza: ${aptidao.naturezaDisponivel}`,
        `CFOP: ${aptidao.cfopDisponivel}`,
        'Baixa estoque: (já feita na confirmação)',
        'Gera parcela: (já feita na confirmação)',
        'Envia NF-e à SEFAZ: sim'
      ].join('\n');

      return {
        kind: 'confirm',
        action: 'emitir_nfe',
        payload: {
          orderId: order.id,
          pedidoRef: order.reference,
          natureza: args.natureza || aptidao.naturezaDisponivel || null,
          cfop: args.cfop || aptidao.cfopDisponivel || null
        },
        summary
      };
    }

    case 'propor_ciclo_venda': {
      requirePermission(ctx, 'orders');
      requireWrites(ctx);

      const destino = (args.destino || ctx.saleDraft?.destino || 'orcamento') as 'orcamento' | 'confirmado';
      const emitirNfe = Boolean(args.emitirNfe ?? ctx.saleDraft?.emitirNfe);
      if (emitirNfe && destino !== 'confirmado' && !args.pedidoRef && !ctx.saleDraft?.pedidoRef) {
        throw new Error(
          'Para emitir NF-e o destino precisa ser pedido confirmado. Confirme se pode faturar/emitir.'
        );
      }
      if (emitirNfe) requirePermission(ctx, 'fiscal');

      const [customers, inventory, orders] = await Promise.all([
        ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
        ctx.repo.getTable(ctx.companyId, 'inventory') as Promise<InventoryItem[]>,
        ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>
      ]);

      let existingOrder: SaleOrder | null = null;
      const pedidoRef = String(args.pedidoRef || ctx.saleDraft?.pedidoRef || '');
      if (pedidoRef) {
        existingOrder = findOrder(orders, pedidoRef);
        if (!existingOrder) throw new Error(`Pedido ${pedidoRef} não encontrado.`);
      }

      let customer: Customer | undefined;
      let createPayload: any = null;
      let previewOrder: SaleOrder | null = existingOrder;

      if (!existingOrder) {
        const customerId = String(args.customerId || ctx.saleDraft?.customerId || '');
        const customerTerm = String(args.clienteNome || ctx.saleDraft?.customerLabel || '');
        customer =
          (customerId ? customers.find((item) => item.id === customerId) : undefined) ||
          (customerTerm ? findCustomers(customers, customerTerm, 1)[0] : undefined);
        if (!customer) {
          throw new Error(
            'Cliente não identificado no cadastro. Não cadastro cliente pelo Telegram — cadastra no ERP e me chama de novo.'
          );
        }

        const rawItems = Array.isArray(args.itens)
          ? args.itens
          : ctx.saleDraft?.itens || [];
        if (!rawItems.length) throw new Error('Faltam os itens do pedido.');

        const items = rawItems.map((line: any) => {
          const term = normalize(String(line.produto || line.productId || line.productName || ''));
          const product =
            inventory.find((item) => item.id === line.productId) ||
            inventory.find((item) => normalize(item.id) === term) ||
            inventory.find((item) => normalize(item.name) === term) ||
            inventory.find((item) => normalize(item.name).includes(term));
          if (!product) throw new Error(`Produto "${line.produto || line.productName}" não existe no estoque.`);
          const unitPrice =
            line.precoUnitario != null || line.unitPrice != null
              ? toNumber(line.precoUnitario ?? line.unitPrice)
              : undefined;
          if (unitPrice == null && !(toNumber(product.unitPrice) > 0)) {
            throw new Error(`Produto ${product.name} sem preço na tabela. Informe o preço ou cadastre no ERP.`);
          }
          return {
            productId: product.id,
            quantity: toNumber(line.quantidade ?? line.quantity),
            unitPrice
          };
        });

        const stock = assessStockForItems(items, inventory);
        const stockIssues = stock.filter((row) => row.insufficient || row.criticalAfter);
        if (
          (destino === 'confirmado' || emitirNfe) &&
          stockIssues.length &&
          !args.aceitarEstoqueCritico &&
          !ctx.saleDraft?.aceitarEstoqueCritico
        ) {
          throw new Error(
            `Estoque apertado (${stockIssues
              .map((row) => row.productName)
              .join(', ')}). Pergunte se segue e use aceitarEstoqueCritico=true.`
          );
        }

        previewOrder = buildBudgetOrder({
          companyId: ctx.companyId,
          customer,
          items,
          inventory,
          existingOrders: orders,
          sellerName: ctx.user.name,
          notes: args.observacao || ctx.saleDraft?.observacao
        });
        createPayload = {
          customerId: customer.id,
          items,
          notes: args.observacao || ctx.saleDraft?.observacao || null
        };
      } else {
        customer = customers.find((item) => item.id === existingOrder!.customerId);
        if (!customer) throw new Error('Cliente do pedido não encontrado.');
      }

      if (!previewOrder || !customer) throw new Error('Não consegui montar o pedido.');

      let emitirPayload: any = null;
      if (emitirNfe) {
        const config = await loadFiscalConfig(ctx);
        const orderForCheck =
          destino === 'confirmado' || existingOrder?.status === OrderStatus.FINALIZED
            ? { ...previewOrder, status: OrderStatus.FINALIZED }
            : previewOrder;
        const aptidao = avaliarAptidaoNfe({
          order: orderForCheck,
          customer,
          config,
          naturezaOverride: args.natureza || ctx.saleDraft?.natureza,
          cfopOverride: args.cfop || ctx.saleDraft?.cfop
        });
        // Ignora a falta de "precisa estar confirmado" se vamos confirmar neste ciclo.
        const faltas = aptidao.faltas.filter(
          (f) => !(destino === 'confirmado' && /precisa estar confirmado/i.test(f))
        );
        if (faltas.length) {
          throw new Error(`Não dá para emitir ainda:\n• ${faltas.join('\n• ')}`);
        }
        emitirPayload = {
          natureza: args.natureza || ctx.saleDraft?.natureza || aptidao.naturezaDisponivel || null,
          cfop: args.cfop || ctx.saleDraft?.cfop || aptidao.cfopDisponivel || null
        };
      }

      const willConfirm = destino === 'confirmado' || Boolean(emitirNfe);
      const willCreate = Boolean(createPayload);
      const willEmit = Boolean(emitirPayload);

      const title =
        (willCreate ? 'Criar orçamento' : '') +
        (willCreate && willConfirm ? ' → ' : '') +
        (willConfirm ? 'confirmar pedido' : '') +
        (willEmit ? ' → emitir NF-e' : '');

      const cleanSummary = [
        title.charAt(0).toUpperCase() + title.slice(1),
        `Cliente: ${customer.name}`,
        ...previewOrder.items.map(
          (item) => `• ${item.quantity} ${item.unit} de ${item.productName} a ${formatBRL(item.unitPrice)}`
        ),
        `Total: ${formatBRL(previewOrder.total)}`,
        `Baixa estoque: ${willConfirm ? 'sim' : 'não'}`,
        `Gera parcela: ${willConfirm ? 'sim' : 'não'}`,
        `Envia NF-e à SEFAZ: ${willEmit ? 'sim' : 'não'}`,
        willEmit && emitirPayload?.natureza ? `Natureza: ${emitirPayload.natureza}` : null,
        willEmit && emitirPayload?.cfop ? `CFOP: ${emitirPayload.cfop}` : null
      ]
        .filter(Boolean)
        .join('\n');

      return {
        kind: 'confirm',
        action: 'ciclo_venda',
        payload: {
          criarOrcamento: createPayload,
          confirmarPedido: willConfirm
            ? { orderId: existingOrder?.id || null, aceitarEstoqueCritico: true }
            : null,
          emitirNfe: willEmit ? emitirPayload : null
        },
        summary: cleanSummary
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
): Promise<CommitResult> {
  requireWrites(ctx);

  if (action === 'ciclo_venda') {
    const messages: string[] = [];
    const records: CommitResult['records'] = [];
    let document: CommitResult['document'];
    let orderId: string | undefined = payload?.confirmarPedido?.orderId || undefined;
    let pedidoRef: string | undefined;

    if (payload?.criarOrcamento) {
      const created = await commitAction('criar_orcamento', payload.criarOrcamento, ctx);
      messages.push(created.message);
      records.push(...created.records);
      orderId = created.records.find((row) => row.table === 'sales_orders')?.id || orderId;
    }

    if (payload?.confirmarPedido) {
      const confirmPayload = {
        ...payload.confirmarPedido,
        orderId: payload.confirmarPedido.orderId || orderId
      };
      const confirmed = await commitAction('confirmar_pedido', confirmPayload, ctx);
      messages.push(confirmed.message);
      records.push(...confirmed.records);
      orderId = confirmed.records.find((row) => row.table === 'sales_orders')?.id || orderId;
      const match = confirmed.message.match(/Pedido\s+(\S+)/i);
      if (match) pedidoRef = match[1];
    }

    if (payload?.emitirNfe) {
      try {
        const emitPayload = {
          ...payload.emitirNfe,
          orderId: payload.emitirNfe.orderId || orderId,
          pedidoRef: payload.emitirNfe.pedidoRef || pedidoRef
        };
        const emitted = await commitAction('emitir_nfe', emitPayload, ctx);
        messages.push(emitted.message);
        records.push(...emitted.records);
        if (emitted.document) document = emitted.document;
      } catch (error: any) {
        messages.push(
          `Pedido ficou gravado, mas a NF-e não saiu: ${error?.message || 'erro na NotaAs/SEFAZ'}.`
        );
      }
    }

    if (ctx.clearSaleDraft) await ctx.clearSaleDraft().catch(() => undefined);

    return { message: messages.join('\n'), records, document };
  }

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
      )}.`,
      records: [{ table: 'sales_orders', id: order.id }]
    };
  }

  if (action === 'confirmar_pedido') {
    requirePermission(ctx, 'orders');

    const [orders, customers, inventory, accounts] = await Promise.all([
      ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
      ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>,
      ctx.repo.getTable(ctx.companyId, 'inventory') as Promise<InventoryItem[]>,
      ctx.repo.getTable(ctx.companyId, 'financial_accounts') as Promise<FinancialAccount[]>
    ]);

    const order =
      (payload.orderId && orders.find((item) => item.id === payload.orderId)) ||
      (payload.pedidoRef ? findOrder(orders, String(payload.pedidoRef)) : null);
    if (!order) throw new Error('Pedido não encontrado. Nada foi confirmado.');
    if (order.status === OrderStatus.FINALIZED) {
      return {
        message: `Pedido ${order.reference} já estava confirmado.`,
        records: [{ table: 'sales_orders', id: order.id }]
      };
    }

    const customer = customers.find((item) => item.id === order.customerId);
    if (!customer) throw new Error('Cliente do pedido não encontrado.');

    const effects = buildConfirmSaleEffects({
      order,
      inventory,
      accounts,
      customer,
      today: ctx.today
    });

    const records: CommitResult['records'] = [];
    await ctx.repo.upsert(ctx.companyId, 'sales_orders', { ...effects.order, origin: 'telegram' });
    records.push({ table: 'sales_orders', id: effects.order.id });

    for (const patch of effects.inventoryPatches) {
      await ctx.repo.upsert(ctx.companyId, 'inventory', { ...patch, origin: 'telegram' });
      records.push({ table: 'inventory', id: patch.id });
    }
    for (const tx of effects.transactions) {
      await ctx.repo.upsert(ctx.companyId, 'transactions', { ...tx, origin: 'telegram' });
      records.push({ table: 'transactions', id: tx.id });
    }
    await ctx.repo.upsert(ctx.companyId, 'customers', { ...effects.customerPatch, origin: 'telegram' });
    records.push({ table: 'customers', id: effects.customerPatch.id });

    return {
      message: `Pedido ${effects.order.reference} confirmado para ${customer.name}. Estoque baixado e parcela gerada (total ${formatBRL(
        effects.order.total
      )}).`,
      records
    };
  }

  if (action === 'emitir_nfe') {
    requirePermission(ctx, 'fiscal');

    const [orders, customers] = await Promise.all([
      ctx.repo.getTable(ctx.companyId, 'sales_orders') as Promise<SaleOrder[]>,
      ctx.repo.getTable(ctx.companyId, 'customers') as Promise<Customer[]>
    ]);

    const order =
      (payload.orderId && orders.find((item) => item.id === payload.orderId)) ||
      (payload.pedidoRef ? findOrder(orders, String(payload.pedidoRef)) : null);
    if (!order) throw new Error('Pedido não encontrado. Nada foi emitido.');

    const customer = customers.find((item) => item.id === order.customerId);
    if (!customer) throw new Error('Cliente do pedido não encontrado.');

    const config = await loadFiscalConfig(ctx);
    if (!config) throw new Error('Configuração fiscal da empresa não encontrada no ERP.');

    const result = await emitirNfeParaPedidoTelegram({
      order,
      customer,
      config,
      natureza: payload.natureza || undefined,
      cfop: payload.cfop || undefined
    });

    await ctx.repo.upsert(ctx.companyId, 'sales_orders', { ...result.order, origin: 'telegram' });

    return {
      message: result.message,
      records: [{ table: 'sales_orders', id: result.order.id }],
      document:
        result.danfeBuffer && result.danfeFilename
          ? { buffer: result.danfeBuffer, filename: result.danfeFilename, mimeType: 'application/pdf' }
          : undefined
    };
  }

  throw new Error(`Ação desconhecida: ${action}`);
}

export const READ_ONLY_TOOLS = [
  'consultar_caixa',
  'listar_recebiveis_em_aberto',
  'resumo_do_dia',
  'buscar_cliente',
  'consultar_estoque',
  'listar_vendas',
  'status_nfe_pedido',
  'validar_aptidao_nfe',
  'atualizar_rascunho_venda',
  'conferir_lancamentos'
];

export const WRITE_TOOLS = [
  'registrar_abatimento',
  'registrar_recebimento',
  'criar_orcamento',
  'confirmar_pedido',
  'emitir_nfe',
  'propor_ciclo_venda'
];

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
      'Busca cliente no cadastro (nome ou documento). Devolve 0, 1 ou até 3 opções. Nunca cadastra cliente.',
    parameters: {
      type: 'OBJECT',
      properties: { termo: { type: 'STRING', description: 'Nome ou documento do cliente.' } },
      required: ['termo']
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
    description: 'Situação fiscal da NF-e de um pedido (consulta).',
    parameters: {
      type: 'OBJECT',
      properties: { pedidoRef: { type: 'STRING' } },
      required: ['pedidoRef']
    }
  },
  {
    name: 'validar_aptidao_nfe',
    description: 'Lista o que falta para emitir NF-e de um pedido (documento, endereço, CFOP, chave API).',
    parameters: {
      type: 'OBJECT',
      properties: {
        pedidoRef: { type: 'STRING' },
        natureza: { type: 'STRING' },
        cfop: { type: 'STRING' }
      }
    }
  },
  {
    name: 'atualizar_rascunho_venda',
    description:
      'Atualiza os slots da entrevista de venda (intent, cliente, itens, destino, emitirNfe). Não grava no ERP.',
    parameters: {
      type: 'OBJECT',
      properties: {
        intent: { type: 'STRING' },
        customerId: { type: 'STRING' },
        customerLabel: { type: 'STRING' },
        destino: { type: 'STRING', description: 'orcamento ou confirmado' },
        emitirNfe: { type: 'BOOLEAN' },
        aceitarEstoqueCritico: { type: 'BOOLEAN' },
        observacao: { type: 'STRING' },
        frete: { type: 'STRING' },
        natureza: { type: 'STRING' },
        cfop: { type: 'STRING' },
        pedidoRef: { type: 'STRING' },
        itens: { type: 'ARRAY', items: { type: 'OBJECT' } }
      }
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
      'Prepara um orçamento de venda. Não grava nada até o botão Confirmar. Não baixa estoque nem gera financeiro.',
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
        observacao: { type: 'STRING' },
        aceitarEstoqueCritico: { type: 'BOOLEAN' }
      },
      required: ['clienteNome', 'itens']
    }
  },
  {
    name: 'confirmar_pedido',
    description:
      'Prepara a confirmação de um orçamento existente (baixa estoque + gera parcela). Exige botão Confirmar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pedidoRef: { type: 'STRING' },
        aceitarEstoqueCritico: { type: 'BOOLEAN' }
      },
      required: ['pedidoRef']
    }
  },
  {
    name: 'emitir_nfe',
    description:
      'Prepara emissão de NF-e de um pedido já confirmado. Exige botão Confirmar. Usa cadastro fiscal da empresa.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pedidoRef: { type: 'STRING' },
        natureza: { type: 'STRING' },
        cfop: { type: 'STRING' }
      },
      required: ['pedidoRef']
    }
  },
  {
    name: 'propor_ciclo_venda',
    description:
      'Fecha o ciclo em um único Confirmar: criar orçamento e/ou confirmar pedido e/ou emitir NF-e. Default destino=orcamento; só confirma/emite se o operador pediu explicitamente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteNome: { type: 'STRING' },
        customerId: { type: 'STRING' },
        pedidoRef: { type: 'STRING', description: 'Se já existe orçamento/pedido, use a referência.' },
        itens: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              produto: { type: 'STRING' },
              productId: { type: 'STRING' },
              quantidade: { type: 'NUMBER' },
              precoUnitario: { type: 'NUMBER' }
            }
          }
        },
        destino: { type: 'STRING', description: 'orcamento (default) ou confirmado' },
        emitirNfe: { type: 'BOOLEAN' },
        observacao: { type: 'STRING' },
        natureza: { type: 'STRING' },
        cfop: { type: 'STRING' },
        aceitarEstoqueCritico: { type: 'BOOLEAN' }
      }
    }
  }
];
