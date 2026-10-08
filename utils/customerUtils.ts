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

export function resolveCustomerForOrder(customers: Customer[], customerId?: string, order?: any): Customer {
  const found = customers.find(c => c.id === customerId);
  if (found) return normalizeCustomer(found, customerId);

  if (order) {
    const dest = order.nfePayload?.dest;
    const fallbackName = dest?.nome || order.customerName;
    const fallbackDoc = dest?.cpf || dest?.cnpj || order.customerDocument;
    if (fallbackName || fallbackDoc) {
      return {
        id: String(customerId || 'cliente-pendente'),
        name: String(fallbackName || 'Cliente sem nome'),
        document: String(fallbackDoc || ''),
        email: String(dest?.email || ''),
        phone: String(dest?.telefone || ''),
        street: dest?.endereco?.logradouro,
        number: dest?.endereco?.numero,
        neighborhood: dest?.endereco?.bairro,
        city: dest?.endereco?.municipio,
        state: dest?.endereco?.uf,
        zipCode: dest?.endereco?.cep,
        ibgeCode: dest?.endereco?.codigoMunicipio,
        tipoPessoa: dest?.cnpj ? 'PJ' : 'PF',
        totalSpent: Number(order.total) || 0
      };
    }
  }

  return normalizeCustomer(found, customerId);
}
