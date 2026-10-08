import { getSupabase } from '../supabaseClient';
import { getModuleMode } from './featureFlags';
import {
  fetchCategoriesFromErp,
  fetchTransportadoresFromErp,
  fetchMachinesFromErp,
  fetchMaintenanceRecordsFromErp,
  fetchFuelRecordsFromErp,
  fetchFuelPurchasesFromErp
} from './auxiliaryRepo';
import { fetchCustomersFromErp } from './customersRepo';
import { fetchProductsFromErp } from './productsRepo';
import { fetchAccountsFromErp, fetchTransactionsFromErp } from './financialRepo';
import { fetchOrdersFromErp } from './ordersRepo';

/**
 * Executa comparação assíncrona em modo 'shadow' sem bloquear o fluxo do aplicativo.
 * Se houver qualquer discrepância entre o legado (public.app_records) e as novas
 * tabelas (erp.*), emite aviso detalhado para auditoria.
 */
export function triggerShadowComparison(tableName: string, companyId: string, legacyRecords: any[]) {
  if (!companyId || !tableName || !Array.isArray(legacyRecords)) return;

  // Background assíncrono estritamente protegido
  (async () => {
    try {
      const mode = await getModuleMode(companyId, tableName);
      if (mode !== 'shadow') return;

      const supabase = getSupabase();
      if (!supabase) return;

      let erpRecords: any[] = [];
      switch (tableName) {
        case 'categories':
          erpRecords = await fetchCategoriesFromErp(companyId, supabase);
          break;
        case 'transportadores':
          erpRecords = await fetchTransportadoresFromErp(companyId, supabase);
          break;
        case 'machines':
          erpRecords = await fetchMachinesFromErp(companyId, supabase);
          break;
        case 'maintenance_records':
          erpRecords = await fetchMaintenanceRecordsFromErp(companyId, supabase);
          break;
        case 'fuel_records':
          erpRecords = await fetchFuelRecordsFromErp(companyId, supabase);
          break;
        case 'fuel_purchases':
          erpRecords = await fetchFuelPurchasesFromErp(companyId, supabase);
          break;
        case 'customers':
          erpRecords = await fetchCustomersFromErp(companyId, supabase);
          break;
        case 'inventory':
          erpRecords = await fetchProductsFromErp(companyId, supabase);
          break;
        case 'financial_accounts':
          erpRecords = await fetchAccountsFromErp(companyId, supabase);
          break;
        case 'transactions':
          erpRecords = await fetchTransactionsFromErp(companyId, supabase);
          break;
        case 'sales_orders':
          erpRecords = await fetchOrdersFromErp(companyId, supabase);
          break;
        default:
          return;
      }

      const legacyClean = legacyRecords.filter(r => r.id !== '__seed__' && !r.__isSeedMeta);
      const diffCount = Math.abs(legacyClean.length - erpRecords.length);

      if (diffCount > 0) {
        console.warn(
          `[ERP Shadow Parity] Divergência em '${tableName}' (${companyId}): Legado=${legacyClean.length}, ERP=${erpRecords.length}`
        );
      }
    } catch (err) {
      // Falhas no shadow mode NUNCA devem quebrar a aplicação
      console.warn(`[ERP Shadow Parity] Erro não-bloqueante ao comparar '${tableName}':`, err);
    }
  })();
}
