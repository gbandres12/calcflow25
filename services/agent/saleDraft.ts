/**
 * Slots da entrevista de pedido/NF-e no Telegram.
 * Persistidos em telegram_sale_drafts; injetados no system prompt a cada turno.
 */

export type SaleDraftIntent = 'pedido' | 'nfe' | 'ambos';
export type SaleDraftDestino = 'orcamento' | 'confirmado';

export interface SaleDraftItem {
  productId: string;
  productName?: string;
  quantity: number;
  unit?: string;
  unitPrice?: number;
}

export interface SaleDraftSlots {
  intent?: SaleDraftIntent;
  customerId?: string;
  customerLabel?: string;
  itens?: SaleDraftItem[];
  aceitarEstoqueCritico?: boolean;
  frete?: string | number;
  observacao?: string;
  destino?: SaleDraftDestino;
  emitirNfe?: boolean;
  natureza?: string;
  cfop?: string;
  pedidoRef?: string;
}

export function formatSaleDraftForPrompt(slots?: SaleDraftSlots | null): string {
  if (!slots || !Object.keys(slots).length) {
    return 'Rascunho da venda: (vazio — comece pela intenção e pelo cliente).';
  }
  return `Rascunho da venda (slots já preenchidos; não reinvente o que já está aqui):\n${JSON.stringify(slots, null, 0)}`;
}

export function mergeSaleDraft(
  current: SaleDraftSlots | null | undefined,
  patch: Partial<SaleDraftSlots>
): SaleDraftSlots {
  const base: SaleDraftSlots = { ...(current || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    (base as any)[key] = value;
  }
  return base;
}
