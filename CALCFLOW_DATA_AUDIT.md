# CalcFlow25 — Auditoria de integridade de dados multiusuário

**Data:** 2026-09-28 · **Escopo:** código do repositório (frontend, `api/`, `services/`, `supabase/migrations/`) · **Etapa:** somente diagnóstico. Nenhuma correção, migração, escrita em banco ou alteração de regra foi feita.

## Como esta auditoria foi feita (e o que ela não cobre)

| Feito | Não feito |
|---|---|
| Leitura do fluxo completo de persistência (`dataService.ts`, `persistSeed.ts`, `App.tsx`), das 14 migrations, das rotas `api/*`, do webhook fiscal, do agente Telegram e dos componentes que gravam (`SalesOrders`, `YardManagement`, `OrderWithdrawalModal`, `Inventory`, `ReceivePayDialog`, `fiscalService`). | **Não consultei o banco de produção.** O MCP do Supabase ainda não foi autenticado, então RLS, triggers, colunas e dados reais vigentes não foram verificados. Tudo sobre o banco vem das migrations do repositório. |
| `npm test`: 117 testes passam. Nenhum deles cobre dois usuários gravando o mesmo registro. | **Não abri duas sessões reais** e não executei ataques nem testes destrutivos. As frentes de segurança (itens 1 a 4) são conclusões de leitura de código, marcadas como "a validar". |
| Simulação **em memória** dos cenários de sobrescrita (seção 5.1), usando as funções reais `mapSupabaseRows`, `mergeRecordsByUpdatedAt`, `appendReceiptToOrder` e `nextOrderReference` e a semântica do `upsert` (linha inteira substituída). | Não validei regras com a operação da empresa. Onde a regra é uma decisão de negócio, listei em "Validação humana" (seção 10). |

Legenda de prioridade: **P0** crítico (vazamento/perda entre empresas ou usuários), **P1** alto, **P2** médio, **P3** baixo.

---

## Resumo executivo

1. **O modelo de gravação é "última gravação vence" na linha inteira.** Todo save reenvia o objeto completo (pedido, lançamento, produto, configuração fiscal) montado a partir de uma cópia que a tela guardou ao abrir. Não há versão, comparação de `updated_at` nem atualização por campo. Reproduzi em simulação: recibo perdido quando o pátio pesa um caminhão, pagamento perdido em parcela paga por duas pessoas, estoque que volta ao valor antigo, baixa de estoque perdida entre dois aparelhos.
2. **O estoque é um número absoluto calculado no navegador** (`quantity + delta` sobre a cópia local), sem histórico de movimentação.
3. **Há falhas de isolamento entre empresas no lado servidor**, todas confirmadas só por leitura de código e a validar:
   - o cadastro aceita `companyId` e `role` vindos do cliente e o trigger cria o vínculo com eles;
   - `/api/admin/tenants` copia e lista dados de qualquer empresa para qualquer Administrador;
   - `/api/nfe/cancelar` e `/api/nfe/consultar` não exigem login;
   - o webhook fiscal aceita chamadas sem segredo, se a variável não estiver configurada.
4. **Os cargos existem só na interface.** No banco, todo membro tem leitura e escrita em todos os módulos (backfill das migrations 010/014 e `fillEmptyPermissions`). Excluir é físico, sem registro.
5. **Rastreabilidade quase inexistente.** Não há `created_by`/`updated_by`, valor anterior nem tabela de auditoria para o app. A única trilha é a do Telegram (`telegram_audit`). `sellerName` e `receivedBy` são textos fixos.

---

## 1. Mapa dos módulos

Toda a persistência operacional está em **uma tabela**: `public.app_records (table_name, company_id, id, data jsonb, updated_at)`, chave primária `(table_name, company_id, id)`. Cada "módulo" é um valor de `table_name` (`ALL_TABLES`, [dataService.ts:168](services/dataService.ts:168)). Tabelas relacionais antigas estão travadas (migration 004).

| Módulo (`table_name`) | Tela | O que guarda | Arquivo principal |
|---|---|---|---|
| `sales_orders` | Vendas, Orçamentos, Balança | Pedido com **itens, `payments[]` (parcelas), `receipts[]` (recibos), `withdrawals[]` (carregamentos) e dados de NF-e no mesmo JSON** | `SalesOrders.tsx`, `YardManagement.tsx`, `App.tsx` |
| `customers` | Clientes | Cadastro + `totalSpent` (acumulado de vendas) | `Customers.tsx`, `App.tsx` |
| `transactions` | Financeiro, Caixa Diário | Lançamento com `paidAmount` e `payments[]` embutidos | `Transactions.tsx`, `DailyFinancialManagement.tsx`, `ReceivePayDialog.tsx` |
| `financial_accounts`, `categories` | Contas, Categorias | Caixas/bancos e categorias | `FinancialAccounts.tsx`, `CategorySettings.tsx` |
| `inventory` | Estoque/Produção | Produtos com `quantity` **absoluta** | `Inventory.tsx`, `MillingProcess.tsx` |
| `store_items` | Almoxarifado (Pátio) | Peças e insumos com `quantity` absoluta | `YardManagement.tsx`, `storeItemMatch.ts` |
| `machines`, `maintenance_records`, `fuel_records`, `fuel_purchases` | Frota, Combustível, Manutenção | Horímetro, abastecimentos, compras de diesel; geram lançamentos financeiros | `FleetManagement`, `FuelManagement` |
| `transfers` | Transferências/Romaneios | Remessas entre unidades | `TransferManagement.tsx` |
| `transportadores` | Transportadores | Cadastro | `Transportadores.tsx` |
| `fiscal_config` | Configuração fiscal | Emitente, chave da API, certificado, **`proxNumeroNFe`** | `fiscalService.ts` |
| `users` | Equipe | Perfil (nome, cargo, `permissions`) — **cópia de exibição**; a fonte do cargo é `company_memberships.role` | `UserManagement.tsx`, `api/users/invite.ts` |
| `company_memberships`, `companies` | Filiais e acessos | Vínculo usuário↔empresa, cargo, permissão por módulo | `CompanyBranches.tsx`, `api/admin/companies.ts` |
| `telegram_*` | Agente Telegram | Vínculos, códigos, ações pendentes, `telegram_audit` | `api/_lib/telegram*`, `services/agent/*` |

**Não existe módulo de "Ordem de Serviço".** O equivalente é o **Pedido de Venda** (`sales_orders`), com status `Orçamento → Venda Confirmada → Cancelado` ([types.ts:16](types.ts:16)). Nenhuma tela grava `Cancelado`; cancelar hoje significa excluir o pedido ou cancelar a NF-e.

