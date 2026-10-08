import type { Customer } from '../../types';

export function assembleCustomer(row: any): Customer {
  const extra = row.extra || {};
  return {
    ...extra,
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    document: row.document || '',
    tipoPessoa: row.tipo_pessoa || 'PJ',
    ie: row.ie || undefined,
    isentoIE: Boolean(row.isento_ie),
    phone: row.phone || '',
    email: row.email || '',
    street: row.street || '',
    number: row.number || '',
    neighborhood: row.neighborhood || '',
    city: row.city || '',
    state: row.state || '',
    zipCode: row.zip_code || '',
    ibgeCode: row.ibge_code || '',
    status: row.status || 'Ativo',
    notes: row.notes || undefined,
    totalSpent: Number(row.total_spent || 0),
    updatedAt: row.updated_at || extra.updatedAt
  };
}

export async function fetchCustomersFromErp(companyId: string, supabase: any): Promise<Customer[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('customers')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null);

  if (error) throw error;
  return (data || []).map(assembleCustomer);
}

export async function upsertCustomerToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const {
    id, name, document, tipoPessoa, ie, isentoIE, phone, email,
    street, number, neighborhood, city, state, zipCode, ibgeCode,
    status, notes, totalSpent, ...extra
  } = record;

  const { error } = await supabase
    .schema('erp')
    .from('customers')
    .upsert({
      company_id: companyId,
      id: String(id),
      name: name || 'Sem nome',
      document: document || '',
      tipo_pessoa: tipoPessoa || 'PJ',
      ie: ie || null,
      isento_ie: Boolean(isentoIE),
      phone: phone || null,
      email: email || null,
      street: street || null,
      number: number || null,
      neighborhood: neighborhood || null,
      city: city || null,
      state: state || null,
      zip_code: zipCode || null,
      ibge_code: ibgeCode || null,
      status: status || 'Ativo',
      notes: notes || null,
      total_spent: Number(totalSpent || 0),
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });

  if (error) throw error;
}

export async function deleteCustomerFromErp(companyId: string, id: string, supabase: any): Promise<void> {
  const { error } = await supabase
    .schema('erp')
    .from('customers')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);

  if (error) throw error;
}

