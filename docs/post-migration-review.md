# Pendências após a migração

Base revisada: `412f60bf138b23223f11eabb341af84a783708f8`.

## Correção preparada nesta branch

Os webhooks fiscal e Telegram recusam POST quando o segredo do servidor está ausente, incorreto ou o header não é uma string. Os endpoints GET de saúde continuam disponíveis. Configure os segredos na Vercel e nos provedores antes de publicar. Testes cobrem a rejeição nos dois handlers antes de qualquer acesso ao banco ou processamento do evento.

## Validar no banco correto antes de alterar migrations

O projeto do CalcFlow25 não foi identificado entre os projetos Supabase disponíveis nesta sessão. Nenhum SQL foi executado na produção.

- Conferir quais migrations e funções realmente estão aplicadas. O README menciona apenas 001 a 007, mas o repositório contém até 014, com dois arquivos de prefixo 008. Não reaplicar todos os arquivos em produção: existem policies criadas sem `DROP` e backfills que concedem permissões.
- Comparar os totais da origem e do destino por empresa e módulo, valores financeiros, pedidos, estoque e vínculos de usuários. Contagem isolada não confirma fidelidade dos dados.
- Conferir RLS, grants e permissões com sessões de usuários distintos, incluindo usuário recém-cadastrado e usuário restrito a uma filial/conta.
- Verificar a criação de novos vínculos: o trigger e `ensure_own_company_membership` inserem vínculo sem `permissions`; a 010 define default vazio, a 011 exige permissões e a 014 apenas preenche vínculos que já existem. Confirmar as definições reais das funções antes de corrigir o fluxo de cadastro.
- Revisar a origem de companyId e role no bootstrap de membership. Metadados editáveis pelo usuário não devem conceder associação a uma empresa existente. Convites devem ser resolvidos pelo servidor.

## Correções operacionais pendentes

1. **Concorrência:** `db.upsert` grava JSON inteiro sem comparar a versão lida. Implementar controle de versão no banco e rejeição explícita de edição desatualizada. Não resolver apenas com timestamps do navegador.
2. **Venda indivisível:** mover finalização, movimentos de estoque e parcelas para operação transacional, autorizada e idempotente no servidor/banco. Testar falha intermediária e duas confirmações simultâneas.
3. **Sincronização de exclusões:** `App.tsx` combina a leitura remota com todo o estado anterior, preservando registros excluídos por outro aparelho. Distinguir pendências locais de registros já confirmados antes de mudar essa reconciliação.
4. **Conflitos da fila:** não descartar alterações antigas apenas com `console.warn`. Preservar cópia recuperável e mostrar conflito para o operador.
5. **Eventos fiscais:** `findSalesOrder` permite busca sem companyId e `patchSalesOrder` substitui o documento após leitura. Exigir resolução inequívoca de empresa/nota e atualização com proteção de versão para não apagar recebimentos simultâneos.
6. **IA na interface:** `geminiService.ts` usa `process.env.API_KEY`, enquanto o Vite substitui `process.env` por `{}`. Mover para endpoint autenticado no servidor.

## Critério de conclusão

Dois usuários devem conseguir operar ao mesmo tempo sem perder edições; uma venda deve confirmar todos os efeitos uma única vez; usuário sem autorização não deve ler nem escrever em outra empresa; eventos fiscais não devem alterar pedidos de outro emitente; divergências entre origem e destino devem estar documentadas e resolvidas. Esses critérios ainda não foram verificados na produção.