**Quem grava e por onde:**

| Escritor | Caminho | Credencial |
|---|---|---|
| Navegador (todos os módulos) | `db.upsert` → `supabase.from('app_records').upsert` | JWT do usuário, sujeito à RLS |
| Rotas `api/users`, `api/admin/*` | `getAdminSupabase()` | **service role** (ignora RLS) |
| Webhook Notaas | `patchSalesOrder` | service role |
| Agente Telegram | `erpRepository.upsert` | service role, com `company_id` do vínculo do chat |

## 2. Regras de negócio identificadas

Levantadas do código; nenhuma foi presumida.

**Empresas e filiais**
- Matriz e filiais são linhas de `companies` (`parent_company_id`). Cada usuário tem um vínculo por empresa em `company_memberships(company_id, user_id, role, permissions)`. Todo registro de `app_records` pertence a **uma** empresa (`company_id`).
- A empresa ativa é o estado React `selectedCompanyId`, trocado pelo seletor do topo só se houver mais de um vínculo ([App.tsx:166](App.tsx:166), [App.tsx:1412](App.tsx:1412)). Ao trocar, todo o estado das telas é zerado e recarregado ([App.tsx:289-306](App.tsx:289)).
- Filial tem CNPJ, IE e certificado próprios. `create-branch` cria uma configuração fiscal em branco para ela ([api/admin/companies.ts:91](api/admin/companies.ts:91)).
- A empresa `matriz-demo` é aberta a `anon` por política RLS e serve de demonstração. `resolveCompanyKey(undefined | 'main' | 'demo')` cai nela.

**Pedido de venda**
- `Orçamento` não baixa estoque nem gera financeiro. Ao virar `Venda Confirmada` pela primeira vez: **baixa o estoque sempre** e, se `withoutFinance` for falso, cria uma parcela `SALE` por pagamento programado, mais uma de "saldo em aberto", e soma o total em `customers.totalSpent` ([App.tsx:828-924](App.tsx:828)).
- Pedido sem financeiro ("carregamento/venda avulsa") só lança financeiro depois, pelo botão "Fazer lançamento financeiro" ([App.tsx:928](App.tsx:928)).
- Recibo (`receipts[]`) abate parcelas em aberto na ordem; se sobra valor, cria um lançamento avulso `CONFIRMADO`. O `receiptId` impede lançar duas vezes ([App.tsx:934-1024](App.tsx:934)).
- Valor de recibo só se corrige pelo pedido (Histórico → Corrigir recibo); o Financeiro recusa mexer nesse valor ([App.tsx:585-610](App.tsx:585)).
- Pedido com NF-e autorizada não pode ser excluído; excluir pedido confirmado devolve o estoque e apaga os lançamentos ligados a ele ([App.tsx:1159-1178](App.tsx:1159)).
- Carregamento (`withdrawals[]`): não pode passar do saldo contratado (checagem na tela); guarda ticket, placa, peso, saldo restante ([OrderWithdrawalModal.tsx:74](components/OrderWithdrawalModal.tsx:74)). **Não altera estoque** (a baixa já ocorreu na confirmação).
- Cada NF-e pode ser emitida no pedido, por carregamento ou avulsa (`NFA-`). NF-e avulsa é documento fiscal e não gera financeiro.

**Estoque, financeiro, frota**
- Compra de minério: estoque `britado` sobe e cria despesa. Moagem: `britado` desce, `moido` sobe. Combustível e manutenção criam despesa e atualizam horímetro ([App.tsx:465-516](App.tsx:465)).
- Usuário com escopo de caixa (migration 013) só lê e lança nos caixas da lista e **não exclui** lançamentos (regra aplicada na RLS).
- Exclusão de lançamento, conta e usuário pede reentrada da senha (`DeletionPasswordModal`), verificada só no cliente.

**Perfis** ([types.ts:28](types.ts:28), [viewAccess.ts](services/viewAccess.ts), [UserManagement.tsx:14](components/UserManagement.tsx:14))
- Cargos: Administrador, Gerente, Supervisor Operacional, Operador. Cada usuário tem também `permissions` (financeiro, fiscal, usuários, estoque, pedidos) guardadas **no JSON do perfil**.
- Essas regras decidem **quais telas aparecem** (`isViewAllowed`). Elas não são aplicadas nas gravações.

## 3. Matriz de usuários, ações e permissões

"Tela" = o que a interface libera. "Banco" = o que a RLS realmente permite hoje (migrations 011/013 + backfill 010/014, que dão `read`+`write` em todos os módulos a todo membro).

| Ação | Administrador | Gerente | Supervisor Op. | Operador (ex.: balança) | Banco (RLS) |
|---|---|---|---|---|---|
| Criar/editar pedido, cliente | Tela: sim | sim | sim (orders) | conforme `permissions.orders` | **qualquer membro** |
| Confirmar venda (baixa estoque, gera financeiro) | sim | sim | sim | conforme `orders` | qualquer membro |
| Lançar carregamento/pesagem | sim | sim | sim | **sim, sempre** (`yard` é sempre liberado) | qualquer membro. Grava o **pedido inteiro** |
| Registrar recibo / pagar parcela | sim | sim | só com `financial` | só com `financial` | qualquer membro |
| Editar/excluir lançamento financeiro | sim (senha na exclusão) | sim | não | não | **qualquer membro exclui**, salvo escopo de caixa |
| Excluir pedido | sim (senha) | sim | conforme `orders` | conforme `orders` | qualquer membro |
| Ajustar estoque / editar produto | sim | sim | sim (`inventory`) | conforme `inventory` | qualquer membro |
| Emitir/cancelar NF-e | sim | só com fiscal/financeiro | não | não | **API de cancelamento sem login** (item 3 abaixo) |
| Planilha de carregamentos | sim | sim | não | não | leitura liberada a todo membro |
| Convidar/remover usuário, delegar filial | sim | não | não | não | **servidor confere `membership.role = Administrador`** |
| Editar cargo de usuário | sim | não | não | não | banco aceita de qualquer membro (`users` sem restrição por cargo desde a 011) |
| Trocar de filial | qualquer usuário com mais de um vínculo | | | | |

## 4. Dependências entre módulos

