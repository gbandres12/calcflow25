// services/repo/erpRouter.ts
// Roteador transparente entre modelo legado e novas tabelas erp.* baseado em feature_flags

import { getSupabase } from '../supabaseClient';
import { getModuleMode } from './featureFlags';
import {
  fetchCategoriesFromErp,
  fetchTransportadoresFromErp,
  fetchMachinesFromErp,
  fetchMaintenanceRecordsFromErp,
  fetchFuelRecordsFromErp,
  fetchFuelPurchasesFromErp,
  upsertCategoryToErp,
  upsertTransportadorToErp,
  upsertMachineToErp,
  upsertMaintenanceRecordToErp,
  upsertFuelRecordToErp,
  upsertFuelPurchaseToErp,
  deleteAuxiliaryRecordFromErp
} from './auxiliaryRepo';
import {
  fetchCustomersFromErp,
  upsertCustomerToErp,
  deleteCustomerFromErp
} from './customersRepo';
import {
  fetchProductsFromErp,
  upsertProductToErp,
  deleteProductFromErp,
  fetchStoreItemsFromErp,
  upsertStoreItemToErp,
  deleteStoreItemFromErp
} from './productsRepo';
import {
  fetchAccountsFromErp,
  upsertAccountToErp,
  deleteAccountFromErp,
  fetchTransactionsFromErp,
  upsertTransactionToErp,
  deleteTransactionFromErp
} from './financialRepo';
import {
  fetchOrdersFromErp,
  upsertOrderToErp,
  deleteOrderFromErp
} from './ordersRepo';

const SUPPORTED_TABLES = new Set([
  'categories',
  'transportadores',
  'machines',
  'maintenance_records',
  'fuel_records',
  'fuel_purchases',
  'customers',
  'inventory',
  'store_items',
  'financial_accounts',
  'transactions',
  'sales_orders'
]);

/**
 * Tenta ler diretamente do schema erp.* se o módulo estiver em modo 'new'.
 * Se não estiver em 'new' ou se houver qualquer erro, devolve null para que o
 * fluxo legado assuma sem nenhum ruído para o usuário.
 */
export async function tryReadFromErp(tableName: string, companyId: string): Promise<any[] | null> {
  if (!SUPPORTED_TABLES.has(tableName)) return null;

  try {
    const mode = await getModuleMode(companyId, tableName);
    if (mode !== 'new') return null;

    const supabase = getSupabase();
    if (!supabase) return null;

    switch (tableName) {
      case 'categories':
        return await fetchCategoriesFromErp(companyId, supabase);
      case 'transportadores':
        return await fetchTransportadoresFromErp(companyId, supabase);
      case 'machines':
        return await fetchMachinesFromErp(companyId, supabase);
      case 'maintenance_records':
        return await fetchMaintenanceRecordsFromErp(companyId, supabase);
      case 'fuel_records':
        return await fetchFuelRecordsFromErp(companyId, supabase);
      case 'fuel_purchases':
        return await fetchFuelPurchasesFromErp(companyId, supabase);
      case 'customers':
        return await fetchCustomersFromErp(companyId, supabase);
      case 'inventory':
        return await fetchProductsFromErp(companyId, supabase);
      case 'store_items':
        return await fetchStoreItemsFromErp(companyId, supabase);
      case 'financial_accounts':
        return await fetchAccountsFromErp(companyId, supabase);
      case 'transactions':
        return await fetchTransactionsFromErp(companyId, supabase);
      case 'sales_orders':
        return await fetchOrdersFromErp(companyId, supabase);
      default:
        return null;
    }
  } catch (err) {
    console.warn(`[erpRouter] Falha ao ler '${tableName}' do erp, fallback para o legado:`, err);
    return null;
  }
}

/**
 * Tenta gravar diretamente no schema erp.* se o módulo estiver em modo 'new'.
 * A projeção reversa no banco garante que public.app_records receba a cópia imediatamente.
 */
export async function tryWriteToErp(tableName: string, companyId: string, records: any[]): Promise<boolean> {
  if (!SUPPORTED_TABLES.has(tableName)) return false;

  try {
    const mode = await getModuleMode(companyId, tableName);
    if (mode !== 'new') return false;

    const supabase = getSupabase();
    if (!supabase) return false;

    for (const rec of records) {
      switch (tableName) {
        case 'categories':
          await upsertCategoryToErp(companyId, rec, supabase);
          break;
        case 'transportadores':
          await upsertTransportadorToErp(companyId, rec, supabase);
          break;
        case 'machines':
          await upsertMachineToErp(companyId, rec, supabase);
          break;
        case 'maintenance_records':
          await upsertMaintenanceRecordToErp(companyId, rec, supabase);
          break;
        case 'fuel_records':
          await upsertFuelRecordToErp(companyId, rec, supabase);
          break;
        case 'fuel_purchases':
          await upsertFuelPurchaseToErp(companyId, rec, supabase);
          break;
        case 'customers':
          await upsertCustomerToErp(companyId, rec, supabase);
          break;
        case 'inventory':
          await upsertProductToErp(companyId, rec, supabase);
          break;
        case 'store_items':
          await upsertStoreItemToErp(companyId, rec, supabase);
          break;
        case 'financial_accounts':
          await upsertAccountToErp(companyId, rec, supabase);
          break;
        case 'transactions':
          await upsertTransactionToErp(companyId, rec, supabase);
          break;
        case 'sales_orders':
          await upsertOrderToErp(companyId, rec, supabase);
          break;
      }
    }
    return true;
  } catch (err) {
    console.warn(`[erpRouter] Falha ao gravar '${tableName}' no erp:`, err);
    return false;
  }
}

/**
 * Tenta realizar exclusão lógica no schema erp.* se o módulo estiver em modo 'new'.
 */
export async function tryDeleteFromErp(tableName: string, companyId: string, id: string): Promise<boolean> {
  if (!SUPPORTED_TABLES.has(tableName)) return false;

  try {
    const mode = await getModuleMode(companyId, tableName);
    if (mode !== 'new') return false;

    const supabase = getSupabase();
    if (!supabase) return false;

    if (tableName === 'customers') {
      await deleteCustomerFromErp(companyId, id, supabase);
    } else if (tableName === 'inventory') {
      await deleteProductFromErp(companyId, id, supabase);
    } else if (tableName === 'store_items') {
      await deleteStoreItemFromErp(companyId, id, supabase);
    } else if (tableName === 'financial_accounts') {
      await deleteAccountFromErp(companyId, id, supabase);
    } else if (tableName === 'transactions') {
      await deleteTransactionFromErp(companyId, id, supabase);
    } else if (tableName === 'sales_orders') {
      await deleteOrderFromErp(companyId, id, supabase);
    } else {
      await deleteAuxiliaryRecordFromErp(tableName, companyId, id, supabase);
    }
    return true;
  } catch (err) {
    console.warn(`[erpRouter] Falha ao excluir '${tableName}' no erp:`, err);
    return false;
  }
}
