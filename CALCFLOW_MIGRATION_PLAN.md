# CalcFlow25 — Plano de transição: sair do `app_records` para tabelas por módulo

**Data:** 2026-09-28 · **Status:** proposta para aprovação. Nada aqui foi executado: nenhuma migration criada, nenhum dado lido ou gravado no banco.
**Base:** [CALCFLOW_DATA_AUDIT.md](CALCFLOW_DATA_AUDIT.md). Os códigos P0-x/P1-x abaixo referem-se aos problemas daquele relatório.

## 1. Por que migrar e o que a migração precisa entregar

A causa raiz dos problemas P0-5, P0-6, P1-7, P1-8, P1-9 e P1-10 é o modelo de dados: cada registro é um JSON numa linha só, e cada save reenvia o objeto inteiro. Tabelas por módulo permitem, no próprio banco:

| Necessidade | Como a estrutura nova resolve |
|---|---|
| Recibo, retirada e pagamento não se perderem | Cada um vira **linha própria** numa tabela filha. Inserir uma linha não sobrescreve o pai |
| Estoque correto com duas vendas simultâneas | **Livro de movimentações** (só acrescenta linhas); o saldo é a soma |
| Numeração sem duplicidade | **Contador por empresa** incrementado atomicamente + índice único |
| Conflito de edição detectado | Coluna `version`; salvar exige a versão que a pessoa leu |
| Confirmar venda "tudo ou nada" | **Função no banco** que faz estoque + parcelas + cliente numa transação |
| Empresa/filial sem mistura | `company_id` em toda linha e **chave estrangeira composta** (não dá para ligar pedido da filial A a cliente da filial B) |
| Rastreabilidade | Trigger de auditoria + `created_by`/`updated_by` gerados pelo banco |
| Cargos valendo de verdade | RLS por tabela, cargo e escopo de caixa (o escopo por `account_id` fica trivial numa coluna) |

**Princípio central:** o app continua trabalhando com os mesmos tipos TypeScript (`SaleOrder` com `items`, `payments`, `receipts`, `withdrawals` etc.). Uma camada de repositório monta esses objetos a partir das tabelas. Assim `services/domain/*`, a geração de NF-e, os PDFs e os 117 testes não mudam. O que muda é **como se grava**: operações (`adicionar recibo`, `baixar estoque`) em vez de "salvar o objeto todo".

## 2. Como fica hoje o acesso aos dados (o que torna a migração viável)

Só estes pontos tocam o `app_records`:

| Camada | Arquivos |
|---|---|
| Navegador | `services/dataService.ts` (`db.getTable/upsert/delete`), usado por `App.tsx` (20 chamadas), `fiscalService.ts` (3), `OnboardingModal.tsx` (4), `EmitirNfeModal.tsx` (3), `EmitirNfeAvulsaModal.tsx` (1) |
| Servidor | `api/_lib/erpRepository.ts` (Telegram), `api/_lib/supabaseAdmin.ts` (webhook), `api/users/invite.ts`, `api/admin/companies.ts`, `api/admin/tenants.ts`, `api/_lib/telegram/pair.ts` |
| Ferramentas | `DatabaseStatusModal.tsx`, `scripts/testPersistence.ts`, `scripts/recoverCustomers.ts` |

É um funil estreito, o que permite trocar módulo a módulo atrás de um adaptador, sem reescrever 60 componentes.

## 3. Modelo de dados alvo

Schema novo **`erp`** (não `public`): já existem no `public` as tabelas `customers`, `products`, `orders`, `stock_moves` e `invoices` de uma tentativa antiga, bloqueadas pela migration 004. Elas devem ser verificadas (vazias?) e ficar fora do caminho. Reutilizar esses nomes causaria confusão e conflito.

### 3.1 Colunas comuns a toda tabela

