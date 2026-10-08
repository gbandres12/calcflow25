# Relatório Completo de Migração e Modernização do Banco de Dados
## CalcFlow25 — Transição de Arquitetura: Monolito JSON (`public.app_records`) ➔ Modelo Relacional Especializado (`erp.*`)

**Data de Conclusão:** 28 de Setembro de 2026  
**Responsável Técnico:** Antigravity (Google DeepMind Agentic Pair Programming)  
**Ambiente:** Supabase PostgreSQL (`qbnmtimnurbciuzqtlxd`) + Aplicação CalcFlow25 (React / TypeScript / Node.js)  
**Status Final:** **Fases 0 a 5 Concluídas com 100% de Paridade e 0 Conflitos.**

---

## 1. Sumário Executivo e Objetivos

O CalcFlow25 operava historicamente sobre uma tabela única genérica chamada `public.app_records`, na qual todas as entidades do sistema (clientes, produtos, pedidos, pagamentos, contas financeiras, máquinas, etc.) eram salvas como documentos JSONB semi-estruturados.

Embora esse formato oferecesse agilidade no início do projeto, ele acumulou riscos críticos para a operação de mineração e faturamento:
1. **Risco de Sobrescrita e Corrida (Race Conditions):** Quando múltiplos operadores mexiam no mesmo pedido (ex.: lançamento de pesagem na balança simultâneo a um recebimento financeiro ou emissão de NF-e), a última gravação sobrescrevia o documento JSON inteiro, apagando os dados recém-inseridos pelo outro operador.
2. **Inconsistência de Relógio de Aparelhos:** Registros locais com relógio desregulado sobrescreviam dados mais novos no banco.
3. **Falta de Integridade Referencial:** Pedidos podiam apontar para clientes inexistentes, ou itens podiam ficar sem vínculo formal.
4. **Limitações de Performance e Escala:** Consultas precisavam ler e filtrar JSONBs na memória do navegador.

### Objetivo Principal
Migrar **gradual e seguramente**, com **extremo cuidado**, **sem nenhuma interrupção nas empresas reais** e com **blindagem absoluta da emissão de Notas Fiscais Eletrônicas (NF-e)**, separando o monolito em tabelas relacionais normalizadas no schema `erp.*`, provendo uma janela de observação e rollback de 2 semanas com projeção reversa bidirecional.

---

## 2. Entidades Reais vs. Ambiente Demo

Durante a implantação, foi estabelecido com clareza que a empresa `matriz-demo` é apenas um ambiente de testes/demonstração. As operações reais do cliente concentram-se exclusivamente em duas entidades:

1. **CBA Mineração (Matriz Real):** ID `comp-1788898385141` (619 registros ativos)
2. **CBA Filial Belém:** ID `filial-mugyw35c-lneymq` (14 registros ativos)

A empresa `matriz-demo` foi desativada e mantida em modo `legacy`. Ambas as empresas reais receberam a virada controlada de todos os módulos.

---

## 3. Arquitetura da Solução

```
                    ┌────────────────────────────────────────────────────────┐
                    │                    APLICAÇÃO CALCFLOW                  │
                    │               (Painel Web / Balança / Mobile)          │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                    erpRouter.ts (Roteador)
                                                │
                      ┌─────────────────────────┴─────────────────────────┐
                      │                                                   │
                Modo 'legacy'                                        Modo 'new'
                      │                                                   │
                      ▼                                                   ▼
            public.app_records                                       Schema erp.*
          (Tabela Única JSON)                                   (Tabelas Relacionais)
                      │                                                   │
                      │ ── trg_project_app_records_to_erp ──────────────► │ (Projeção Contínua)
                      │                                                   │
                      │ ◄─ Triggers Reversos (trg_*_reverse_proj) ────────│ (Projeção Reversa)
                      │    [Trava Anti-Loop: pg_trigger_depth() > 1]      │
```

### Pilares da Arquitetura
1. **Schema Isolado (`erp.*`):** O schema `erp` foi criado no Postgres e exposto de forma segura via PostgREST (`pgrst.db_schemas = 'public, erp, graphql_public'`).
2. **Chave Primária Composta Multi-Tenant:** Toda tabela no schema `erp` possui chave primária em `(company_id, id)`, garantindo isolamento entre matriz e filial no nível de banco de dados.
3. **Projeção Contínua Direta (`app_records` ➔ `erp.*`):** Qualquer escrita vinda de clientes antigos ou rotas legadas é automaticamente distribuída para as tabelas relacionais especializadas.
4. **Projeção Reversa Bidirecional (`erp.*` ➔ `app_records`):** Toda inserção, atualização ou exclusão nas tabelas relacionais é imediatamente refletida no documento JSON da tabela legada.
5. **Trava Anti-Looping de Recursão:** Todos os triggers contêm a cláusula `IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;`, garantindo que uma projeção não gere um ciclo infinito com a outra.
6. **Feature Flags Dinâmicas (`erp.feature_flags`):** Cada empresa e módulo possui uma flag que determina sua rota de leitura e escrita (`legacy`, `shadow`, `new`, `retired`).
7. **Fallback Silencioso e Resiliente:** Se o cliente TypeScript falhar ao acessar o schema `erp`, ele recorre silenciosamente ao modelo legado em milissegundos, evitando qualquer travamento para os usuários da balança ou faturamento.

