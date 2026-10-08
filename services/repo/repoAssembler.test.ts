import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleOrder } from './ordersRepo';
import { assembleCustomer } from './customersRepo';
import { assembleProduct, assembleStoreItem } from './productsRepo';
import { assembleTransaction, assembleAccount } from './financialRepo';
import {
  assembleCategory,
  assembleTransportador,
  assembleMachine,
  assembleMaintenanceRecord,
  assembleFuelRecord,
  assembleFuelPurchase
} from './auxiliaryRepo';

test('repoAssembler: assembleOrder monta SaleOrder completo com filhas', () => {
  const header = {
    id: 'ord-test-1',
    company_id: 'comp-1',
    reference: 'PED-2026-0001',
    customer_id: 'cust-1',
    date: '2026-09-28T12:00:00Z',
    status: 'Venda Confirmada',
    subtotal: 1000,
    discount: 50,
    total: 950,
    seller_name: 'Vendedor Teste',
    without_finance: false,
    payment_method: 'PIX',
    is_avulsa: false,
    frete: { modalidade: 1, valor: 150 },
    extra: { customField: 'extraValue' }
  };

  const items = [
    {
      order_id: 'ord-test-1',
      id: 'ord-test-1_item_1',
      product_id: 'prod-1',
      product_code: 'CALC-001',
      product_name: 'Calcário Moído',
      quantity: 10,
      unit: 'Ton',
      unit_price: 100,
      discount: 0,
      total: 1000,
      ncm: '2517.10.00'
    }
  ];

  const installments = [
    {
      order_id: 'ord-test-1',
      id: 'ord-test-1_inst_1',
      amount: 950,
      due_date: '2026-10-28',
      status: 'PENDENTE',
      paid_amount: 0
    }
  ];

  const receipts = [
    {
      order_id: 'ord-test-1',
      id: 'ord-test-1_rec_1',
      customer_id: 'cust-1',
      order_reference: 'PED-2026-0001',
      amount: 500,
      payment_date: '2026-09-28',
      payment_method: 'PIX',
      received_by: 'Operador 1'
    }
  ];

  const withdrawals = [
    {
      order_id: 'ord-test-1',
      id: 'ord-test-1_wth_1',
      date: '2026-09-28T14:00:00Z',
      net_weight: 10,
      truck_plate: 'ABC1D23',
      driver_name: 'João',
      ticket_number: 'TCK-101'
    }
  ];

  const nfes = [
    {
      order_id: 'ord-test-1',
      id: 'nfe-test-1',
      chave: '15260910375218000265550010000000011000000010',
      numero: '1',
      serie: '1',
      status: 'autorizada',
      emissao: '2026-09-28T15:00:00Z'
    }
  ];

  const order = assembleOrder(header, items, installments, receipts, withdrawals, nfes);

  assert.equal(order.id, 'ord-test-1');
  assert.equal(order.companyId, 'comp-1');
  assert.equal(order.reference, 'PED-2026-0001');
  assert.equal(order.total, 950);
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].productName, 'Calcário Moído');
  assert.equal(order.payments.length, 1);
  assert.equal(order.payments[0].amount, 950);
  assert.equal(order.receipts.length, 1);
  assert.equal(order.receipts[0].amount, 500);
  assert.equal(order.withdrawals.length, 1);
  assert.equal(order.withdrawals[0].truckPlate, 'ABC1D23');
  assert.equal(order.nfes?.length, 1);
  assert.equal(order.nfes?.[0].nfeStatus, 'autorizada');
  assert.equal((order as any).customField, 'extraValue');
});

test('repoAssembler: assembleCustomer monta Customer com todos os campos', () => {
  const row = {
    id: 'cust-1',
    company_id: 'comp-1',
    name: 'Cliente Exemplo Ltda',
    document: '12345678000190',
    tipo_pessoa: 'PJ',
    ie: '152923438',
    isento_ie: false,
    phone: '9399999999',
    city: 'Santarém',
    state: 'PA',
    total_spent: 50000,
    extra: { tags: ['VIP'] }
  };

  const customer = assembleCustomer(row);

  assert.equal(customer.id, 'cust-1');
  assert.equal(customer.name, 'Cliente Exemplo Ltda');
  assert.equal(customer.document, '12345678000190');
  assert.equal(customer.city, 'Santarém');
  assert.equal(customer.state, 'PA');
  assert.equal(customer.totalSpent, 50000);
  assert.deepEqual((customer as any).tags, ['VIP']);
});

