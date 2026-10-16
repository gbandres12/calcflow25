-- ============================================================================
-- MIGRATION 030: Colunas extras em erp.sales_order_nfes e erp.transaction_payments
-- Garante persistência nativa de metadados de NF-es parciais e flag de abatimento
-- ============================================================================

ALTER TABLE erp.sales_order_nfes
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE erp.transaction_payments
  ADD COLUMN IF NOT EXISTS is_discount_or_deduction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;
