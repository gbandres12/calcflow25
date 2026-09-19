import {
  Customer,
  FinancialAccount,
  InventoryItem,
  SaleOrder,
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
import { buildSalesOrderPdf } from '../domain/salesOrderPdf.js';
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

export type ToolOutcome =
  | { kind: 'data'; data: any }
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

      return {
        kind: 'data',
        data: {
          encontrado: true,
          id: customer.id,
          nome: customer.name,
          documento: customer.document,
          telefone: customer.phone,
          cidade: customer.city,
          saldoDevedor: open.reduce((sum, item) => sum + item.outstanding, 0),
          pedidos: orders
            .filter((order) => order.customerId === customer.id)
            .slice(-5)
            .map((order) => ({ referencia: order.reference, total: order.total, status: order.status }))
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
          nfeStatus: order.nfeStatus || 'nao_emitida',
          numero: order.nfeNumero,
          chave: order.nfeChave,
          erro: order.nfeErro,
          observacao: 'A emissão de NF-e é feita apenas pelo ERP, não pelo Telegram.'
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
        companyName: fiscal?.razaoSocial || fiscal?.nomeFantasia || 'CBA Mineração',
        companyDocument: fiscal?.cnpjEmitente,
        companyPhone: fiscal?.telefoneEmitente,
        companyCity: fiscal?.cidadeEmitente && fiscal?.ufEmitente ? `${fiscal.cidadeEmitente}/${fiscal.ufEmitente}` : undefined
      });
      document = {
        filename: `Pedido-${order.reference}.pdf`,
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
  'conferir_lancamentos'
];

export const WRITE_TOOLS = ['registrar_abatimento', 'registrar_recebimento', 'criar_orcamento', 'criar_pedido_venda'];

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
      'Localiza cliente por nome parcial ou documento. "GABRIEL ANDRES" encontra "Gabriel Lima Andres". Se não for único, devolve sugestões.',
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
    description: 'Situação fiscal da NF-e de um pedido. Consulta apenas: a emissão é feita no ERP.',
    parameters: {
      type: 'OBJECT',
      properties: { pedidoRef: { type: 'STRING' } },
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
  }
];