```
Confirmar venda ─┬─► sales_orders   (status, payments[], withdrawals[] preservados)
                 ├─► inventory      (quantity − itens)              [1 upsert por produto]
                 ├─► transactions   (1 parcela SALE por pagamento)  [N upserts]
                 └─► customers      (totalSpent + total)            [1 upsert]

Recibo ─► sales_orders.receipts[] ─► transactions.paidAmount / payments[] (ou novo lançamento avulso)

Excluir pedido ─► inventory (+itens) ─► transactions (delete de todos com orderId, inclusive os de recibo)

Compra de minério ─► inventory.britado + transactions (despesa)
Moagem ─► inventory.britado − / inventory.moido +        [2 upserts independentes]
Combustível / Manutenção ─► machines.currentHorimeter + transactions (despesa, conta accounts[0])

Emitir NF-e ─► sales_orders (campos nfe*) + fiscal_config.proxNumeroNFe + customers.ibgeCode
Webhook Notaas ─► sales_orders (campos nfe*), pelo servidor, ao mesmo tempo que o navegador
```

**Cada seta é uma gravação separada, disparada em paralelo, sem transação.** Uma falha no meio deixa o sistema parcialmente atualizado (seção 5.4).

---

## 5. Riscos de sobrescrita

### 5.1 Como o problema nasce (evidência comum a vários itens)

- `db.upsert` grava a linha inteira: `supabase.from('app_records').upsert(rows, { onConflict: 'table_name,company_id,id' })` ([dataService.ts:302-306](services/dataService.ts:302)). O fluxo normal de salvar **nunca** compara com a versão do banco. A proteção contra "pendência velha" (`findStalePending`, [dataService.ts:356](services/dataService.ts:356)) só vale para reenvio da fila, não para o clique de salvar.
- `updated_at` e `data.updatedAt` são carimbados **pelo relógio do aparelho** ([dataService.ts:231, 771](services/dataService.ts:231)). Não há trigger que o defina no servidor, nem coluna de versão.
- As telas trabalham em cima de uma cópia guardada ao abrir o modal (`editingOrder`, `selectedOrderForWeigh`, `transaction`, `formData`) e reenviam **o objeto todo**.

**Simulação em memória** (script guardado no scratchpad da sessão; reproduz as fórmulas exatas do código de cada tela):

| Cenário | Esperado | Resultado |
|---|---|---|
| 1. Financeiro registra recibo de R$ 400 enquanto a balança pesa um caminhão no mesmo pedido | 1 recibo + 1 retirada | **0 recibos**, 1 retirada |
| 2. Duas pessoas pagam a mesma parcela (R$ 300 e R$ 500) | `paidAmount` 800, dois pagamentos | **`paidAmount` 500**, só `pmt-B` |
| 3. Uma venda baixa 60 t enquanto outra pessoa edita só o **preço** do produto | estoque 440 | **500** (baixa perdida) |
| 4. Duas vendas simultâneas baixam 100 t e 50 t do mesmo produto | 350 | **450** |
| 5. Dois aparelhos criam pedido ao mesmo tempo | números diferentes | **ambos `PED-2026-0002`** |
| 6. Aparelho com relógio adiantado vs. edição posterior de outro usuário | versão mais nova vence | **vence a versão velha** |

### 5.2 Onde a sobrescrita acontece

| # | Ponto | Evidência | Efeito |
|---|---|---|---|
| a | Pesagem no pátio | [YardManagement.tsx:143-156](components/YardManagement.tsx:143): `{...selectedOrderForWeigh, withdrawals}` grava o pedido inteiro a partir de uma cópia guardada no estado da tela | Apaga recibos, NF-e e edições feitas por outra pessoa no pedido; dois operadores pesando o mesmo pedido perdem retiradas uns dos outros |
| b | Edição de pedido | [SalesOrders.tsx:605](components/SalesOrders.tsx:605) `onUpdateOrder({...editingOrder, ...orderPayload})`; `receipts` e `withdrawals` vêm de `editingOrder` (linhas 547 e 598), o wizard de 3 passos pode ficar aberto por minutos | Sobrescreve recibos, retiradas e campos de NF-e criados depois da abertura |
| c | Recebimento de parcela | [ReceivePayDialog.tsx:35, 70](components/ReceivePayDialog.tsx:35): `paidAmount = snapshot.paidAmount + valor`, `payments = [...snapshot.payments, novo]` | Pagamento perdido; saldo do cliente e do caixa divergem |
| d | Estoque | [App.tsx:691-706](App.tsx:691) `quantity + delta` sobre o estado local; [Inventory.tsx:276, 372](components/Inventory.tsx:276) o formulário de produto reenvia `quantity` da abertura do modal | Baixa perdida. **Mudar só preço/nome restaura a quantidade antiga** |
| e | Cliente | [App.tsx:878-883](App.tsx:878) `totalSpent` recalculado do estado local; [fiscalService.ts:846-852](services/fiscalService.ts:846) a emissão de NF-e grava o cliente inteiro só para salvar o IBGE | Perde edição de cadastro e soma errada em `totalSpent` |
| f | Configuração fiscal | [fiscalService.ts:935, 988](services/fiscalService.ts:935) `saveConfig({...config, proxNumeroNFe})` com `config` lido antes da emissão | Desfaz mudança de chave de API/série/certificado feita durante a emissão; contador pode repetir número |
| g | Webhook Notaas | [notaas.ts:126](api/webhooks/notaas.ts:126) lê o pedido, monta o objeto e grava com `'replace'` | Corrida com qualquer edição do usuário no mesmo pedido |
| h | Agente Telegram | [tools.ts:917, 935, 971](services/agent/tools.ts:917) lê tabelas inteiras e grava registros completos com service role | Mesma classe, janela curta |
| i | Ação que só muda um campo | `handleUpdateHorimeter`, `handleUpdateStoreItem`, `handleUpdateTransportador` etc. enviam o objeto inteiro | Todo campo do registro é regravado com valor possivelmente velho |

### 5.3 Campos que a ação não deveria alterar

- **Editar pedido reescreve `sellerName` ("Vendedor Responsável"), `deliveryDate` (hoje) e `validUntil` (+15 dias)** ([SalesOrders.tsx:577-580](components/SalesOrders.tsx:577)): o vendedor real e as datas são substituídos a cada edição.
- O operador da balança, que só deveria lançar carregamento, **regrava o pedido inteiro** (pagamentos, recibos, valores) porque o banco não tem escrita por campo.
- Editar preço de produto regrava a quantidade em estoque (item d).

### 5.4 Efeito cascata e atomicidade