| Coluna | Regra |
|---|---|
| `id text` | **Mantém o id atual** (`ord-…`, `tx-…`, `cust-…`). Nenhum registro é renumerado, para preservar referências, NF-e e links |
| `company_id text not null` | FK para `companies(id)`. Antes do backfill, criar em `companies` uma linha para cada `company_id` existente (empresas antigas não têm) |
| `version int not null default 1` | Incrementada por trigger a cada `UPDATE` |
| `created_at`, `updated_at timestamptz` | Definidos **pelo servidor** (fim da dependência do relógio do aparelho) |
| `created_by`, `updated_by uuid` | `auth.uid()` via trigger |
| `deleted_at timestamptz null` | Exclusão lógica. `DELETE` físico bloqueado por RLS para o app |
| `extra jsonb not null default '{}'` | **Campos que ainda não têm coluna.** Garante que nenhum campo do JSON se perca no backfill; migra-se para coluna quando estabilizar |
| Chave primária | `(company_id, id)`; filhas referenciam `(company_id, parent_id)` |

### 3.2 Tabelas por módulo

| Hoje (`table_name`) | Tabelas novas | Observações |
|---|---|---|
| `customers` | `erp.customers` | `total_spent` deixa de ser campo gravado à mão: vira visão calculada (soma das vendas confirmadas) ou coluna mantida por função |
| `inventory` | `erp.products` + `erp.stock_movements` | Saldo = soma dos movimentos; coluna `quantity` mantida por trigger no mesmo commit. Abertura com movimento "saldo inicial da migração" |
| `store_items` | `erp.store_items` (usa o mesmo `stock_movements` com `item_kind`) | |
| `sales_orders` | `erp.sales_orders` (cabeçalho) + `sales_order_items` + `sales_order_installments` (as `payments[]` do pedido) + `sales_order_receipts` + `sales_order_withdrawals` + `sales_order_nfes` | O bloco fiscal (`nfePayload`, `nfeRawResponse`) fica em `jsonb` na linha da NF-e |
| `transactions` | `erp.transactions` + `erp.transaction_payments` | `paid_amount` mantido por trigger a partir dos pagamentos; `account_id` como coluna (escopo de caixa) |
| `financial_accounts`, `categories` | `erp.financial_accounts`, `erp.categories` | |
| `machines`, `maintenance_records`, `fuel_records`, `fuel_purchases` | tabelas homônimas | Horímetro alterado por operação, com histórico |
| `transfers` | `erp.transfers` + `erp.transfer_items` | |
| `transportadores` | `erp.transportadores` | |
| `fiscal_config` | `erp.fiscal_config` + `erp.fiscal_secrets` | A **chave da API** vai para tabela sem leitura pelo navegador (só servidor). Hoje o cliente a recebe |
| `users` | `erp.member_profiles` (nome, telefone, cargo de função) | Cargo e permissões só em `company_memberships`, fim da cópia de exibição que hoje diverge |
| — (novo) | `erp.document_sequences` | Contador por empresa, tipo e ano (`PED`, `ORC`, `NFA`, `TRF`, ticket de pesagem, número de NF-e) |
| — (novo) | `erp.audit_log` | Usuário, empresa, tabela, id, ação, valor anterior e posterior (`jsonb`), horário |
| — (novo) | `erp.feature_flags` | Modo por empresa e módulo (ver 5.4) |

**Tipos:** dinheiro `numeric(14,2)`; toneladas `numeric(14,3)` (o app usa 3 casas em `roundTons`; o Telegram hoje arredonda a 2, o que passa a ser corrigido); datas de negócio `date`; horários `timestamptz`.

### 3.3 Operações no banco (funções `security invoker`, sujeitas à RLS)

O app deixa de reenviar objetos e passa a chamar operações. Todas recebem um **id de idempotência** gerado pelo cliente (o `receiptId` atual já faz esse papel):

