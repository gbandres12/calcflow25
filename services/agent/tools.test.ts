import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus, TransactionStatus, TransactionType } from '../../types';
import { AgentContext, commitAction, executeTool } from './tools';
import { runCommand } from './commands';

/** Repositório em memória com o mesmo contrato do erpRepository. */
function fakeRepo(seed: Record<string, any[]>) {
  const tables: Record<string, any[]> = JSON.parse(JSON.stringify(seed));
  return {
    tables,
    async getTable(_companyId: string, table: string) {
      return JSON.parse(JSON.stringify(tables[table] || []));
    },
    async upsert(_companyId: string, table: string, record: any) {
      tables[table] = tables[table] || [];
      const index = tables[table].findIndex((item) => item.id === record.id);
      if (index >= 0) tables[table][index] = record;
      else tables[table].push(record);
      return record;
    }
  };
}

const seedData = () => ({
  financial_accounts: [{ id: 'acc-1', name: 'Caixa Geral', type: 'caixa', initialBalance: 1000 }],
  customers: [{ id: 'cust-1', name: 'Fazenda Boa Vista', document: '12345678000190' }],
  inventory: [
    { id: 'moido', name: 'Calcário Agrícola Moído (Granel)', quantity: 500, unitPrice: 180, minStock: 200, unit: 'Ton' }
  ],
  sales_orders: [
    {
      id: 'ord-1',
      reference: 'PED-2026-0001',
      customerId: 'cust-1',
      sellerName: 'Vendedor',
      date: '2026-09-01',
      items: [],
      subtotal: 10000,
      discount: 0,
      shipping: 0,
      total: 10000,
      status: OrderStatus.FINALIZED,
      payments: [],
      receipts: []
    }
  ],
  transactions: [
    {
      id: 'tx-1',
      accountId: 'acc-1',
      date: '2026-09-01',
      dueDate: '2026-09-10',
      type: TransactionType.SALE,
      status: TransactionStatus.PENDENTE,
      description: 'Parcela única - Pedido PED-2026-0001',
      category: 'Venda Calcário Moído Granel',
      amount: 10000,
      paidAmount: 0,
      orderId: 'ord-1',
      customerId: 'cust-1'
    }
  ]
});

function makeContext(repo: ReturnType<typeof fakeRepo>, allowWrites = true): AgentContext {
  return {
    companyId: 'comp-1',
    user: { id: 'user-1', name: 'Gabriel', role: 'Administrador', permissions: { financial: true, orders: true } },
    repo,
    allowWrites,
    today: '2026-09-18'
  };
}