- **Sem transação.** `finalizeSale` dispara em paralelo: estoque, N parcelas, cliente e pedido ([App.tsx:828-924](App.tsx:828)). Se um upsert falha (RLS, rede), os outros ficam. O aviso só aparece se o estado de falha for coletado corretamente:
  - `persistCloud` é chamado **dentro** do updater do `setState` (`processStockChange`, `handleUpdateHorimeter`, `postSaleFinance`). O React pode executar o updater depois; `processStockChange` retorna `pending` antes disso, então `Promise.all(stockWrites)` pode resolver antes da gravação existir e o banner de falha de estoque fica vazio ([App.tsx:696-705](App.tsx:696)).
  - Em modo estrito (`React.StrictMode` em `index.tsx`, efeito só no desenvolvimento) o updater roda duas vezes e grava duas vezes (idempotente aqui, porque o valor é absoluto).
- **Moagem** faz dois upserts independentes (`britado` −, `moido` +) ([App.tsx:1617](App.tsx:1617)).
- **Estoque nunca fica negativo:** `Math.max(0, …)` ([App.tsx:699](App.tsx:699)) esconde a venda além do saldo em vez de registrá-la.
- **Editar pedido já confirmado não propaga**: itens/quantidade/total mudam no pedido, mas estoque, parcelas do financeiro e `totalSpent` não são recalculados ([App.tsx:1218-1233](App.tsx:1218): só há efeito na *transição* para confirmado). Isso é uma regra de negócio a validar (seção 10).
- **Excluir pedido confirmado apaga todos os lançamentos com `orderId`, inclusive os de recibo** (dinheiro já recebido) ([App.tsx:1168-1175](App.tsx:1168)). O caminho de exclusão de lançamento isolado bloqueia isso; o de pedido não.

## 6. Riscos entre filiais

O isolamento por `company_id` no banco é sólido para o caminho normal: a RLS exige vínculo e permissão por módulo (`member_can_access_record`, migration 013). Os riscos estão no **cliente** e nas **APIs com service role**.

| Ponto | Evidência | Risco |
|---|---|---|
| Cargo e permissões da filial ativa ignorados | `isViewAllowed(currentUser, …)` usa o cargo do perfil da empresa de login ([viewAccess.ts](services/viewAccess.ts), [App.tsx:1696-1819](App.tsx:1696)), não `activeMembership.role`/`permissions` | Quem é Administrador na matriz e Operador na filial mantém a interface de administrador na filial. As permissões do vínculo só aparecem como erro de RLS |
| Equipe e convites ignoram a filial ativa | [dataService.ts:1293](services/dataService.ts:1293) `fetch('/api/users/invite')` sem `companyId`; [App.tsx:736](App.tsx:736) envia `currentUser.companyId`; [companyAdmin.ts:47-50, 71-74](api/_lib/companyAdmin.ts:47) resolve pela empresa de login | Com a filial selecionada, "Equipe" mostra e altera a equipe da matriz. Pode ser intencional ("equipe compartilhada"), mas a tela não diz isso |
| `companyId` embutido no registro pode divergir da linha | `db.upsert` usa `safeRecord.companyId \|\| compKey` ([dataService.ts:770](services/dataService.ts:770)); vários fluxos gravam com `customer.companyId \|\| order.companyId` ([fiscalService.ts:846](services/fiscalService.ts:846)) e `resolveCompanyKey(user.companyId)` ([dataService.ts:1310](services/dataService.ts:1310)) em vez da empresa ativa | Para quem tem vínculo em matriz e filial, um objeto vindo de uma empresa pode ser gravado na linha de outra |
| Configuração fiscal da empresa errada | `overrideConfig \|\| getConfig(overrideConfig?.companyId)` ([fiscalService.ts:1114, 1160, 1196, 1263, 1329, 1358](services/fiscalService.ts:1114)): sem `overrideConfig` o `companyId` é `undefined` e `resolveCompanyKey` devolve **`matriz-demo`** | Hoje todos os chamadores passam config, mas qualquer chamada nova sem config lê o emitente da demonstração |
| Resposta assíncrona de outra empresa | [SalesOrders.tsx:313-315](components/SalesOrders.tsx:313) `getConfig(companyId).then(setFiscalConfig)` sem cancelamento | Trocar de filial rápido pode deixar a config fiscal da filial anterior na tela; `OrderWithdrawalModal` usa `fiscalConfig \|\| getConfig(company.id)` |
| Carga descartada ao gravar durante o carregamento | [App.tsx:219, 353](App.tsx:219): cada `persistCloud` incrementa `dataEpochRef`; se ocorrer durante `loadAllData`, o resultado inteiro (14 tabelas) é descartado sem nova tentativa | Telas vazias ou defasadas até a próxima focalização; usuário pode regravar por cima |
| Webhook e busca sem empresa | ver problema P4 | Atualiza pedido de outra empresa |
| Várias abas | O estado React da empresa ativa é por aba (bom). O cache e a fila em `localStorage` são por empresa e compartilhados entre abas ([dataService.ts:63](services/dataService.ts:63)); toda aba reenvia a fila a cada 60 s | Reenvio duplicado é idempotente, mas uma pendência antiga de uma aba pode ser reenviada depois da edição de outra |
| Fila com permissão negada | Pendência recusada pela RLS é tentada de novo a cada minuto e conta como "não sincronizado" indefinidamente | Aviso permanente para usuários com permissão restrita |

## 7. Problemas de concorrência

- **Última gravação vence sem detecção** (seção 5). Nenhuma tela avisa "este pedido mudou".
- **Numeração calculada no aparelho:** `nextOrderReference`, `nextQuoteReference`, `nextAvulsaReference`, `nextTransferCode` pegam o maior número da lista local ([ids.ts:4-58](services/ids.ts:4)); o agente Telegram usa o mesmo cálculo no servidor. Não há índice único em `(company_id, data->>'reference')` (só índices comuns, migrations 002/009). Dois usuários ao mesmo tempo geram o mesmo `PED-AAAA-NNNN`. O webhook fiscal localiza o pedido **por referência** (`findSalesOrder`), então a duplicidade também quebra a conciliação da NF-e.
- **Número da NF-e:** `proxNumeroNFe` é lido da configuração local e incrementado com gravação absoluta (item 5.2f). Duas emissões próximas usam o mesmo valor.
- **Ticket de pesagem:** `PES-<6 dígitos aleatórios>` e `RET-${Date.now()}` gerados no aparelho ([OrderWithdrawalModal.tsx:47, 75](components/OrderWithdrawalModal.tsx:47)). Não é sequencial e não é único por garantia.
- **Saldo do pedido conferido só na tela:** dois operadores carregando o mesmo pedido veem o mesmo saldo e ambos passam na checagem; nada no banco impede exceder o contratado.
- **Relógio do cliente decide quem é mais novo:** `mergeRecordsByUpdatedAt` ([persistSeed.ts:70](services/persistSeed.ts:70)) compara `updatedAt` carimbado pelo aparelho, e empate favorece a versão local. Aparelho com data errada ganha conflitos que não deveria.
- **Sem proteção contra clique repetido** em criar/editar pedido e em registrar carregamento: só `ReceivePayDialog` e `TransactionFormDialog` têm `saving`. A referência é calculada do estado da tela, então um clique duplo pode gerar dois pedidos com o mesmo número, cada um com baixa de estoque e parcelas.
- **Efeito colateral em GET:** `GET /api/users/invite` ([invite.ts:37-121](api/users/invite.ts:37)) grava perfis, **apaga** perfis sem vínculo, atualiza metadados no Auth e preenche permissões, e é chamado por **todo** membro a cada foco da janela. Duas sessões concorrentes fazem o mesmo trabalho em paralelo, e a rota varre `app_records` de todas as empresas (`limit(20000)`) e a lista de usuários do Auth a cada chamada.
- **Deleção sem checagem de versão:** uma exclusão feita por A é desfeita por qualquer salvamento de B com a cópia antiga (o objeto inteiro recria a linha).

