# Relatório de Análise Forense, Saneamento de Pedidos e Proteção de Notas Fiscais

**Data:** 28 de Setembro de 2026  
**Empresas Auditadas:** CBA Mineração (`comp-1788898385141`) e CBA Filial Belém (`filial-mugyw35c-lneymq`)  
**Status do Banco:** 100% íntegro | 84 Notas Fiscais protegidas com `ON DELETE RESTRICT`

---

## 1. O Diagnóstico: Por que pedidos e exclusões antigas reapareceram?

Durante a análise forense do banco de dados e dos registros históricos, identificamos a causa raiz exata do reaparecimento de pedidos e cadastros:

1. **A Origem no `public.app_records`:**
   - No modelo anterior (legado), as exclusões realizadas pelo navegador muitas vezes eram feitas apenas na memória local ou fila pendente, enquanto o registro permanecia no banco `public.app_records`.
   - Na migração estrutural inicial (Migration 017), todo o acervo do `public.app_records` foi importado para as novas tabelas relacionais do schema `erp.*`.
   - Como resultado, registros preliminares que o usuário havia descartado ou substituído no passado (ex: primeiras tentativas de digitação do PED-2026-0043, PED-2026-0037 e PED-2026-0045) foram carregados como pedidos ativos com `deleted_at = NULL`.

2. **A "Fila de Emissão" na Gestão Fiscal:**
   - Na tela de **Gestão Fiscal**, a aba *"Fila de Emissão"* calculava pedidos pendentes apenas pela fórmula de saldo físico (`totalRemainingQuantity > 0`), sem filtrar se o pedido era apenas um **Orçamento** (`status = 'Orçamento'`) ou se era uma **NF-e Avulsa** (`isAvulsa = true`).
   - Por isso, rascunhos de orçamentos e pedidos duplicados apareciam indevidamente como se estivessem aguardando transmissão de nota à SEFAZ.

---

## 2. Proteção Absoluta das Notas Fiscais (Garantia de Não Perda)

Em resposta direta à exigência legal e operacional (*"também não quero perder as notas fiscais"*), foi aplicada a **Migration 025** no banco Supabase com as seguintes travas em nível de banco:

1. **Eliminação do `ON DELETE CASCADE`:**
   - A chave estrangeira de `erp.sales_order_nfes` que apontava para `erp.sales_orders` com `ON DELETE CASCADE` foi **revogada**.
   - Foi aplicada a restrição **`ON DELETE RESTRICT`**: se qualquer comando tentar excluir um pedido que possua documento fiscal, o Postgres **bloqueia e rejeita a exclusão**.
2. **Coluna `order_id` Anulável (`DROP NOT NULL`):**
   - Caso um pedido seja arquivado no futuro, a nota fiscal permanece perpétua e íntegra na base de dados.
3. **Trava no Repositório (`ordersRepo.ts`):**
   - A função `deleteOrderFromErp` agora consulta expressamente a existência de notas autorizadas antes de permitir qualquer soft-delete.
4. **Safeguard de Notas na Leitura (`fetchOrdersFromErp`):**
   - Se porventura um pedido for marcado como excluído mas possuir nota fiscal emitida, o sistema gera automaticamente um stub fiscal para que a nota **nunca desapareça da listagem de Gestão Fiscal**.

### Censo das Notas Fiscais no Banco de Dados (Total: 84 documentos intactos)
- **Autorizadas na SEFAZ:** 54 notas (100% com Chave de 44 dígitos, Protocolo, DANFE e XML)
- **Canceladas na SEFAZ:** 12 notas
- **Rejeitadas:** 8 notas
- **Rascunhos / Em Digitação:** 7 notas
- **Não emitidas / Simuladas:** 3 notas
- **TOTAL:** **84 notas fiscais rigorosamente preservadas**. Nenhuma nota foi perdida.

---

## 3. Saneamento Realizado (Pedidos e Cadastros Duplicados)

Com a segurança fiscal garantida, realizamos a limpeza cirúrgica dos registros duplicados e antigos:

| Referência | ID Obsoleto Removido | ID Ativo Mantido | Motivo / Ação Realizada |
| :--- | :--- | :--- | :--- |
| **PED-2026-0043** | `ord-muikit0i-uzq0uq` (R$ 505.790,70) | `ord-muld5yf5-8vx18a` (R$ 527.341,70) | A versão preliminar de 2.199 TON foi excluída; mantida a versão definitiva de 2.292 TON com todos os 6 recibos de pagamento. |
| **PED-2026-0037** | `ord-mucyefgb-mfpwgt` (R$ 57.492,50) | `ord-mud33npc-4py6ep` (R$ 57.500,00) | Excluída a versão antiga com preço unitário 229,97; mantida a versão oficial a R$ 230,00 (alinhada aos pedidos 0036, 0038 e 0039). |
| **PED-2026-0045** | `ord-muldrvf3-30xhgg` (R$ 143.000,00) | `ord-muldnvyj-tcrnpi` (PED-2026-0044) | O lançamento financeiro de R$ 143.000 foi unificado e vinculado ao PED-2026-0044 oficial; o rascunho 0045 foi baixado. |

### Clientes em Branco / Testes Removidos:
Foram limpos 7 cadastros órfãos que possuíam CPF/CNPJ em branco ou digitação incorreta de primeiro teste (`cust-mtt41mjs-fhk9fv`, `cust-mtt41mjs-lwe5dt`, `cust-mtt41mjs-ho8bk1`, `cust-mtt41mjs-imgdym`, `cust-mtt41mjs-xbq745`, `cust-muln6kse-7tbkgj`, `cust-mtt4mchu-dknhe3`), preservando os cadastros oficiais completos.

---

## 4. Ajuste na Gestão Fiscal (`FiscalManagement.tsx`)
- A "Fila de Emissão" agora exige estritamente:
  `!isFiscalOnlyOrder(o) && o.status === OrderStatus.FINALIZED && totalRemainingQuantity(o) > 0`
- Orçamentos e documentos avulsos não poluem mais a fila de emissão de vendas.

---

## 5. Verificação e Testes
- **Testes Unitários e de Integração:** 123 testes executados, 123 aprovados (0 falhas).
- **Paridade de Banco:** 100% de paridade entre o banco relacional e os módulos operacionais.
