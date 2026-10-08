-- Migration: 025_nfe_protection_and_cleanup_deleted_orders.sql
-- 1. Proteção absoluta das Notas Fiscais (NF-e):
--    - Remove ON DELETE CASCADE de erp.sales_order_nfes.
--    - Adiciona ON DELETE RESTRICT para impedir que qualquer pedido com NF-e seja apagado no banco.
--    - Garante que NF-es nunca sejam perdidas nem desvinculadas acidentalmente.
-- 2. Limpeza e exclusão lógica de pedidos duplicados/antigos já excluídos pelo usuário:
--    - PED-2026-0043 preliminar (ord-muikit0i-uzq0uq), mantendo o definitivo (ord-muld5yf5-8vx18a).
--    - PED-2026-0045 preliminar (ord-muldrvf3-30xhgg), unificando financeiro no definitivo PED-2026-0044 (ord-muldnvyj-tcrnpi).
--    - PED-2026-0037 duplicado com valor divergente (ord-mucyefgb-mfpwgt), mantendo o correto (ord-mud33npc-4py6ep).
-- 3. Limpeza de cadastros de clientes duplicados/em branco sem pedidos vinculados.

-- ============================================================================
-- 1. PROTEÇÃO ESTRUTURAL DAS NOTAS FISCAIS CONTRA EXCLUSÃO (ZERO LOSS)
-- ============================================================================

DO $$
BEGIN
  -- Remover constraint antiga com ON DELETE CASCADE se existir
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sales_order_nfes_company_id_order_id_fkey' 
      AND conrelid = 'erp.sales_order_nfes'::regclass
  ) THEN
    ALTER TABLE erp.sales_order_nfes 
      DROP CONSTRAINT sales_order_nfes_company_id_order_id_fkey;
  END IF;

  -- Tornar order_id anulável para que se um pedido for arquivado a nota continue existindo
  ALTER TABLE erp.sales_order_nfes 
    ALTER COLUMN order_id DROP NOT NULL;

  -- Adicionar nova constraint com ON DELETE RESTRICT
  -- Impede expressamente que qualquer exclusão de pedido apague uma nota fiscal emitida
  ALTER TABLE erp.sales_order_nfes 
    ADD CONSTRAINT sales_order_nfes_company_id_order_id_fkey 
    FOREIGN KEY (company_id, order_id) 
    REFERENCES erp.sales_orders(company_id, id) 
    ON DELETE RESTRICT;
END $$;


-- ============================================================================
-- 2. SANEAMENTO DOS PEDIDOS DUPLICADOS/CANCELADOS
-- ============================================================================

-- 2.1 PED-2026-0043: soft-delete do preliminar ord-muikit0i-uzq0uq
UPDATE erp.sales_orders 
SET deleted_at = now(), updated_at = now()
WHERE id = 'ord-muikit0i-uzq0uq' AND deleted_at IS NULL;

UPDATE erp.transactions
SET deleted_at = now(), updated_at = now()
WHERE id = 'tx-muikki06-fh7qwt' AND deleted_at IS NULL;

DELETE FROM public.app_records
WHERE table_name = 'sales_orders' AND id = 'ord-muikit0i-uzq0uq';

DELETE FROM public.app_records
WHERE table_name = 'transactions' AND id = 'tx-muikki06-fh7qwt';


-- 2.2 PED-2026-0037: soft-delete do preliminar ord-mucyefgb-mfpwgt (57.492,50)
UPDATE erp.sales_orders 
SET deleted_at = now(), updated_at = now()
WHERE id = 'ord-mucyefgb-mfpwgt' AND deleted_at IS NULL;

UPDATE erp.transactions
SET deleted_at = now(), updated_at = now()
WHERE id = 'tx-mucyefgh-hi3hc8' AND deleted_at IS NULL;

DELETE FROM public.app_records
WHERE table_name = 'sales_orders' AND id = 'ord-mucyefgb-mfpwgt';

DELETE FROM public.app_records
WHERE table_name = 'transactions' AND id = 'tx-mucyefgh-hi3hc8';


-- 2.3 PED-2026-0045 x PED-2026-0044:
-- Migrar o lançamento financeiro existente de 143.000 para o PED-2026-0044 real
UPDATE erp.transactions
SET order_id = 'ord-muldnvyj-tcrnpi',
    description = 'Venda Faturada #PED-2026-0044',
    updated_at = now()
WHERE id = 'tx-mulnrdbw-4n2i0r';

UPDATE erp.sales_orders
SET without_finance = false, updated_at = now()
WHERE id = 'ord-muldnvyj-tcrnpi';

-- Soft delete do rascunho ord-muldrvf3-30xhgg (PED-2026-0045)
UPDATE erp.sales_orders 
SET deleted_at = now(), updated_at = now()
WHERE id = 'ord-muldrvf3-30xhgg' AND deleted_at IS NULL;

DELETE FROM public.app_records
WHERE table_name = 'sales_orders' AND id = 'ord-muldrvf3-30xhgg';


-- ============================================================================
-- 3. SANEAMENTO DE CADASTROS DE CLIENTES EM BRANCO / DUPLICADOS SEM PEDIDOS
-- ============================================================================

UPDATE erp.customers
SET deleted_at = now(), updated_at = now()
WHERE id IN (
  'cust-mtt41mjs-fhk9fv', -- DARI JOSE SANTI sem documento
  'cust-mtt41mjs-lwe5dt', -- LEONE BAZANELLA sem documento
  'cust-mtt41mjs-ho8bk1', -- LEONIR ALBANI sem documento
  'cust-mtt41mjs-imgdym', -- LUCAS BEZERRA duplicado sem doc
  'cust-mtt41mjs-xbq745', -- LUIZ FERNANDO MASIERO sem doc
  'cust-muln6kse-7tbkgj', -- MÁRCIO ANTONIO CEZAROTTO com CPF digitado errado no primeiro teste
  'cust-mtt4mchu-dknhe3'  -- Gabriel Andres duplicado
)
AND NOT EXISTS (
  SELECT 1 FROM erp.sales_orders so WHERE so.customer_id = erp.customers.id AND so.deleted_at IS NULL
);

DELETE FROM public.app_records
WHERE table_name = 'customers'
  AND id IN (
    'cust-mtt41mjs-fhk9fv',
    'cust-mtt41mjs-lwe5dt',
    'cust-mtt41mjs-ho8bk1',
    'cust-mtt41mjs-imgdym',
    'cust-mtt41mjs-xbq745',
    'cust-muln6kse-7tbkgj',
    'cust-mtt4mchu-dknhe3'
  );