## 8. Falhas de rastreabilidade

Nenhuma tabela ou trigger de auditoria existe para o app (`grep audit` nas migrations só encontra `telegram_audit`).

| Requisito | Situação |
|---|---|
| Usuário responsável | Não gravado. `sellerName` é o texto fixo "Vendedor Responsável" ([SalesOrders.tsx:577](components/SalesOrders.tsx:577)); `receivedBy` é "Caixa / Recepção"; `loadedBy` vem de um campo editável; nenhum registro tem `createdBy`/`updatedBy` |
| Filial | `companyId` está no registro e na linha (ok), mas pode divergir (seção 6) |
| Data e hora | `updatedAt` do relógio do aparelho; `created_at` do servidor só existe desde a migration 007 e não é lido pelo app |
| Ação executada | Só no Telegram (`telegram_audit`) e `origin: 'telegram'` nos registros que ele grava |
| Valor anterior / posterior | Nunca. A gravação substitui o JSON sem guardar o anterior |
| Exclusões | Físicas e sem registro (`db.delete` → `DELETE`). A senha pedida na exclusão é verificada no cliente |
| Alterações feitas por API com service role | Não deixam rastro além de `updated_at` |
| Cargo/permissões de usuários | Mudança de vínculo não gera histórico |

---

## 9. Problemas confirmados

Cada problema indica se está **confirmado** (evidência direta no código e/ou reproduzido em simulação) ou **a validar** (depende de configuração que não consegui ver). Nenhum foi testado em produção.

### P0-1 · Cadastro permite escolher a empresa e o cargo do novo usuário
- **Regra de negócio:** cada empresa só é acessada por quem foi vinculado a ela pelo administrador (invite) ou por quem a criou no cadastro.
- **Ação que provoca:** `signUp` com `options.data = { companyId, role }`; o trigger `create_company_membership_for_new_user` cria o vínculo com esses valores.
- **Usuário/perfil:** qualquer pessoa que consiga cadastrar uma conta (tela "Criar Nova Conta" existe; `role` padrão é Administrador).
- **Evidência:** trigger em [003_secure_multi_tenant_access.sql:27-52](supabase/migrations/003_secure_multi_tenant_access.sql:27) usa `raw_user_meta_data ->> 'companyId'` e `'role'`, campos **fornecidos pelo próprio cliente** no cadastro ([dataService.ts:1065-1078](services/dataService.ts:1065)). `current_company_id()` e `ensure_own_company_membership()` (migrations 007/008) confiam no mesmo campo. O identificador gerado no app é `comp-${Date.now()}` ([dataService.ts:1060](services/dataService.ts:1060)), previsível. Depois, `GET /api/users/invite` preenche permissão total para qualquer vínculo vazio ([invite.ts:155-171](api/users/invite.ts:155)).
- **Cenário real:** alguém chama a API de cadastro do Supabase direto, informando o `companyId` de uma empresa existente e `role: Administrador`; passa a ver e alterar os dados dela.
- **Dados afetados:** todos os módulos de qualquer empresa cujo identificador seja conhecido ou adivinhado.
- **Impacto:** mistura total entre empresas.
- **Prioridade:** **P0 — a validar.** Depende de o cadastro público estar habilitado no Auth e de o trigger em produção ser o desta migration.
- **Correção sugerida:** o trigger não aceitar `companyId`/`role` de `raw_user_meta_data`; usar `raw_app_meta_data` (só o servidor grava) e criar o vínculo do convite pela API administrativa.
- **Risco da correção:** médio. O fluxo de convite e de "arrumar equipe" depende desse metadado; precisa de teste em branch do Supabase antes.

### P0-2 · `/api/admin/tenants` lista, copia e apaga dados de qualquer empresa
- **Regra de negócio:** administrador gere apenas a própria empresa e suas filiais.
- **Ação que provoca:** `GET` (lista empresas), `POST merge` (copia todos os registros de uma empresa para outra), `POST dedupe-users` (apaga perfis duplicados).
- **Usuário/perfil:** qualquer **Administrador de qualquer empresa**. O cadastro público cria Administrador da própria empresa.
- **Evidência:** [tenants.ts:41](api/admin/tenants.ts:41) só chama `requireCompanyAdmin`. `GET` devolve todas as empresas com nome, e-mail e cargo de cada usuário ([tenants.ts:45-77](api/admin/tenants.ts:45), [tenantMerge.ts:110-129](services/tenantMerge.ts:110)). `merge` aceita **qualquer** `sourceCompanyId` e copia clientes, pedidos, lançamentos e **configuração fiscal com a chave da API**, e ainda copia os vínculos de membros ([tenants.ts:101](api/admin/tenants.ts:101)). `dedupe-users` aceita `companyId` arbitrário ([tenants.ts:81](api/admin/tenants.ts:81)). Tudo com service role.
- **Cenário real:** um administrador de uma empresa nova chama `GET` para descobrir os identificadores das demais e faz `merge` do identificador alheio para a própria empresa.
- **Dados afetados:** todos os módulos de qualquer empresa (cópia); perfis de usuários (exclusão).
- **Impacto:** vazamento completo entre empresas.
- **Prioridade:** **P0 — confirmado no código; não executado.**
- **Correção sugerida:** restringir a uma lista de super-administradores (ids em variável de ambiente) ou desativar após a migração da CBA; exigir que origem e destino pertençam ao chamador.
- **Risco da correção:** baixo. Ferramenta de uso pontual; confirmar com a operação se a tela de "pastas" ainda é usada.

