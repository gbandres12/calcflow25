import type { Product, StoreItem } from '../../types';

export function assembleProduct(row: any): Product {
  const extra = row.extra || {};
  return {
    ...extra,
    id: row.id,
    companyId: row.company_id,
    code: row.code || extra.code || '',
    name: row.name || extra.name || 'Sem nome',
    unit: row.unit || extra.unit || 'Ton',
    category: row.category || extra.category || undefined,
    quantity: Number(row.quantity != null ? row.quantity : (extra.quantity || 0)),
    minStock: Number(row.min_stock != null ? row.min_stock : (extra.minStock || 0)),
    costPrice: Number(row.cost_price != null ? row.cost_price : (extra.costPrice || 0)),
    unitPrice: Number(row.unit_price != null ? row.unit_price : (extra.unitPrice || 0)),
    ncm: row.ncm || extra.ncm || undefined,
    cst: row.cst || extra.cst || undefined,
    cfop: row.cfop || extra.cfop || undefined,
    origem: row.origem || extra.origem || undefined,
    aliquotaIcms: row.aliquota_icms != null ? Number(row.aliquota_icms) : (extra.aliquotaIcms != null ? Number(extra.aliquotaIcms) : undefined),
    aliquotaPis: row.aliquota_pis != null ? Number(row.aliquota_pis) : (extra.aliquotaPis != null ? Number(extra.aliquotaPis) : undefined),
    aliquotaCofins: row.aliquota_cofins != null ? Number(row.aliquota_cofins) : (extra.aliquotaCofins != null ? Number(extra.aliquotaCofins) : undefined),
    unidadeTributavel: row.unidade_tributavel || extra.unidadeTributavel || undefined,
    observacoesFiscais: row.observacoes_fiscais || extra.observacoesFiscais || undefined
  };
}

export async function fetchProductsFromErp(companyId: string, supabase: any): Promise<Product[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null);

  if (error) throw error;
  return (data || []).map(assembleProduct);
}

export async function upsertProductToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const {
    id, code, name, unit, category, quantity, minStock,
    costPrice, unitPrice, ncm, cst, cfop, origem,
    aliquotaIcms, aliquotaPis, aliquotaCofins,
    unidadeTributavel, observacoesFiscais,
    ...extra
  } = record;

  const { error } = await supabase
    .schema('erp')
    .from('products')
    .upsert({
      company_id: companyId,
      id: String(id),
      code: code || '',
      name: name || 'Sem nome',
      unit: unit || 'Ton',
      category: category || null,
      quantity: Number(quantity || 0),
      min_stock: Number(minStock || 0),
      cost_price: Number(costPrice || 0),
      unit_price: Number(unitPrice || 0),
      ncm: ncm || null,
      cst: cst || null,
      cfop: cfop || null,
      origem: origem || null,
      aliquota_icms: aliquotaIcms != null ? Number(aliquotaIcms) : null,
      aliquota_pis: aliquotaPis != null ? Number(aliquotaPis) : null,
      aliquota_cofins: aliquotaCofins != null ? Number(aliquotaCofins) : null,
      unidade_tributavel: unidadeTributavel || null,
      observacoes_fiscais: observacoesFiscais || null,
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });

  if (error) throw error;
}

export async function deleteProductFromErp(companyId: string, id: string, supabase: any): Promise<void> {
  const { error } = await supabase
    .schema('erp')
    .from('products')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);

  if (error) throw error;
}

export function assembleStoreItem(row: any): StoreItem {
  const extra = row.extra || {};
  return {
    ...extra,
    id: row.id,
    companyId: row.company_id,
    name: row.name || extra.name || 'Sem nome',
    category: row.category || extra.category || 'Peças',
    unit: row.unit || extra.unit || 'UN',
    quantity: Number(row.quantity != null ? row.quantity : (extra.quantity || 0)),
    minStock: Number(row.min_stock != null ? row.min_stock : (extra.minStock || 0)),
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : (extra.unitCost != null ? Number(extra.unitCost) : undefined),
    supplierSku: row.supplier_sku || extra.supplierSku || undefined,
    supplierCnpj: row.supplier_cnpj || extra.supplierCnpj || undefined,
    ncm: row.ncm || extra.ncm || undefined,
    status: row.status || extra.status || 'ativo'
  };
}

export async function fetchStoreItemsFromErp(companyId: string, supabase: any): Promise<StoreItem[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('store_items')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null);

  if (error) throw error;
  return (data || []).map(assembleStoreItem);
}

export async function upsertStoreItemToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const {
    id, name, category, unit, quantity, minStock, unitCost,
    supplierSku, supplierCnpj, ncm, status, ...extra
  } = record;

  const { error } = await supabase
    .schema('erp')
    .from('store_items')
    .upsert({
      company_id: companyId,
      id: String(id),
      name: name || 'Sem nome',
      category: category || 'Peças',
      unit: unit || 'UN',
      quantity: Number(quantity || 0),
      min_stock: Number(minStock || 0),
      unit_cost: unitCost != null ? Number(unitCost) : null,
      supplier_sku: supplierSku || null,
      supplier_cnpj: supplierCnpj || null,
      ncm: ncm || null,
      status: status || 'ativo',
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });

  if (error) throw error;
}

export async function deleteStoreItemFromErp(companyId: string, id: string, supabase: any): Promise<void> {
  const { error } = await supabase
    .schema('erp')
    .from('store_items')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);

  if (error) throw error;
}
