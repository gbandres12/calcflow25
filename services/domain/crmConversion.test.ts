import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuoteFromLead, findMatchingCustomer, leadToCustomer, suggestProductForLead } from './crmConversion';
import { OrderStatus, type CrmLead, type Customer, type InventoryItem } from '../../types';

const lead: CrmLead = {
  id: 'crm-1', stage: 'GANHO', priority: 'ALTA', produtor: 'José da Silva', documento: '123.456.789-01',
  telefone: '94 99999-0000', fazenda: 'Fazenda Boa Vista', cidade: 'Redenção', uf: 'pa',
  tipoPedido: 'CALCARIO_DOLOMITICO', quantidadeT: 100, filialNome: 'Filial Xinguara',
  createdAt: '2026-01-01', updatedAt: '2026-01-01'
};
const inventory = [
  { id: 'britado', name: 'Brita 1', quantity: 0, unitPrice: 90, minStock: 0 },
  { id: 'dolomitico', name: 'Calcário Dolomítico', quantity: 0, unitPrice: 120, minStock: 0 }
] as InventoryItem[];

test('crm: cliente casado por CPF ignorando máscara', () => {
  const customers = [{ id: 'c1', name: 'Outro nome', document: '12345678901', email: '', phone: '', totalSpent: 0 }] as Customer[];
  assert.equal(findMatchingCustomer(lead, customers)?.id, 'c1');
  assert.equal(findMatchingCustomer({ ...lead, documento: '' }, customers), undefined);
});

test('crm: cliente gerado vira PRODUTOR com UF maiúscula', () => {
  const c = leadToCustomer(lead);
  assert.equal(c.tipoPessoa, 'PRODUTOR');
  assert.equal(c.document, '12345678901');
  assert.equal(c.state, 'PA');
});

test('crm: sugere produto pelo tipo de pedido', () => {
  assert.equal(suggestProductForLead(lead, inventory)?.id, 'dolomitico');
  assert.equal(suggestProductForLead({ ...lead, tipoPedido: 'BRITA' }, inventory)?.id, 'britado');
});

test('crm: orçamento sai como BUDGET com total certo', () => {
  const customer = { id: 'c1', name: 'José', document: '12345678901', email: '', phone: '', totalSpent: 0, state: 'PA' } as Customer;
  const quote = buildQuoteFromLead({ lead, customer, productId: 'dolomitico', quantity: 100, unitPrice: 120, sellerName: 'Ana', inventory, today: '13/10/2026', validUntil: '28/10/2026' });
  assert.ok(quote);
  assert.equal(quote!.status, OrderStatus.BUDGET);
  assert.equal(quote!.total, 12000);
  assert.match(quote!.notes || '', /Filial Xinguara/);
  assert.equal(buildQuoteFromLead({ lead, customer, productId: 'dolomitico', quantity: 0, unitPrice: 120, sellerName: 'Ana', inventory, today: '', validUntil: '' }), null);
});