| Operação | Substitui |
|---|---|
| `erp.confirm_sale(order_id)` | `finalizeSale`/`postSaleFinance`: baixa estoque, cria parcelas, atualiza cliente, muda status, numa transação |
| `erp.add_receipt(order_id, receipt)` / `revise_receipt` / `delete_receipt` | `applyReceiptToFinance`, `handleReviseReceipt` |
| `erp.add_withdrawal(order_id, withdrawal)` | Salvar retirada na balança; valida o saldo do pedido **no banco** com trava de linha |
| `erp.register_payment(transaction_id, payment)` | `ReceivePayDialog` |
| `erp.stock_move(item, delta, motivo, origem)` | `processStockChange`, moagem, compra, edição de produto |
| `erp.next_number(kind)` | `nextOrderReference`, `nextTransferCode`, `proxNumeroNFe`, ticket |
| `erp.cancel_or_delete_order(order_id)` | `handleDeleteOrder`, com regra explícita sobre recibos |
| `erp.patch_<módulo>(id, expected_version, campos)` | Edição de cadastro só dos campos alterados; devolve conflito se a versão mudou |

Esboço ilustrativo (não é para aplicar como está): o estoque como movimento atômico e idempotente.

```sql
-- ESBOÇO. Aditivo; nada disto altera public.app_records.
create table erp.stock_movements (
  company_id text not null, id text not null,          -- id = chave de idempotência
  item_kind text not null check (item_kind in ('product','store_item')),
  item_id text not null,
  delta numeric(14,3) not null,
  reason text not null, source_table text, source_id text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (company_id, id),
  foreign key (company_id) references public.companies(id)
);
-- trigger after insert: atualiza erp.products.quantity += delta na mesma transação.
-- Inserir o mesmo id duas vezes falha; a venda repetida não baixa duas vezes.
```

## 4. Estratégia: projeção contínua, adaptador por módulo e virada com volta

Não há "big bang". Cada módulo passa por quatro estados, controlados por `erp.feature_flags(company_id, module, mode)`:

```
legacy ──► shadow ──► new ──► (aposentado)
 só app_records   lê nas duas e compara   lê e grava só nas tabelas
                  (mostra o legado)       (app_records vira somente leitura)
```

Duas peças técnicas sustentam isso:

1. **Projeção `app_records → erp.*` por trigger.** Enquanto o app antigo grava em `app_records`, um trigger espelha cada linha nas tabelas novas (mesma função do backfill, idempotente). As tabelas novas ficam atualizadas sem mexer no app.
   *Cuidado com a projeção de listas:* se o app antigo sobrescreve um pedido e perde um recibo, a projeção não pode "apagar" o recibo da tabela nova. Regra: **a projeção só insere e atualiza linhas filhas, nunca apaga**; divergências vão para `erp.projection_conflicts` para revisão humana. Isso preserva o dado e revela quanto o problema atual já acontece.
2. **Projeção reversa `erp.* → app_records` durante a janela de rollback.** Depois que um módulo vira `new`, um trigger inverso mantém o `app_records` atualizado por 2 semanas, para poder voltar a `legacy` sem perder o que foi gravado. Depois disso, é removido.

## 5. Fases

Cada fase tem critério de saída e reversão. Estimativas são ordens de grandeza para uma pessoa em tempo parcial e mudam depois do diagnóstico da Fase 0.

### Fase 0 — Preparação e diagnóstico dos dados (≈ 1 semana, sem mudança de comportamento)
1. Autenticar o MCP do Supabase e criar um **branch de ensaio** (o recurso `branching` já está habilitado no seu projeto).
2. **Backup:** exportar `app_records` por empresa e tabela (e confirmar backup/PITR do projeto).
3. **Levantamento somente leitura em produção:**
   - contagem por `table_name` × `company_id`;
   - inventário de chaves de cada JSON (campos que existem de fato, tipos misturados, nulos);
   - `reference` de pedido duplicada dentro da mesma empresa;
   - órfãos (pedido com `customerId` inexistente, lançamento com `orderId` inexistente);
   - conciliação: soma dos recibos do pedido × soma dos pagamentos nos lançamentos ligados;
   - estoque negativo ou `quantity` fracionada fora do padrão;
   - `companyId` do registro diferente do `company_id` da linha;
   - conteúdo das tabelas antigas `public.customers/products/orders/stock_moves/invoices`.