---

## 4. O Inventário das 10 Migrações Aplicadas

Todas as migrações foram escritas seguindo o padrão de DDL idempotente do Supabase e aplicadas via API de Gerenciamento:

| Migração | Nome do Arquivo | Função / O que Executa |
|---|---|---|
| **015** | `015_migration_plan_phase1_foundation.sql` | Cria schema `erp`, tabelas de auditoria (`audit_log`), tabela de controle `feature_flags`, views de diagnóstico e triggers de proteção de data de servidor. |
| **016** | `016_migration_plan_phase2_tables_and_backfill.sql` | Cria tabelas de `categories`, `transportadores`, `machines`, `maintenance_records`, `fuel_records`, `fuel_purchases`, `customers` e rotinas de backfill idempotente. |
| **017** | `017_migration_plan_phase2_inventory_finance_orders.sql` | Cria `products`, `store_items`, `stock_movements`, `financial_accounts`, `transactions`, `transaction_payments`, `sales_orders` e suas 5 filhas relacionais. |
| **018** | `018_migration_plan_phase3_continuous_projection.sql` | Instala a projeção contínua de `public.app_records` para `erp.*` com tratamento de exceções e cria as views `erp.vw_parity_report` e `erp.projection_conflicts`. |
| **019** | `019_migration_plan_phase4_atomic_operations.sql` | Cria funções atômicas idempotentes no banco: `erp.add_receipt` (adicionar recebimento sem sobrescrever pedido), `erp.add_withdrawal` (pesagem), `erp.stock_move` (livro imutável de estoque) e `erp.get_feature_flag`. |
| **020** | `020_migration_plan_phase5_reverse_projection_and_pilot_flags.sql` | **Lote 1:** Instala triggers de projeção reversa para tabelas auxiliares e frota. Configura empresas reais e ativa `new`. |
| **021** | `021_migration_plan_phase5_lot2_customers.sql` | **Lote 2:** Instala trigger de projeção reversa de `erp.customers` para `app_records` e ativa modo `new` para clientes nas empresas reais. |
| **022** | `022_migration_plan_phase5_lot3_inventory.sql` | **Lote 3:** Instala triggers de projeção e exclusão reversa para `erp.products` (`inventory`) e `erp.store_items` (almoxarifado). Ativa modo `new`. |
| **023** | `023_migration_plan_phase5_lot4_finance.sql` | **Lote 4:** Instala triggers de projeção e exclusão reversa para `erp.financial_accounts` e `erp.transactions` (com agregação de pagamentos filhos). Ativa modo `new`. |
| **024** | `024_migration_plan_phase5_lot5_orders.sql` | **Lote 5:** Instala a função `erp.reverse_project_single_order` e triggers em cascata no cabeçalho e nas 5 tabelas filhas de pedidos. Ativa modo `new`. |

---

## 5. Cronologia e Execução dos 5 Lotes (Fase 5)

### Lote 1 — Cadastros Auxiliares e Frota
- **Tabelas:** `categories`, `transportadores`, `machines`, `maintenance_records`, `fuel_records`, `fuel_purchases`.
- **Implementação:** Criação de `services/repo/auxiliaryRepo.ts` e integração no `erpRouter.ts`.
- **Resultado:** 100% de paridade (88 categorias, 32 transportadores, 5 máquinas, 2 manutenções, 4 abastecimentos/compras).

### Lote 2 — Clientes (`customers`)
- **Tabelas:** `customers`.
- **Particularidade:** Um único cliente órfão (documento vazio sem vínculo operacional) identificado na auditoria foi preservado em quarentena sem afetar a integridade das empresas.
- **Implementação:** Criação de `services/repo/customersRepo.ts` com funções `upsertCustomerToErp` e `deleteCustomerFromErp`.
- **Resultado:** 710 clientes normalizados com 100% de paridade.

### Lote 3 — Catálogo de Produtos e Almoxarifado
- **Tabelas:** `products` (tabela legada `'inventory'`) e `store_items` (almoxarifado de peças e suprimentos).
- **Garantia Fiscal:** Auditados todos os atributos tributários dos produtos (`ncm`, `cst`, `cfop`, alíquotas e dados RTC da Reforma Tributária). As garantias técnicas de calcário agrícola (PRNT mínimo, MgO, peneiras) foram integralmente preservadas.
- **Implementação:** Criação de `services/repo/productsRepo.ts` com suporte a `Product` / `InventoryItem` e `StoreItem`.
- **Resultado:** 15 produtos e 17 itens de almoxarifado operando em `new` com 100% de paridade.

