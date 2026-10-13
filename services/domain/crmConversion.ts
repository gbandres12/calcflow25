import type { CrmLead, CrmOrderType, Customer, InventoryItem, SaleOrder } from '../../types';
import { OrderStatus } from '../../types';
import { buildItemsFromDrafts, defaultWarrantyDraft, sellableInventoryItems } from '../../utils/salesOrderProduct';

const digits = (v?: string) => String(v || '').replace(/\D/g, '');
const norm = (v?: string) =>
  String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Procura cliente existente: já vinculado → CPF/CNPJ → nome exato. */
export function findMatchingCustomer(lead: CrmLead, customers: Customer[]): Customer | undefined {
  const list = (Array.isArray(customers) ? customers : []).filter(c => c && c.id);
  if (lead.customerId) {
    const linked = list.find(c => c.id === lead.customerId);
    if (linked) return linked;
  }
  const doc = digits(lead.documento);
  if (doc.length === 11 || doc.length === 14) {
    const byDoc = list.find(c => digits(c.document) === doc);
    if (byDoc) return byDoc;
  }
  const name = norm(lead.produtor);
  return name ? list.find(c => norm(c.name) === name) : undefined;
}

/** Monta o cadastro de cliente a partir do card do CRM. */
export function leadToCustomer(lead: CrmLead): Omit<Customer, 'id' | 'totalSpent'> {
  const doc = digits(lead.documento);
  return {
    name: lead.produtor.trim(),
    document: doc,
    email: lead.email || '',
    phone: lead.telefone || '',
    tipoPessoa: doc.length === 14 ? 'PJ' : 'PRODUTOR',
    city: lead.cidade || undefined,
    state: (lead.uf || '').toUpperCase() || undefined,
    street: lead.fazenda ? `${lead.fazenda}${lead.localizacao ? ` - ${lead.localizacao}` : ''}` : lead.localizacao || undefined
  };
}

const TYPE_KEYWORDS: Record<CrmOrderType, string[]> = {
  CALCARIO_DOLOMITICO: ['dolomit'],
  CALCARIO_CALCITICO: ['calcit'],
  CALCARIO_FILLER: ['filler', 'moido'],
  GESSO_AGRICOLA: ['gesso'],
  BRITA: ['brita'],
  FRETE: ['frete'],
  OUTRO: []
};

/** Sugere o produto do estoque mais parecido com o tipo de pedido do card. */
export function suggestProductForLead(lead: CrmLead, inventory: InventoryItem[]): InventoryItem | undefined {
  const products = sellableInventoryItems(inventory);
  const keys = TYPE_KEYWORDS[lead.tipoPedido] || [];
  return (
    products.find(p => keys.some(k => norm(`${p.id} ${p.name}`).includes(k))) ||
    (lead.tipoPedido.startsWith('CALCARIO') ? products.find(p => norm(p.name).includes('calcario')) : undefined) ||
    products[0]
  );
}

export interface QuoteFromLeadInput {
  lead: CrmLead;
  customer: Customer;
  productId: string;
  quantity: number;
  unitPrice: number;
  sellerName: string;
  inventory: InventoryItem[];
  today: string;
  validUntil: string;
}

/** Orçamento (status BUDGET) pronto para handleAddOrder. Retorna null se não houver item válido. */
export function buildQuoteFromLead(input: QuoteFromLeadInput): Omit<SaleOrder, 'id' | 'reference'> | null {
  const { lead, customer, productId, quantity, unitPrice, inventory } = input;
  const sellable = sellableInventoryItems(inventory);
  const isInter = Boolean(customer.state && customer.state !== 'PA');
  const items = buildItemsFromDrafts(
    [{ lineId: 'crm-line', productId, productDescription: '', quantity: String(quantity), unitPrice: String(unitPrice), ...defaultWarrantyDraft(sellable.find(p => p.id === productId)) }],
    sellable,
    inventory,
    isInter
  );
  if (!items.length) return null;
  const subtotal = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const notesParts = [
    `Origem: CRM de Produtores${lead.fazenda ? ` · ${lead.fazenda}` : ''}`,
    lead.filialNome ? `Filial responsável: ${lead.filialNome}` : '',
    lead.observacoes || ''
  ].filter(Boolean);
  return {
    customerId: customer.id,
    customerName: customer.name,
    customerDocument: customer.document,
    sellerName: input.sellerName,
    date: input.today,
    deliveryDate: input.today,
    validUntil: input.validUntil,
    subtotal,
    discount: 0,
    shipping: 0,
    total: subtotal,
    status: OrderStatus.BUDGET,
    items,
    payments: [],
    receipts: [],
    withdrawals: [],
    notes: notesParts.join('\n')
  } as Omit<SaleOrder, 'id' | 'reference'>;
}