### P0-3 · Rotas de NF-e sem autenticação
- **Regra de negócio:** só usuários da empresa emitem, consultam e cancelam as notas dela.
- **Ação que provoca:** `POST /api/nfe/cancelar` e `/api/nfe/consultar` com `companyId` + `invoiceId`.
- **Usuário/perfil:** qualquer pessoa na internet que conheça o `companyId` e o id da nota.
- **Evidência:** [cancelar.ts:13-30](api/nfe/cancelar.ts:13) e [consultar.ts:25-35](api/nfe/consultar.ts:25) não leem token; sem `apiKey` no corpo, buscam a chave salva da empresa com service role (`getFiscalConfigForCompany`). CORS `Access-Control-Allow-Origin: *` ([fiscalProxy.ts:83](api/_lib/fiscalProxy.ts:83)). `emitir.ts` também aceita qualquer chamada e cai em `NOTAAS_API_KEY` global ([emitir.ts:24](api/nfe/emitir.ts:24)).
- **Cenário real:** cancelar uma NF-e autorizada de outra empresa; emitir usando a chave compartilhada do servidor.
- **Dados afetados:** notas fiscais e status dos pedidos.
- **Impacto:** cancelamento e consulta fiscal indevidos entre empresas; possível emissão pela conta global.
- **Prioridade:** **P0 (cancelamento) / P1 (consulta e emissão)** — confirmado no código.
- **Correção sugerida:** exigir `Authorization: Bearer` e validar vínculo com o `companyId`; nunca aceitar chave nem `companyId` vindos do corpo sem essa validação; decidir se a chave global deve existir.
- **Risco da correção:** médio. O frontend precisa enviar o token; testar emissão, cancelamento e consulta.

### P1-4 · Webhook fiscal: sem segredo aceita tudo, busca sem empresa, regrava o pedido inteiro
- **Regra de negócio:** o retorno da NF-e atualiza apenas os campos fiscais do pedido correto.
- **Ação que provoca:** `POST /api/webhooks/notaas`.
- **Usuário/perfil:** chamador externo (Notaas) ou qualquer um, se o segredo faltar.
- **Evidência:** `if (!expected) return true` ([notaas.ts:9](api/webhooks/notaas.ts:9)); o mesmo padrão no webhook do Telegram ([webhook.ts:58](api/_lib/telegram/webhook.ts:58)). `findSalesOrder` sem `companyId` procura por `reference` em **todas** as empresas e pega o primeiro de até 5 ([supabaseAdmin.ts:63-127](api/_lib/supabaseAdmin.ts:63)); a referência `PED-AAAA-NNNN` repete em cada empresa. A gravação é `replace` do objeto lido antes ([notaas.ts:126](api/webhooks/notaas.ts:126)).
- **Cenário real:** o webhook chega sem `?companyId` e atualiza o pedido de mesmo número de outra empresa; ou chega enquanto alguém registra um recibo e o apaga.
- **Dados afetados:** pedidos (campos `nfe*` e o resto do JSON).
- **Impacto:** nota vinculada ao pedido errado; perda de edição.
- **Prioridade:** **P1 — a validar** (como a URL do webhook está cadastrada na Notaas e se `NOTAAS_WEBHOOK_SECRET`/`TELEGRAM_WEBHOOK_SECRET` estão definidos na Vercel).
- **Correção sugerida:** falhar fechado sem segredo; exigir `companyId`; atualizar só os campos `nfe*` (merge no banco).
- **Risco da correção:** baixo a médio. Conferir a URL cadastrada na Notaas antes de exigir `companyId`.

### P0-5 · Última gravação vence na linha inteira (perda de recibos, retiradas, pagamentos)
- **Regra de negócio:** recibos, retiradas e pagamentos registrados por uma pessoa nunca podem sumir por causa de outra ação válida.
- **Ação que provoca:** salvar pedido/lançamento a partir de uma cópia antiga (5.2 a, b, c, g).
- **Usuário/perfil:** Operador da balança, financeiro, vendedor, webhook, Telegram, ao mesmo tempo.
- **Evidência:** 5.1 e 5.2; simulação cenários 1 e 2.
- **Cenário real:** o financeiro registra recibo de R$ 400 no pedido; nos mesmos segundos a balança pesa um caminhão do mesmo pedido; o recibo some do pedido, embora o lançamento no Financeiro possa já ter sido criado. **Caixa e saldo do cliente ficam divergentes** e nenhum erro aparece.
- **Dados afetados:** `sales_orders.receipts/withdrawals/payments/nfes`, `transactions.payments/paidAmount`.
- **Impacto:** dinheiro e carga sem registro no pedido; contas a receber incorretas.
- **Prioridade:** **P0 — confirmado.**
- **Correção sugerida:** (1) `updated_at`/versão definidos pelo servidor e gravação condicional ("só grava se a versão for a que li"), com recarga e aviso no conflito; (2) operações de acréscimo em lista (recibo, retirada, pagamento) feitas no banco por função que anexa o item, sem reenviar o objeto; (3) telas de ação única enviando só os campos que mudam.
- **Risco da correção:** médio. Migration aditiva e sem mudança de dado. O risco está em mexer no caminho de gravação de todas as telas; fazer por módulo, começando por pedidos, com testes e branch.

### P0-6 · Estoque como número absoluto do navegador
- **Regra de negócio:** confirmar a venda baixa o estoque; excluir devolve.
- **Ação que provoca:** confirmar venda, excluir pedido, compra, moagem, editar produto, Telegram.
- **Usuário/perfil:** qualquer um que venda, compre ou edite produto.
- **Evidência:** [App.tsx:691-706](App.tsx:691), [Inventory.tsx:276, 372](components/Inventory.tsx:276), [dataService.ts:1381](services/dataService.ts:1381), `applySaleStock` no Telegram. Simulação, cenários 3 e 4.
- **Cenário real:** duas vendas de aparelhos diferentes; o saldo reflete só uma. Ou o gerente ajusta o preço enquanto uma venda baixa 60 t, e a quantidade volta ao valor anterior.
- **Dados afetados:** `inventory.quantity`, `store_items.quantity`.
- **Impacto:** estoque inflado ou defasado, sem histórico para reconstruir.
- **Prioridade:** **P0 — confirmado.**
- **Correção sugerida:** movimentação por delta no banco (função atômica) e livro de movimentações (quem, quando, por quê); parar de enviar `quantity` no formulário de edição de produto.
- **Risco da correção:** médio-alto. Muda a fonte do saldo. Precisa de conciliação inicial por contagem física e de decidir o tratamento de saldo negativo (regra humana).