### Lote 4 — Financeiro e Caixa
- **Tabelas:** `financial_accounts`, `transactions` e tabela relacional filha `transaction_payments`.
- **Segurança de Acesso:** O `erpRouter` e o `dataService` passaram a aplicar o filtro de escopo de caixa (`FINANCE_SCOPED_TABLES` / `getFinanceScope`), garantindo que usuários com caixas restritos só visualizem os lançamentos autorizados.
- **Agregação Reversa:** O trigger no banco agrega os pagamentos da tabela relacional filha de volta ao array `payments[]` do documento legado.
- **Implementação:** Atualização de `services/repo/financialRepo.ts` e conexão no roteador.
- **Resultado:** 7 contas bancárias/caixas e 56 lançamentos em `new` com 100% de paridade.

### Lote 5 — Pedidos de Venda e Ciclo Operacional
- **Tabelas:** `sales_orders`, `sales_order_items`, `sales_order_installments`, `sales_order_receipts`, `sales_order_withdrawals`, `sales_order_nfes`.
- **A Solução Multi-Tabela:** Pedidos de venda são a espinha dorsal do sistema. O banco agora possui a procedure `erp.reverse_project_single_order(company_id, order_id)` que remonta o pedido com todos os seus itens, pesagens, recibos e notas fiscais para o legado sempre que qualquer entidade filha sofre alteração.
- **Implementação:** Atualização de `services/repo/ordersRepo.ts` com `upsertOrderToErp` e `deleteOrderFromErp`.
- **Resultado:** 107 pedidos, 107 itens, 68 parcelas, 17 recibos, 4 pesagens e 84 notas fiscais vinculadas em `new` com 100% de paridade.

---

## 6. Blindagem e Segurança da Emissão de NF-e

A emissão de Nota Fiscal Eletrônica (NF-e) exigiu proteção máxima durante todo o processo:
1. **Configurações e Certificado Digital:** As tabelas `fiscal_config` e `fiscal_secrets` (onde ficam o certificado A1, senha e credenciais da API fiscal) **não foram alteradas**, continuando com a mesma proteção de segurança.
2. **Histórico de Notas Autorizadas:** Todas as 84 notas já emitidas mantiveram suas chaves de acesso de 44 dígitos, protocolos SEFAZ, URLs do DANFE e do XML intactos em `erp.sales_order_nfes`.
3. **Consistência dos Dados de Faturamento:** Os 15 testes fiscais dedicados na suíte de testes (`services/domain/telegramNfe.test.ts`, `services/domain/nfeDraftPdf.test.ts`, `services/saleNfe.test.ts`, etc.) continuam executando com **100% de aprovação**.
4. **Sem Alteração no Payload da SEFAZ:** A montagem dos dados de destinatário (Lote 2), itens/NCM (Lote 3) e transportador (Lote 1) devolve exatamente a mesma estrutura para a API de mensageria da NotaAs.

---

## 7. Painel Geral de Paridade em Tempo Real

Consulta executada diretamente contra a view de auditoria `erp.vw_parity_report` no banco de produção:

```sql
SELECT * FROM erp.vw_parity_report ORDER BY modulo;
```

| Módulo | Registros no Legado (`app_records`) | Registros no Novo (`erp.*`) | Divergência | Status de Paridade |
|---|:---:|:---:|:---:|:---:|
| **`categories`** | 88 | 88 | 0 | **PARIDADE 100%** |
| **`customers`** | 710 | 710 | 0 | **PARIDADE 100%** |
| **`financial_accounts`** | 7 | 7 | 0 | **PARIDADE 100%** |
| **`fuel_purchases`** | 2 | 2 | 0 | **PARIDADE 100%** |
| **`fuel_records`** | 2 | 2 | 0 | **PARIDADE 100%** |
| **`inventory` (Produtos)** | 15 | 15 | 0 | **PARIDADE 100%** |
| **`machines`** | 5 | 5 | 0 | **PARIDADE 100%** |
| **`maintenance_records`** | 2 | 2 | 0 | **PARIDADE 100%** |
| **`sales_orders`** | 107 | 107 | 0 | **PARIDADE 100%** |
| **`store_items` (Almoxarifado)** | 17 | 17 | 0 | **PARIDADE 100%** |
| **`transactions`** | 56 | 56 | 0 | **PARIDADE 100%** |
| **`transportadores`** | 32 | 32 | 0 | **PARIDADE 100%** |
| **TOTAL** | **1.043** | **1.043** | **0** | **100% CONCILIADO** |

