// services/repo/auxiliaryRepo.ts
// Assemblers e fetchers para tabelas auxiliares e frota (Lote 1 de migração)

export function assembleCategory(row: any) {
  return {
    ...(row.extra || {}),
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    type: row.type
  };
}

export function assembleTransportador(row: any) {
  return {
    ...(row.extra || {}),
    id: row.id,
    companyId: row.company_id,
    nome: row.nome,
    documento: row.documento,
    tipoServico: row.tipo_servico,
    contratacao: row.contratacao,
    ie: row.ie,
    telefone: row.telefone,
    email: row.email,
    endereco: row.endereco,
    cidade: row.cidade,
    uf: row.uf,
    rntrc: row.rntrc,
    cnh: row.cnh,
    categoriaCnh: row.categoria_cnh,
    validadeCnh: row.validade_cnh,
    placa: row.placa,
    ufPlaca: row.uf_placa,
    modeloVeiculo: row.modelo_veiculo,
    ativo: row.ativo,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function assembleMachine(row: any) {
  return {
    ...(row.extra || {}),
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    type: row.type,
    plateOrId: row.plate_or_id,
    currentHorimeter: Number(row.current_horimeter || 0),
    status: row.status,
    lastMaintenance: row.last_maintenance,
    updatedAt: row.updated_at
  };
}

export function assembleMaintenanceRecord(row: any) {
  return {
    ...(row.extra || {}),
    id: row.id,
    companyId: row.company_id,
    machineId: row.machine_id,
    date: row.date,
    description: row.description,
    cost: Number(row.cost || 0),
    type: row.type,
    horimeter: Number(row.horimeter || 0),
    updatedAt: row.updated_at
  };
}

export function assembleFuelRecord(row: any) {
  return {
    ...(row.extra || {}),
    id: row.id,
    companyId: row.company_id,
    machineId: row.machine_id,
    date: row.date,
    liters: Number(row.liters || 0),
    pricePerLiter: Number(row.price_per_liter || 0),
    totalCost: Number(row.total_cost || 0),
    horimeter: Number(row.horimeter || 0),
    fuelType: row.fuel_type,
    updatedAt: row.updated_at
  };
}

export function assembleFuelPurchase(row: any) {
  return {
    ...(row.extra || {}),
    id: row.id,
    companyId: row.company_id,
    date: row.date,
    liters: Number(row.liters || 0),
    pricePerLiter: Number(row.price_per_liter || 0),
    totalCost: Number(row.total_cost || 0),
    supplier: row.supplier,
    fuelType: row.fuel_type,
    updatedAt: row.updated_at
  };
}

export async function fetchCategoriesFromErp(companyId: string, supabase: any): Promise<any[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('categories')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data || []).map(assembleCategory);
}

export async function fetchTransportadoresFromErp(companyId: string, supabase: any): Promise<any[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('transportadores')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data || []).map(assembleTransportador);
}

export async function fetchMachinesFromErp(companyId: string, supabase: any): Promise<any[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('machines')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data || []).map(assembleMachine);
}

export async function fetchMaintenanceRecordsFromErp(companyId: string, supabase: any): Promise<any[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('maintenance_records')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data || []).map(assembleMaintenanceRecord);
}

export async function fetchFuelRecordsFromErp(companyId: string, supabase: any): Promise<any[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('fuel_records')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data || []).map(assembleFuelRecord);
}

export async function fetchFuelPurchasesFromErp(companyId: string, supabase: any): Promise<any[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('fuel_purchases')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data || []).map(assembleFuelPurchase);
}

export async function upsertCategoryToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const { id, name, type, ...extra } = record;
  const { error } = await supabase
    .schema('erp')
    .from('categories')
    .upsert({
      company_id: companyId,
      id: String(id),
      name: name || 'Sem nome',
      type: type || 'OUTFLOW',
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });
  if (error) throw error;
}

export async function upsertTransportadorToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const {
    id, nome, documento, tipoServico, contratacao, ie, telefone, email,
    endereco, cidade, uf, rntrc, cnh, categoriaCnh, validadeCnh, placa,
    ufPlaca, modeloVeiculo, ativo, ...extra
  } = record;
  const { error } = await supabase
    .schema('erp')
    .from('transportadores')
    .upsert({
      company_id: companyId,
      id: String(id),
      nome: nome || 'Sem nome',
      documento: documento || '',
      tipo_servico: tipoServico || 'FRETE_VENDA',
      contratacao: contratacao || 'CIF',
      ie: ie || null,
      telefone: telefone || null,
      email: email || null,
      endereco: endereco || null,
      cidade: cidade || null,
      uf: uf || null,
      rntrc: rntrc || null,
      cnh: cnh || null,
      categoria_cnh: categoriaCnh || null,
      validade_cnh: validadeCnh || null,
      placa: placa || '',
      uf_placa: ufPlaca || null,
      modelo_veiculo: modeloVeiculo || null,
      ativo: ativo !== false,
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });
  if (error) throw error;
}

export async function upsertMachineToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const { id, name, type, plateOrId, currentHorimeter, status, lastMaintenance, ...extra } = record;
  const { error } = await supabase
    .schema('erp')
    .from('machines')
    .upsert({
      company_id: companyId,
      id: String(id),
      name: name || 'Sem nome',
      type: type || 'Outros',
      plate_or_id: plateOrId || '',
      current_horimeter: Number(currentHorimeter || 0),
      status: status || 'Operacional',
      last_maintenance: lastMaintenance || null,
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });
  if (error) throw error;
}

export async function upsertMaintenanceRecordToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const { id, machineId, date, description, cost, type, horimeter, ...extra } = record;
  const { error } = await supabase
    .schema('erp')
    .from('maintenance_records')
    .upsert({
      company_id: companyId,
      id: String(id),
      machine_id: machineId || '',
      date: date || new Date().toISOString().split('T')[0],
      description: description || '',
      cost: Number(cost || 0),
      type: type || 'Preventiva',
      horimeter: Number(horimeter || 0),
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });
  if (error) throw error;
}

export async function upsertFuelRecordToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const { id, machineId, date, liters, pricePerLiter, totalCost, horimeter, fuelType, ...extra } = record;
  const { error } = await supabase
    .schema('erp')
    .from('fuel_records')
    .upsert({
      company_id: companyId,
      id: String(id),
      machine_id: machineId || '',
      date: date || new Date().toISOString().split('T')[0],
      liters: Number(liters || 0),
      price_per_liter: Number(pricePerLiter || 0),
      total_cost: Number(totalCost || 0),
      horimeter: Number(horimeter || 0),
      fuel_type: fuelType || 'DIESEL_S10',
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });
  if (error) throw error;
}

export async function upsertFuelPurchaseToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const { id, date, liters, pricePerLiter, totalCost, supplier, fuelType, ...extra } = record;
  const { error } = await supabase
    .schema('erp')
    .from('fuel_purchases')
    .upsert({
      company_id: companyId,
      id: String(id),
      date: date || new Date().toISOString().split('T')[0],
      liters: Number(liters || 0),
      price_per_liter: Number(pricePerLiter || 0),
      total_cost: Number(totalCost || 0),
      supplier: supplier || '',
      fuel_type: fuelType || 'DIESEL_S10',
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });
  if (error) throw error;
}

export async function deleteAuxiliaryRecordFromErp(tableName: string, companyId: string, id: string, supabase: any): Promise<void> {
  const { error } = await supabase
    .schema('erp')
    .from(tableName)
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw error;
}
