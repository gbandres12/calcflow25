import { Customer } from '../types';

/** Garante objeto Customer válido para modais fiscais (evita tela branca). */
export function normalizeCustomer(input?: Customer | null, fallbackId?: string): Customer {
  if (input && typeof input === 'object' && input.id) {
    return {
      ...input,
      id: String(input.id),
      name: String(input.name || 'Cliente sem nome'),
      document: String(input.document ?? ''),
      email: String(input.email ?? ''),
      phone: String(input.phone ?? ''),
      totalSpent: Number(input.totalSpent) || 0
    };
  }
  return {
    id: String(fallbackId || 'cliente-pendente'),
    name: 'Cliente não cadastrado',
    document: '',
    email: '',
    phone: '',
    totalSpent: 0
  };
}

export function resolveCustomerForOrder(customers: Customer[], customerId?: string): Customer {
  const found = customers.find(c => c.id === customerId);
  return normalizeCustomer(found, customerId);
}