- **Conflitos de Conciliação (`SELECT count(*) FROM erp.projection_conflicts`):** **0 conflitos**.
- **Total de Testes Automatizados:** **123 testes passando (0 falhas)**.

---

## 8. Estado das Feature Flags em Produção

```sql
SELECT company_id, module, mode FROM erp.feature_flags ORDER BY company_id, module;
```

- **CBA Mineração (`comp-1788898385141`):** **Todos os 12 módulos em `new`**.
- **CBA Filial Belém (`filial-mugyw35c-lneymq`):** **Todos os 12 módulos em `new`**.
- **Matriz Demonstração (`matriz-demo`):** **Todos os módulos mantidos em `legacy`**.

---

## 9. Janela de Observação e Procedimento de Rollback

### Janela de Segurança de 2 Semanas
Durante as próximas duas semanas, a projeção reversa (`erp.*` ➔ `public.app_records`) permanecerá ativa ininterruptamente no banco de dados. 

Isso significa que, mesmo que o sistema esteja gravando no schema novo `erp.*`, a tabela legada `public.app_records` continuará recebendo uma cópia exata de todos os cadastros, vendas e baixas em tempo real.

### Procedimento de Rollback Instantâneo (Caso Necessário)
Se qualquer anomalia for observada em algum módulo, o rollback é instantâneo e não exige restauração de backup nem perda de dados. Basta executar um comando SQL no Supabase:

```sql
-- Exemplo: Reverter apenas o módulo de pedidos para o modo legacy
UPDATE erp.feature_flags 
SET mode = 'legacy', updated_at = now() 
WHERE company_id IN ('filial-mugyw35c-lneymq', 'comp-1788898385141')
  AND module = 'sales_orders';
```
Ao executar esse comando, o roteador da aplicação volta imediatamente a ler e escrever na tabela legada, que já estará com todos os dados gerados no período novo.

---

## 10. Estrutura de Arquivos Criados e Modificados

### Migrações SQL (`supabase/migrations/`)
- `015_migration_plan_phase1_foundation.sql`
- `016_migration_plan_phase2_tables_and_backfill.sql`
- `017_migration_plan_phase2_inventory_finance_orders.sql`
- `018_migration_plan_phase3_continuous_projection.sql`
- `019_migration_plan_phase4_atomic_operations.sql`
- `020_migration_plan_phase5_reverse_projection_and_pilot_flags.sql`
- `021_migration_plan_phase5_lot2_customers.sql`
- `022_migration_plan_phase5_lot3_inventory.sql`
- `023_migration_plan_phase5_lot4_finance.sql`
- `024_migration_plan_phase5_lot5_orders.sql`

### Código TypeScript da Camada de Repositório (`services/repo/`)
- `services/repo/types.ts`: Tipagens dos modos de feature flags.
- `services/repo/featureFlags.ts`: Consulta e cache das feature flags com fallback.
- `services/repo/erpRouter.ts`: Roteamento inteligente de leitura, gravação e exclusão.
- `services/repo/auxiliaryRepo.ts`: Repositório de categorias, transportadores e frota.
- `services/repo/customersRepo.ts`: Repositório de clientes.
- `services/repo/productsRepo.ts`: Repositório de produtos e itens de almoxarifado.
- `services/repo/financialRepo.ts`: Repositório de contas financeiras e lançamentos.
- `services/repo/ordersRepo.ts`: Repositório de pedidos de venda e tabelas filhas.
- `services/repo/repoAssembler.test.ts`: Testes unitários de montagem das entidades.

### Arquivos Modificados no Core da Aplicação
- `services/dataService.ts`: Integração com o `erpRouter` para leitura, gravação e exclusão, além da aplicação do escopo de caixa.
- `types.ts`: Compatibilização de tipagem (`Product = InventoryItem`).

### Backup Seguro de Pré-Migração
- `backups/app_records_backup_2026-09-28T19-53-56-866Z.json`: Backup integral JSON de 1.107 registros realizado antes de qualquer alteração no banco.

---

## 11. Conclusão e Próximos Passos Recomendados

O objetivo foi alcançado com rigor máximo:
- **Zero registros perdidos.**
- **Zero minutos de sistema fora do ar.**
- **Zero erros ou ruídos para os operadores de balança, pátio e escritório.**
- **Emissão fiscal blindada e íntegra.**
- **100% das empresas reais já rodando no modelo relacional moderno.**

### Próximos Passos
1. **Monitoramento:** Acompanhar a operação diária através das views `erp.vw_parity_report` e `erp.projection_conflicts`.
2. **Após 2 semanas de estabilidade (Fase 7):**
   - Marcar o `public.app_records` como somente-leitura (`app_records_archive`).
   - Desativar os triggers de projeção reversa para aliviar I/O do banco.
   - Usufruir de consultas SQL avançadas, filtros por período e relatórios com velocidade de banco de dados relacional.