describe('agente: caminho completo de um abatimento', () => {
  it('propõe, confirma e grava parcela e recibo de uma vez só', async () => {
    const repo = fakeRepo(seedData());
    const ctx = makeContext(repo);

    const listed = await executeTool('listar_recebiveis_em_aberto', { pedidoRef: 'PED-2026-0001' }, ctx);
    assert.equal(listed.kind, 'data');
    assert.equal((listed as any).data.parcelas[0].parcelaId, 'tx-1');

    const proposal = await executeTool('registrar_abatimento', { parcelaId: 'tx-1', valor: 2500, motivo: 'Quebra na entrega' }, ctx);
    assert.equal(proposal.kind, 'confirm');
    assert.equal(repo.tables.transactions[0].paidAmount, 0, 'propor não pode gravar nada');

    const committed = await commitAction((proposal as any).action, (proposal as any).payload, ctx);
    assert.match(committed.message, /Abatimento/);

    const transaction = repo.tables.transactions[0];
    const order = repo.tables.sales_orders[0];
    assert.equal(transaction.paidAmount, 2500);
    assert.equal(transaction.status, TransactionStatus.PARCIAL);
    assert.equal(order.receipts.length, 1);
    assert.equal(order.receipts[0].amount, 2500);

    // É este casamento que faz o applyReceiptToFinance do app pular o recibo.
    assert.equal(transaction.receiptId, order.receipts[0].id);
    assert.equal(transaction.origin, 'telegram');
  });

  it('abatimento não entra no saldo de caixa, igual à tela de contas', async () => {
    const repo = fakeRepo(seedData());
    const ctx = makeContext(repo);

    const proposal = await executeTool('registrar_abatimento', { parcelaId: 'tx-1', valor: 2500 }, ctx);
    await commitAction((proposal as any).action, (proposal as any).payload, ctx);

    const saldo = await executeTool('consultar_caixa', {}, ctx);
    assert.equal((saldo as any).data.saldoTotal, 1000);
  });

  it('recebimento entra no saldo de caixa', async () => {
    const repo = fakeRepo(seedData());
    const ctx = makeContext(repo);

    const proposal = await executeTool(
      'registrar_recebimento',
      { parcelaId: 'tx-1', valor: 4000, formaPagamento: 'PIX' },
      ctx
    );
    await commitAction((proposal as any).action, (proposal as any).payload, ctx);

    const saldo = await executeTool('consultar_caixa', {}, ctx);
    assert.equal((saldo as any).data.saldoTotal, 5000);
  });

  it('com duas parcelas em aberto, manda perguntar em vez de escolher sozinho', async () => {
    const seed = seedData();
    seed.transactions.push({ ...seed.transactions[0], id: 'tx-2', dueDate: '2026-10-10' });
    const ctx = makeContext(fakeRepo(seed));

    await assert.rejects(
      () => executeTool('registrar_abatimento', { pedidoRef: 'PED-2026-0001', valor: 1000 }, ctx),
      /Pergunte ao usuário em qual aplicar/
    );
  });

  it('modo somente consulta bloqueia a proposta de lançamento', async () => {
    const ctx = makeContext(fakeRepo(seedData()), false);
    await assert.rejects(
      () => executeTool('registrar_recebimento', { parcelaId: 'tx-1', valor: 100 }, ctx),
      /somente consulta/
    );
  });

  it('usuário sem acesso ao Financeiro não consulta nem lança', async () => {
    const ctx = makeContext(fakeRepo(seedData()));
    ctx.user.permissions = { financial: false, orders: true };

    await assert.rejects(() => executeTool('consultar_caixa', {}, ctx), /não inclui o Financeiro/);
  });
});

