import { getSupabase } from '../supabaseClient';

export const erpOperations = {
  /**
   * Adiciona um recibo diretamente na tabela erp.sales_order_receipts de forma atômica e idempotente.
   */
  async addReceipt(params: {
    id: string;
    companyId: string;
    orderId: string;
    amount: number;
    date?: string;
    method?: string;
    accountId?: string;
    receivedBy?: string;
    notes?: string;
    extra?: any;
  }): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { data, error } = await supabase.schema('erp').rpc('add_receipt', {
      p_id: params.id,
      p_company_id: params.companyId,
      p_order_id: params.orderId,
      p_amount: params.amount,
      p_date: params.date || new Date().toISOString().split('T')[0],
      p_method: params.method || 'PIX',
      p_account_id: params.accountId || null,
      p_received_by: params.receivedBy || null,
      p_notes: params.notes || null,
      p_extra: params.extra || {}
    });

    if (error) {
      console.warn('[erpOperations] Falha ao adicionar recibo no banco:', error);
      throw error;
    }
    return Boolean(data);
  },

  /**
   * Registra uma retirada/pesagem diretamente em erp.sales_order_withdrawals de forma atômica.
   */
  async addWithdrawal(params: {
    id: string;
    companyId: string;
    orderId: string;
    netWeight: number;
    truckPlate?: string;
    driverName?: string;
    carrierName?: string;
    ticketNumber?: string;
    notes?: string;
    extra?: any;
  }): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { data, error } = await supabase.schema('erp').rpc('add_withdrawal', {
      p_id: params.id,
      p_company_id: params.companyId,
      p_order_id: params.orderId,
      p_net_weight: params.netWeight,
      p_truck_plate: params.truckPlate || null,
      p_driver_name: params.driverName || null,
      p_carrier_name: params.carrierName || null,
      p_ticket_number: params.ticketNumber || null,
      p_notes: params.notes || null,
      p_extra: params.extra || {}
    });

    if (error) {
      console.warn('[erpOperations] Falha ao registrar retirada no banco:', error);
      throw error;
    }
    return Boolean(data);
  },

  /**
   * Registra movimentação de estoque atômica no livro imutável erp.stock_movements.
   */
  async stockMove(params: {
    id: string;
    companyId: string;
    itemKind: 'product' | 'store_item';
    itemId: string;
    delta: number;
    reason: string;
    sourceTable?: string;
    sourceId?: string;
  }): Promise<number> {
    const supabase = getSupabase();
    if (!supabase) return 0;

    const { data, error } = await supabase.schema('erp').rpc('stock_move', {
      p_id: params.id,
      p_company_id: params.companyId,
      p_item_kind: params.itemKind,
      p_item_id: params.itemId,
      p_delta: params.delta,
      p_reason: params.reason,
      p_source_table: params.sourceTable || null,
      p_source_id: params.sourceId || null
    });

    if (error) {
      console.warn('[erpOperations] Falha ao movimentar estoque no banco:', error);
      throw error;
    }
    return Number(data || 0);
  },

  /**
   * Obtém o próximo número de sequência de forma atômica para a empresa e tipo.
   */
  async nextSequence(companyId: string, kind: string, year?: number): Promise<number> {
    const supabase = getSupabase();
    if (!supabase) return Date.now();

    const currentYear = year || new Date().getFullYear();
    const { data, error } = await supabase.schema('erp').rpc('next_sequence', {
      p_company_id: companyId,
      p_kind: kind,
      p_year: currentYear
    });

    if (error) {
      console.warn('[erpOperations] Falha ao obter sequência atômica:', error);
      throw error;
    }
    return Number(data || 1);
  }
};