4. Definir com você as regras pendentes da seção 10 do relatório de auditoria (estoque negativo, excluir pedido com recibo, equipe por filial), pois elas viram restrições do banco.
- **Saída:** relatório de qualidade dos dados + lista de exceções. **Reversão:** não se aplica.

### Fase 1 — Fundação aditiva (≈ 1 a 2 semanas)
1. Migration: schema `erp`, colunas comuns, `document_sequences`, `audit_log`, `feature_flags`, `projection_conflicts`.
2. **Trigger de auditoria e de `updated_at`/`version` no próprio `app_records`.** Ganho imediato e sem risco: a partir daqui há histórico de quem mudou o quê (fecha grande parte das falhas de rastreabilidade) e uma base para medir a sobrescrita atual.
3. Linhas em `companies` para todo `company_id` existente.
- **Saída:** migrations aplicadas no branch e depois em produção; app sem nenhuma diferença visível. **Reversão:** `drop schema erp cascade` e remover os triggers (nenhum dado original é tocado).

### Fase 2 — Tabelas e backfill idempotente (≈ 2 a 3 semanas)
1. Criar as tabelas por módulo (seção 3.2), começando pelos módulos simples.
2. Funções `erp.backfill_<módulo>(company_id)` que leem `app_records` e gravam nas tabelas; campos sem coluna vão para `extra`; linha que não passa nas restrições vai para **quarentena** (`erp.migration_rejects`), nunca é descartada em silêncio.
3. **Conciliação automática** por módulo e empresa (contagens, somas de valor, estoque × movimentos, recibos × pagamentos) e relatório revisado por você.
4. Estoque: cada produto recebe um movimento "saldo inicial da migração" igual ao saldo atual.
- **Saída:** conciliação com diferença zero (ou diferenças explicadas e aprovadas) no branch, com dados copiados de produção. **Reversão:** truncar as tabelas `erp` e refazer; o app_records segue intacto.

### Fase 3 — Projeção contínua e período de sombra dos dados (≈ 1 a 2 semanas de execução, depois observação)
1. Ligar o trigger `app_records → erp.*` por módulo.
2. Relatório diário de paridade (`erp.parity_report`) e da fila `projection_conflicts`.
3. Observar por um período combinado (sugestão: 2 semanas com uso real) até a paridade fechar.
- **Saída:** paridade estável e conflitos triados. **Reversão:** desligar os triggers.

### Fase 4 — Camada de acesso nova no app (≈ 3 a 4 semanas de desenvolvimento)
1. Criar `services/repo/<módulo>.ts` com a **mesma forma** dos tipos atuais (o repositório monta `SaleOrder` completo a partir das tabelas) e o **cliente de operações** (`addReceipt`, `stockMove` etc.).
2. `db.getTable/upsert/delete` passa a consultar a flag da empresa e roteia para o legado ou para o repositório novo.
3. **Fila offline:** hoje ela guarda *objetos* para reenvio; passa a guardar *operações com id de idempotência*. Reenviar uma operação é seguro; reenviar um objeto velho é o problema atual. Este é o ponto de maior mudança no cliente.
4. **Portão de versão do cliente:** navegadores com o pacote antigo em cache (a migration 005 já reconhece esse problema) precisam recarregar. `feature_flags` guarda `min_client_version`; o app antigo exibe "atualize a página" e não grava.
5. Modo `shadow`: o app lê das duas fontes, mostra o legado e registra qualquer diferença.
- **Saída:** modo `shadow` sem diferenças relevantes por uma semana. **Reversão:** flag em `legacy`.