describe('agente: orçamento', () => {
  it('confirma e grava o pedido como Orçamento', async () => {
    const repo = fakeRepo(seedData());
    const ctx = makeContext(repo);

    const proposal = await executeTool(
      'criar_orcamento',
      { clienteNome: 'Boa Vista', itens: [{ produto: 'moído', quantidade: 20 }] },
      ctx
    );
    assert.equal(proposal.kind, 'confirm');

    await commitAction((proposal as any).action, (proposal as any).payload, ctx);
    const created = repo.tables.sales_orders.find((order: any) => order.status === OrderStatus.BUDGET);

    assert.ok(created, 'o orçamento precisa existir');
    assert.equal(created.total, 3600);
    assert.deepEqual(created.payments, [], 'orçamento não nasce com financeiro');
  });

  it('casa nome parcial e devolve sugestão em vez de mandar cadastrar', async () => {
    const seed = seedData();
    seed.customers[0].name = 'Gabriel Lima Andres';
    const ctx = makeContext(fakeRepo(seed));

    const found = await executeTool('buscar_cliente', { termo: 'GABRIEL ANDRES' }, ctx);
    assert.equal((found as any).data.encontrado, true);
    assert.equal((found as any).data.nome, 'Gabriel Lima Andres');

    const missing = await executeTool('buscar_cliente', { termo: 'Cliente Inexistente XYZ' }, ctx);
    assert.equal((missing as any).data.encontrado, false);
    assert.deepEqual((missing as any).data.sugestoes, []);
  });

  it('orçamento aceita o mesmo nome pela metade', async () => {
    const seed = seedData();
    seed.customers[0].name = 'Gabriel Lima Andres';
    const repo = fakeRepo(seed);
    const ctx = makeContext(repo);

    const proposal = await executeTool(
      'criar_orcamento',
      {
        clienteNome: 'GABRIEL ANDRES',
        itens: [{ produto: 'calcário dolomítico', quantidade: 50, precoUnitario: 160 }]
      },
      ctx
    );
    assert.equal(proposal.kind, 'confirm');
    assert.match((proposal as any).summary, /Gabriel Lima Andres/);
    assert.match((proposal as any).summary, /8\.000,00|8000/);
  });

  it('grava pedido de venda, baixa estoque, abre parcela e devolve PDF', async () => {
    const seed = seedData();
    seed.customers[0].name = 'Gabriel Lima Andres';
    const repo = fakeRepo(seed);
    const ctx = makeContext(repo);

    const proposal = await executeTool(
      'criar_pedido_venda',
      {
        clienteNome: 'GABRIEL ANDRES',
        itens: [{ produto: 'calcário dolomítico', quantidade: 50, precoUnitario: 160 }]
      },
      ctx
    );
    assert.equal(proposal.kind, 'confirm');
    assert.equal((proposal as any).action, 'criar_pedido_venda');
    assert.match((proposal as any).summary, /Confira o PEDIDO DE VENDA/);
    assert.equal(repo.tables.sales_orders.length, 1, 'propor não pode gravar o pedido');
    assert.equal(repo.tables.inventory[0].quantity, 500);

    const committed = await commitAction((proposal as any).action, (proposal as any).payload, ctx);
    const created = repo.tables.sales_orders.find((order: any) => order.origin === 'telegram');
    assert.ok(created, 'o pedido precisa existir como venda confirmada');
    assert.equal(created.total, 8000);
    assert.equal(repo.tables.inventory[0].quantity, 450);
    assert.equal(repo.tables.transactions.length, 2);
    const saleTx = repo.tables.transactions.find((item: any) => item.orderId === created.id);
    assert.equal(saleTx.status, TransactionStatus.PENDENTE);
    assert.equal(saleTx.amount, 8000);
    assert.ok(committed.document, 'precisa devolver o PDF');
    assert.match(committed.document!.filename, /PED-2026-/);
    assert.equal(Buffer.from(committed.document!.bytes.subarray(0, 4)).toString(), '%PDF');
  });
});

describe('agente: comandos determinísticos, o fallback sem IA', () => {
  it('/saldo responde sem passar por modelo nenhum', async () => {
    const reply = await runCommand('/saldo', makeContext(fakeRepo(seedData())));
    assert.match(reply!.text, /Saldo total/);
    assert.match(reply!.text, /Caixa Geral/);
  });

  it('/receber lista a parcela com o id que o /abater usa', async () => {
    const reply = await runCommand('/receber', makeContext(fakeRepo(seedData())));
    assert.match(reply!.text, /tx-1/);
  });

  it('/abater monta a confirmação em vez de gravar direto', async () => {
    const repo = fakeRepo(seedData());
    const reply = await runCommand('/abater tx-1 1500 avaria', makeContext(repo));

    assert.ok(reply?.pending, 'precisa pedir confirmação');
    assert.equal(reply!.pending!.action, 'registrar_abatimento');
    assert.equal(repo.tables.transactions[0].paidAmount, 0);
  });

  it('/conferir acha o recibo que não virou baixa', async () => {
    const seed = seedData();
    seed.sales_orders[0].receipts.push({
      id: 'REC-2026-0001',
      customerId: 'cust-1',
      customerName: 'Fazenda Boa Vista',
      amount: 3000,
      date: '2026-09-17',
      paymentMethod: 'PIX',
      description: 'Parcela',
      type: 'PARCELA'
    } as any);

    const reply = await runCommand('/conferir', makeContext(fakeRepo(seed)));
    assert.match(reply!.text, /divergência/);
    assert.match(reply!.text, /PED-2026-0001/);
  });

  it('comando desconhecido devolve a ajuda', async () => {
    const reply = await runCommand('/inventar', makeContext(fakeRepo(seedData())));
    assert.match(reply!.text, /\/saldo/);
  });
});
