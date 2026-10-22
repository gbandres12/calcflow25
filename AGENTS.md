# AGENTS.md — CalcárioFlow ERP (notas do ambiente Base44)

## Como o app roda aqui

```bash
docker compose -f docker-compose.base44.yml up -d --build
docker compose -f docker-compose.base44.yml logs -f web
```

- Serviço único `web` (`node:22-bookworm-slim`), código do repo montado em `/app`,
  porta **3000**, healthcheck em **`/api/health`**.
- O comando de desenvolvimento é **`npx tsx server.ts`**, não `npm run dev`.
  `npm run dev` sobe só o Vite na 5173 e **sem** as rotas `/api/*`; o `server.ts`
  sobe o Express na 3000 com o Vite em modo middleware (HMR) e todas as rotas
  de `api/` que na Vercel são funções serverless.
- `npm ci` roda no boot do container (lockfile `package-lock.json`). Existe também
  um `bun.lock`, mas o fluxo do repo é npm — não troque sem motivo.
- `npm start` é o build de produção (`dist/`), não use para o preview: ele não
  reflete edições.

## Supabase (serviço externo)

- O Supabase é a fonte da verdade (`app_records`); o `localStorage` é só cache e
  fila de reenvio. **Sem credenciais o app ainda sobe** e mostra a tela de login,
  mas nenhuma conta autentica e nenhuma escrita fora da empresa demo `matriz-demo`
  é aceita (`Supabase não está configurado...`).
- Credenciais chegam pelo env_file `/run/base44/app.env` (por último na lista, para
  o valor do dashboard sempre vencer). Nunca coloque `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` em `environment:` do
  compose: isso congelaria o valor e ignoraria o dashboard.
- O frontend lê `VITE_*` **no boot do Vite**; depois de mudar uma credencial, o
  serviço precisa ser recriado (a plataforma faz isso sozinha quando o valor vem
  do dashboard).
- As migrations `supabase/migrations/001`–`030` precisam estar aplicadas no projeto
  Supabase. As de número 015+ criam o schema `erp.*`, usado por `services/repo/`
  quando a feature flag do módulo está em `shadow`/`new` (padrão é `legacy`, que
  usa `app_records`).

## Quirks que confundem

- **Login demo não aparece no preview.** `admin@calcarioflow.com.br` / `123456` e os
  botões de acesso rápido só existem quando `window.location.hostname` é
  `localhost`/`127.0.0.1` (`services/authLogic.ts: isLocalDevHost`). Pelo proxy do
  Base44 o host é outro, então use uma conta real do Supabase Auth.
- O Vite tem allowlist de Host (`vite.config.ts`). Ela é ampliada com
  `.${BASE44_SANDBOX_HOST_DOMAIN}` **somente** quando `BASE44_PREVIEW_MODE === "1"`;
  sem a flag o comportamento é o original (`terminal.local`).
- `api/_lib/supabaseAdmin.ts` usa o client service role e só responde com
  `SUPABASE_URL`/`VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` presentes.
- `functions/` é o Cloud Functions legado do Firebase (Firestore) e não participa
  do runtime atual — o app usa Supabase.
- A pasta `scripts/*.cjs` chama a API do Supabase (`api.supabase.com`) com
  `PROJECT_REF`/`SUPABASE_ACCESS_TOKEN`; são utilitários manuais, não rodam no boot.

## Verificação

- HTTP: `curl -s localhost:3000/api/health` → `{"status":"ok",...}`.
- Fonte viva: `curl -s localhost:3000/index.tsx` deve devolver TSX não empacotado
  (`"DEV": true`). Se voltar bundle com hash, o preview está servindo build de
  produção e o loop de edição está quebrado.
- Testes: `npm test` (typecheck + `node --test`, 25 arquivos). No sandbox rode só os
  arquivos que cobrem a mudança, em vez da suíte inteira.
