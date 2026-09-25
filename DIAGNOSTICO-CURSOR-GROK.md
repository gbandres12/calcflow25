# Diagnóstico: Cursor + Grok no CalcárioFlow

Data: 2026-09-24 · Estado: `tsc` limpo, `npm test` 100/100 passando.

## 🔴 Crítico (fazer já)
1. **Chave da TestSprite commitada** em `.cursor/mcp.json` (versionado desde `7819b63`). Rotacione a chave no painel da TestSprite, troque por `"API_KEY": "${env:TESTSPRITE_API_KEY}"` e adicione `.cursor/mcp.json` ao `.gitignore` (ou mantenha só um `mcp.example.json`).
2. **Teste fora da suíte**: `services/nfeComplementares.test.ts` não está no script `test` → nunca roda. A lista manual vai continuar esquecendo arquivos; troque por glob:
   `"test": "node --import tsx --test 'services/**/*.test.ts'"` (Node ≥ 21).

## 🟠 Alto impacto para o agente (contexto)
Arquivos enormes estouram o contexto do modelo e geram edições erradas/truncadas:

| Arquivo | Linhas |
|---|---|
| components/SalesOrders.tsx | 2723 |
| components/TransferManagement.tsx | 1710 |
| App.tsx | 1647 |
| services/fiscalService.ts | 1496 |
| components/Inventory.tsx | 1444 |
| services/agent/tools.ts | 1412 |

Meta: < 600 linhas por arquivo. Padrão já existe e funciona: `services/domain/*` (lógica pura + teste). Continuar extraindo de `SalesOrders.tsx` (cálculos, filtros, modais) e rotas/estado de `App.tsx`.

3. **`strict: false`** no tsconfig + ~230 `any`. O Grok confia nos tipos para não inventar campos; sem strict ele "compila" bugs. Caminho gradual: ligar `strictNullChecks` primeiro, corrigir por pasta.
4. **Três backends** (Supabase, Firestore legado, localStorage). Documentado na regra; ideal é remover Firebase (`services/firebase*.ts`, `src/services/firebaseConfig.ts`, `firestore.rules`) quando não houver mais leitura dele — cada caminho morto é uma chance do agente escrever no lugar errado.
5. **Duplicação** `src/services/supabaseClient.ts` vs `services/supabaseClient.ts` (idem firebaseConfig). Manter um só.

## 🟡 Configuração do Cursor
- ✅ Criado `.cursor/rules/projeto.mdc` (alwaysApply) com arquitetura, onde colocar código, regras fiscais e checklist de verificação.
- Criar `.cursorignore` com `dist/`, `node_modules/`, `bun.lock`, `package-lock.json`, `testsprite_tests/` para não poluir a indexação.
- Dois lockfiles (`bun.lock` + `package-lock.json`): escolha um — o agente alterna gerenciadores e desalinha dependências.
- `.mcp.json` (Claude) e `.cursor/mcp.json` duplicam o Supabase MCP; ok, mas o do Cursor tem `features=...development,branching` com acesso de escrita ao projeto de **produção** (`qbnmtimnurbciuzqtlxd`). Recomendo `&read_only=true` e aplicar migrations manualmente.

## 🟢 Dicas de uso com Grok
- Modo Agent com a regra acima; peça sempre "rode tsc e npm test no fim".
- Tarefas pequenas e com arquivo citado (`@components/OrderWithdrawalModal.tsx`) — melhor que "arruma o pedido".
- Em mudanças fiscais, peça primeiro o teste que reproduz o caso, depois a correção.
- Revise o diff antes de aceitar em arquivos > 1000 linhas; modelos tendem a apagar blocos silenciosamente nesses arquivos.

## Trabalho em andamento (não commitado)
`Loadings.tsx`, `services/domain/loadings.ts` (+teste), `thermalTicket.ts` e alterações em `OrderWithdrawalModal`/`YardManagement`. `thermalTicket.ts` não tem teste.