### P1-7 · Numeração duplicada (pedido, orçamento, NF avulsa, transferência, NF-e, ticket)
- **Regra de negócio:** cada documento tem número sequencial único por empresa.
- **Evidência:** [ids.ts:4-58](services/ids.ts:4), [App.tsx:774](App.tsx:774), [fiscalService.ts:935](services/fiscalService.ts:935), [OrderWithdrawalModal.tsx:47](components/OrderWithdrawalModal.tsx:47); nenhum índice único de referência. Simulação, cenário 5.
- **Cenário real:** dois vendedores criam pedido ao mesmo tempo e ambos ficam `PED-2026-0002`; o webhook fiscal atualiza o pedido errado.
- **Dados afetados:** `reference`, `code`, `proxNumeroNFe`, `weighTicketNumber`.
- **Impacto:** documentos ambíguos, conciliação fiscal errada.
- **Prioridade:** **P1 — confirmado.**
- **Correção sugerida:** contador por empresa incrementado no banco (função atômica) e índice único parcial em `(company_id, data->>'reference')` para pedidos.
- **Risco da correção:** médio. Antes do índice único é preciso checar duplicidades já existentes (consulta somente leitura).

### P1-8 · Relógio do aparelho define a versão "mais nova"
- **Evidência:** `updatedAt` carimbado no cliente ([dataService.ts:771](services/dataService.ts:771), [App.tsx:195](App.tsx:195)); comparação em [persistSeed.ts:70](services/persistSeed.ts:70) e [dataService.ts:671](services/dataService.ts:671); sem trigger de `updated_at`. Simulação, cenário 6.
- **Cenário real:** o computador da balança está adiantado; toda cópia dele vence as edições dos outros na recarga e na fila.
- **Prioridade:** **P1 — confirmado.** Sai junto com P0-5.
- **Correção sugerida:** trigger `before update` definindo `updated_at = now()` no servidor e usá-lo como versão.
- **Risco da correção:** baixo (aditivo), mas o código que compara `updatedAt` do JSON precisa passar a ler a coluna.

### P1-9 · Cascata parcial e não atômica (finalizar venda, excluir pedido, moagem)
- **Regra de negócio:** confirmar venda baixa estoque, gera parcelas e atualiza o cliente, tudo ou nada.
- **Evidência:** 5.4.
- **Cenário real:** a RLS recusa o upsert de uma parcela (permissão do caixa) e o estoque já foi baixado; ou a rede cai no meio e só parte das parcelas existe.
- **Impacto:** pedido confirmado sem financeiro completo; `totalSpent` diferente da soma das vendas.
- **Prioridade:** **P1 — confirmado.**
- **Correção sugerida:** função no banco que executa a confirmação em uma transação (ou, no mínimo, ordem definida e reversão em caso de erro); remover gravação de dentro do updater do `setState`.
- **Risco da correção:** médio-alto (regra de negócio central). Reescrever depois de fechar os itens P0.

### P1-10 · Permissões e cargos só na interface; exclusão física sem registro
- **Regra de negócio:** perfis restringem o que cada pessoa vê e faz.
- **Evidência:** [010](supabase/migrations/010_companies_and_permissions.sql) e [014](supabase/migrations/014_fill_empty_member_permissions.sql) dão `read`+`write` em **todos** os módulos; [invite.ts:155-171](api/users/invite.ts:155) repete o preenchimento; a migration [011](supabase/migrations/011_permission_based_rls.sql) **removeu** a regra da [005](supabase/migrations/005_protect_user_profiles.sql) que limitava escrita em `users` a administrador/próprio usuário. `UserPermissions` (financeiro, fiscal etc.) só vive no JSON do perfil e no menu.
- **Cenário real:** um Operador com o console do navegador (ou um bug) altera cargo de usuário, exclui lançamentos ou lê `fiscal_config` (chave da API). Excluir é `DELETE` definitivo.
- **Impacto:** as regras de perfil dependem da boa-fé da interface.
- **Prioridade:** **P1 — confirmado no código.**
- **Correção sugerida:** presets de permissão por cargo gravados no vínculo (`permissions`) e aplicados pela RLS (já suportada); restaurar a restrição de `users`; exclusão lógica (marca e registra) para financeiro e pedidos.
- **Risco da correção:** médio-alto. Restringir pode bloquear fluxos que hoje "funcionam por acidente" (ex.: Operador da balança gravando o pedido inteiro). Fazer depois de P0-5.

### P2-11 · Editar pedido reescreve vendedor e datas
- **Evidência:** [SalesOrders.tsx:577-580](components/SalesOrders.tsx:577).
- **Cenário real:** corrigir uma observação do pedido troca o vendedor por "Vendedor Responsável" e a previsão de entrega por hoje.
- **Prioridade:** **P2 — confirmado.**
- **Correção sugerida:** no modo edição, preservar `sellerName`, `deliveryDate` e `validUntil` do registro; gravar o usuário real na criação.
- **Risco da correção:** baixo.

### P2-12 · Filial: papel/permissões do vínculo ativo e equipe pela empresa de login
- **Evidência:** seção 6 (linhas 1 e 2 da tabela).
- **Cenário real:** administrador da matriz, operador na filial, vê e usa todos os menus na filial. Convite feito com a filial ativa cai na matriz.
- **Prioridade:** **P2 — confirmado.** Parte é decisão de negócio (seção 10).
- **Correção sugerida:** `isViewAllowed` usar o vínculo da empresa ativa; a API de equipe receber `companyId` e validar.
- **Risco da correção:** médio: muda quem enxerga o quê na filial.

### P2-13 · Alteração de cargo pela tela de Usuários não persiste
- **Regra de negócio:** o administrador altera o cargo de um colaborador.
- **Evidência:** `saveUser` grava só o JSON do perfil ([dataService.ts:1308-1310](services/dataService.ts:1308)); a fonte do cargo é `company_memberships.role`; o `GET` de equipe recompõe o perfil com `role: membership.role` ([companyUsers.ts:85](services/companyUsers.ts:85)). O vínculo só muda quando há troca de senha (POST `invite` do usuário existente).
- **Cenário real:** o administrador promove um operador, a tela confirma e, na próxima leitura da equipe, o cargo volta.
- **Prioridade:** **P2 — provável; validar em tela** (não simulei o fluxo completo).
- **Correção sugerida:** mudança de cargo passar pela API que atualiza o vínculo.
- **Risco da correção:** baixo.