### Fase 5 — Virada por módulo, do menos ao mais arriscado (≈ 1 semana por módulo, com folga)

| Ordem | Módulo | Motivo da posição | Problemas de auditoria que fecha |
|---|---|---|---|
| 1 | `categories`, `transportadores`, `machines`, manutenção, combustível | Baixo volume, poucas dependências. Serve de ensaio da mecânica | P3-16 (parcial) |
| 2 | `customers` | Base para os pedidos; `total_spent` calculado | P0-5 (parte cliente) |
| 3 | `products` + `stock_movements` (+ `store_items`) | Reduz o maior risco de contagem; exige contagem física de conciliação | **P0-6** |
| 4 | `financial_accounts`, `transactions`, `transaction_payments` | Escopo de caixa passa a coluna | **P0-5 (pagamentos)**, P1-10 (parte financeira) |
| 5 | `sales_orders` + filhas + `document_sequences` | Módulo mais central; usa tudo o que veio antes | **P0-5**, **P1-7**, **P1-9**, P2-11 |
| 6 | `fiscal_config` + `fiscal_secrets`, número de NF-e | Sensível (ver regras de NF-e do `.cursor/rules/projeto.mdc`) | P0-3 (chave fora do navegador), P0-5f |
| 7 | usuários/perfis/permissões | Alinha cargo, vínculo e RLS | P1-10, P2-12, P2-13, P2-14 |

Para cada módulo, na ordem: (a) empresa piloto em `shadow`, (b) `new` na empresa `matriz-demo`, (c) `new` em uma filial de teste, (d) `new` na CBA e demais. Ao virar `new`: RLS de escrita no `app_records` daquela tabela passa a `false`, e a projeção reversa (seção 4) fica ligada por 2 semanas.
- **Saída de cada módulo:** 1 semana sem diferença de conciliação e sem chamado de operação. **Reversão:** flag volta para `legacy` (a projeção reversa mantém o legado atualizado).

### Fase 6 — Servidores (≈ 1 a 2 semanas, feito junto com os módulos correspondentes)
`erpRepository.ts` (Telegram) passa a chamar as mesmas operações do app, incluindo `confirm_sale` e `stock_move`; o webhook fiscal atualiza só as colunas da NF-e e exige `company_id`; as rotas `invite`/`companies` passam a ler `member_profiles`. Isso elimina a sobrescrita do webhook e do Telegram (P0-5g, P0-5h).

### Fase 7 — Aposentadoria do `app_records` (≈ 1 semana, após 4 a 8 semanas de estabilidade)
1. `app_records` vira arquivo somente leitura (renomear para `app_records_archive`, sem políticas de escrita).
2. Remover do cliente os caminhos legados, o cache de tabelas em `localStorage` e a fila de objetos.
3. Verificar e remover as tabelas antigas não usadas (`public.customers`, `products`, `orders`, `stock_moves`, `invoices`), somente se estiverem vazias ou já exportadas.
4. Manter o arquivo por 6 a 12 meses (ou o prazo que a contabilidade exigir).

## 6. Segurança e RLS no modelo novo

- Política base por tabela: `company_id` do vínculo **e** permissão do módulo, reaproveitando `member_has_permission`/`member_can_access_record`. Escopo de caixa passa a checar `account_id` direto.
- `INSERT/UPDATE` só por operação; `DELETE` só como exclusão lógica; tabelas `audit_log` e `stock_movements` **somente acréscimo** (sem `UPDATE`/`DELETE` para ninguém, nem administrador).
- **Presets de permissão por cargo gravados no vínculo** (Administrador, Gerente, Supervisor, Operador) e aplicados no banco. O Operador da balança ganha permissão para `add_withdrawal` e leitura do necessário, e **perde** a escrita no pedido inteiro. Isso fecha P1-10, mas exige a decisão 6 e 7 da seção 10 da auditoria.
- `fiscal_secrets` sem nenhuma política para `authenticated`: só a service role lê.
- Os itens **P0-1 a P0-3** (cadastro, `/api/admin/tenants`, `/api/nfe/*`) não dependem da migração e **não devem esperar por ela**.