test('repoAssembler: assembleTransaction e assembleAccount', () => {
  const accRow = {
    id: 'acc-1',
    company_id: 'comp-1',
    name: 'Bradesco Principal',
    type: 'banco',
    initial_balance: 10000,
    current_balance: 15000
  };

  const acc = assembleAccount(accRow);
  assert.equal(acc.id, 'acc-1');
  assert.equal(acc.name, 'Bradesco Principal');
  assert.equal(acc.currentBalance, 15000);

  const txRow = {
    id: 'tx-1',
    company_id: 'comp-1',
    description: 'Venda de Calcário #PED-2026-0001',
    type: 'SALE',
    amount: 950,
    paid_amount: 500,
    status: 'parcial',
    date: '2026-09-28'
  };

  const payments = [
    {
      id: 'pmt-1',
      transaction_id: 'tx-1',
      amount: 500,
      payment_date: '2026-09-28',
      payment_method: 'PIX',
      receipt_id: 'rec-1'
    }
  ];

  const tx = assembleTransaction(txRow, payments);
  assert.equal(tx.id, 'tx-1');
  assert.equal(tx.amount, 950);
  assert.equal(tx.paidAmount, 500);
  assert.equal(tx.payments?.length, 1);
  assert.equal(tx.payments?.[0].amount, 500);
});

test('repoAssembler: assembleProduct', () => {
  const prodRow = {
    id: 'prod-1',
    company_id: 'comp-1',
    code: 'CALC-001',
    name: 'Calcário Britado',
    quantity: 1500,
    cost_price: 80,
    unit_price: 160
  };

  const prod = assembleProduct(prodRow);
  assert.equal(prod.id, 'prod-1');
  assert.equal(prod.name, 'Calcário Britado');
  assert.equal(prod.quantity, 1500);
  assert.equal(prod.unitPrice, 160);
});

test('repoAssembler: assembleCategory, assembleTransportador e assembleMachine', () => {
  const cat = assembleCategory({
    id: 'cat-1',
    company_id: 'comp-1',
    name: 'Vendas de Calcário',
    type: 'INFLOW',
    extra: { color: 'blue' }
  });
  assert.equal(cat.id, 'cat-1');
  assert.equal(cat.name, 'Vendas de Calcário');
  assert.equal(cat.type, 'INFLOW');
  assert.equal(cat.color, 'blue');

  const transp = assembleTransportador({
    id: 'transp-1',
    company_id: 'comp-1',
    nome: 'Transportes Rápidos',
    placa: 'XYZ9876',
    ativo: true
  });
  assert.equal(transp.id, 'transp-1');
  assert.equal(transp.nome, 'Transportes Rápidos');
  assert.equal(transp.placa, 'XYZ9876');
  assert.equal(transp.ativo, true);

  const mach = assembleMachine({
    id: 'mach-1',
    company_id: 'comp-1',
    name: 'Pá Carregadeira 01',
    current_horimeter: 1250.5,
    status: 'Operacional'
  });
  assert.equal(mach.id, 'mach-1');
  assert.equal(mach.name, 'Pá Carregadeira 01');
  assert.equal(mach.currentHorimeter, 1250.5);

  const maint = assembleMaintenanceRecord({
    id: 'maint-1',
    company_id: 'comp-1',
    machine_id: 'mach-1',
    cost: 350.5
  });
  assert.equal(maint.id, 'maint-1');
  assert.equal(maint.cost, 350.5);

  const fuelRec = assembleFuelRecord({
    id: 'fuel-1',
    company_id: 'comp-1',
    machine_id: 'mach-1',
    liters: 100,
    total_cost: 650
  });
  assert.equal(fuelRec.liters, 100);
  assert.equal(fuelRec.totalCost, 650);

  const fuelPur = assembleFuelPurchase({
    id: 'pur-1',
    company_id: 'comp-1',
    supplier: 'Posto Central',
    liters: 5000,
    total_cost: 30000
  });
  assert.equal(fuelPur.supplier, 'Posto Central');
  assert.equal(fuelPur.liters, 5000);
});

test('repoAssembler: assembleStoreItem monta item de almoxarifado', () => {
  const storeRow = {
    id: 'store-1',
    company_id: 'comp-1',
    name: 'Filtro de Óleo Lubrificante',
    category: 'Lubrificantes',
    unit: 'UN',
    quantity: 12,
    min_stock: 4,
    unit_cost: 85.5,
    supplier_sku: 'FLT-098',
    status: 'ativo',
    extra: { customTag: 'Almoxarifado 01' }
  };

  const item = assembleStoreItem(storeRow);
  assert.equal(item.id, 'store-1');
  assert.equal(item.name, 'Filtro de Óleo Lubrificante');
  assert.equal(item.category, 'Lubrificantes');
  assert.equal(item.quantity, 12);
  assert.equal(item.unitCost, 85.5);
  assert.equal(item.supplierSku, 'FLT-098');
  assert.equal((item as any).customTag, 'Almoxarifado 01');
});