### P2-14 · Perfis sem login são apagados pela listagem da equipe
- **Evidência:** `toRemove` = perfis da empresa sem vínculo ([companyUsers.ts:103-113](services/companyUsers.ts:103)), executado em `GET` por qualquer membro ([invite.ts:70-77](api/users/invite.ts:70)).
- **Cenário real:** um perfil cadastrado só para constar na equipe (sem login) desaparece na próxima abertura de qualquer tela.
- **Prioridade:** **P2 — a validar** (existem perfis assim em produção?).
- **Correção sugerida:** separar leitura de reparo; reparo só por ação explícita de administrador.
- **Risco da correção:** baixo.

### P2-15 · Carga inicial descartada e falha de gravação silenciosa
- **Evidência:** [App.tsx:219, 353](App.tsx:219); `persistCloud` é fire-and-forget e mostra apenas o banner ([App.tsx:214-236](App.tsx:214)).
- **Cenário real:** o usuário grava logo ao abrir; a carga inteira é ignorada e as telas ficam vazias até a próxima focalização. Uma falha de RLS aparece só como aviso no topo.
- **Prioridade:** **P2 — confirmado.**
- **Correção sugerida:** contador de "épocas" por tabela em vez de global; refazer a carga descartada.
- **Risco da correção:** baixo.

### P3-16 · Clique repetido, `accounts[0]` fixo, precisão do Telegram
- Criar pedido e registrar retirada sem `saving`/`disabled` (única defesa é o modal fechar).
- Compras, combustível e manutenção lançam na `accounts[0]` (ordem de carga do estado), não na conta escolhida ([App.tsx:471, 488, 506, 1564-1585](App.tsx:471)).
- O Telegram arredonda quantidade a 2 casas (`round2`) e o app usa 3 (`roundTons`), e as quantidades são gravadas por valor absoluto.
- **Prioridade:** **P3 — confirmado.** Correção de baixo risco, por tela.

---

## 10. Pontos que ainda precisam de validação humana

**Sobre a operação da empresa (regra de negócio):**
1. Editar um pedido **já confirmado** deve recalcular estoque, parcelas e `totalSpent`, ou a edição é só documental? Hoje nada é recalculado.
2. Excluir pedido confirmado deve apagar também os lançamentos de **recibos** (dinheiro recebido)? Hoje apaga.
3. Estoque pode ficar negativo? Hoje o sistema trava em zero e esconde a diferença.
4. A equipe deve ser **compartilhada** entre matriz e filiais, ou cada filial tem a sua? O código sugere compartilhada, mas a tela não deixa isso claro.
5. Cargo por filial: o usuário pode ter cargos diferentes em cada filial e a interface deve refletir o vínculo ativo?
6. O Operador da balança deve poder ler valores e recibos do pedido, ou só o carregamento?
7. Quais campos do pedido a balança pode alterar? Isso define o corte da atualização por campo.
8. Existem perfis de equipe **sem login** que precisam ser mantidos (item P2-14)?
9. A chave global `NOTAAS_API_KEY` deve existir, ou toda empresa emite só com a própria?

**Sobre o banco e a infraestrutura (precisam de acesso que eu não tinha):**
10. O cadastro público do Supabase Auth está habilitado? Confirmação de e-mail está ligada? (P0-1)
11. O trigger de cadastro em produção é o da migration 003 ou já foi alterado?
12. `NOTAAS_WEBHOOK_SECRET` e `TELEGRAM_WEBHOOK_SECRET` estão definidos na Vercel? A URL do webhook na Notaas leva `?companyId=`? (P1-4)
13. Já existem pedidos com `reference` duplicada dentro da mesma empresa? (consulta somente leitura, antes de qualquer índice único)
14. Políticas e permissões reais em produção batem com as migrations (`company_memberships.permissions` de cada usuário)?
15. A tela de "pastas da empresa" (merge) ainda é usada pela operação? (P0-2)

**Testes que devem ser feitos com pessoas, em ambiente de teste (não em produção):** repetir os cenários 1 a 5 da seção 5.1 com dois navegadores e duas contas reais numa empresa de teste, para confirmar o efeito fora da simulação.

## 11. Plano de correção por prioridade

Nada abaixo foi executado. Toda mudança de banco seria **migration nova, aditiva**, aplicada primeiro em branch do Supabase.

| Ordem | Item | Ação | Esforço | Risco | Depende de |
|---|---|---|---|---|---|
| 1 | P0-1 | Trigger de cadastro ignora `companyId`/`role` do cliente; usa metadado só-servidor | Baixo | Médio | Respostas 10 e 11 |
| 2 | P0-2 | Restringir `/api/admin/tenants` a super-administradores ou desligar | Baixo | Baixo | Resposta 15 |
| 3 | P0-3 | Exigir login e vínculo em `/api/nfe/*` | Médio | Médio | — |
| 4 | P1-4 | Webhooks falham fechado sem segredo; exigir `companyId`; atualizar só `nfe*` | Baixo | Baixo-médio | Resposta 12 |
| 5 | P1-8 + P0-5 (base) | Trigger de `updated_at` no servidor e gravação condicional por versão, começando por `sales_orders` e `transactions`; aviso de conflito na tela | Médio | Médio | — |
| 6 | P0-5 | Recibo, retirada e pagamento anexados por função do banco, sem reenviar o objeto | Médio | Médio | 5 |
| 7 | P0-6 | Movimentação de estoque por delta + livro de movimentações; parar de enviar `quantity` na edição de produto | Alto | Médio-alto | Respostas 3 e contagem física |
| 8 | P1-7 | Contador por empresa no banco + índice único de referência | Médio | Médio | Resposta 13 |
| 9 | Rastreabilidade | Tabela `audit_log` alimentada por trigger em `app_records` (usuário, empresa, ação, valor anterior/posterior); `created_by`/`updated_by`; exclusão lógica | Médio | Baixo (não altera comportamento) | — |
| 10 | P1-10 | Presets de permissão por cargo na RLS; restaurar restrição de `users` | Alto | Médio-alto | 6, 7 |
| 11 | P1-9 | Confirmação de venda em transação única | Alto | Médio-alto | 5-7 |
| 12 | P2-11 a P2-15, P3-16 | Correções pontuais por tela | Baixo | Baixo | — |

**Sugestão de começar pelo item 9 (auditoria)** em paralelo com 1 a 4: ele não muda nenhuma regra, dá visibilidade imediata sobre quem altera o quê e permite medir quanta sobrescrita já acontece na operação antes de mexer no caminho de gravação.

---

*Arquivos criados por esta auditoria: este relatório e um script de simulação no scratchpad da sessão (fora do repositório). Nenhum arquivo do projeto foi alterado, nenhuma migration foi criada e nenhum dado foi lido ou escrito no banco.*