## 7. Riscos e como o plano os trata

| Risco | Tratamento |
|---|---|
| Dado antigo inconsistente (recibo perdido, referência duplicada, órfão) | Migração **não corrige em silêncio**: quarentena + relatório para decisão humana antes da virada |
| Perder algum campo do JSON | `extra jsonb` em toda tabela; conciliação por chaves na Fase 2 |
| NF-e quebrar | Camada de repositório devolve o mesmo formato de `SaleOrder`; os testes de `services/domain/*` e `fiscalService` seguem valendo; módulo fiscal é o penúltimo a virar |
| Usuário com app antigo em cache gravando no lugar errado | `min_client_version` + bloqueio de escrita do cliente antigo + RLS de escrita fechada no legado |
| Duas fontes divergirem durante a transição | Projeção só acrescenta em listas + `parity_report` + `projection_conflicts` |
| Voltar atrás numa virada | Flag por empresa/módulo + projeção reversa por 2 semanas |
| Desempenho (hoje o app carrega tabelas inteiras) | Fora do escopo inicial; o repositório novo já permite filtro por período e paginação numa fase posterior |
| Trabalho grande demais para uma vez | Módulo a módulo, com o legado funcionando até cada virada |
| Custo de RLS por linha nas novas tabelas | Índices em `(company_id, …)`; medir no branch antes de ligar |

## 8. Equivalência com o relatório de auditoria

| Item da auditoria | Quando fecha |
|---|---|
| P0-1, P0-2, P0-3, P1-4 (segurança) | **Antes e independente** da migração |
| Rastreabilidade (seção 8) | Fase 1 (auditoria no `app_records`) e definitivamente nas tabelas novas |
| P1-8 (relógio do aparelho) | Fase 1 (trigger de servidor) |
| P0-6 (estoque) | Virada do módulo 3 |
| P0-5, P1-9 (perda de recibo/pagamento, cascata) | Viradas 4 e 5 |
| P1-7 (numeração) | Virada 5 (`document_sequences`) |
| P1-10 (cargos só na interface) | Virada 7, com decisão prévia das regras por cargo |

## 9. Ordem de trabalho sugerida e primeiro passo

1. **Agora, em paralelo:** correções de segurança P0-1 a P1-4 (baixo esforço, independentes).
2. **Fase 0 e Fase 1**, que não alteram nenhum comportamento e já entregam auditoria e diagnóstico.
3. Com o relatório de qualidade dos dados em mãos, fechar as decisões de negócio e detalhar o cronograma das Fases 2 a 5.

**Estimativa total:** da ordem de 3 a 5 meses em tempo parcial até a virada de todos os módulos, mais o período de estabilização antes da Fase 7. É uma estimativa preliminar; a Fase 0 deve refiná-la.

## 10. Decisões que preciso de você antes de detalhar

1. **Janela de observação** das Fases 3 e 5: 1 semana, 2 semanas ou mais por módulo?
2. **Empresa piloto** para o modo `shadow`/`new`: a `matriz-demo` e uma filial de teste servem, ou existe outra empresa de teste real?
3. **Cargos:** aceita que o Operador da balança passe a ter **só** `add_withdrawal` (sem gravar o pedido inteiro)?
4. **Estoque negativo:** permitido com alerta, ou bloqueado?
5. **Exclusão:** pedido e lançamento passam a ser exclusão lógica (some da tela, fica no histórico). Aceitável para a contabilidade?
6. **Retenção** do arquivo `app_records_archive` (6, 12 meses ou mais)?
7. **Acesso ao Supabase:** posso contar com o MCP autenticado para a Fase 0 (somente leitura) e para criar o branch de ensaio?
