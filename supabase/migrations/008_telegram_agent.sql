-- Agente financeiro no Telegram.
--
-- Nenhuma destas tabelas é lida pelo frontend: quem fala com elas é o webhook,
-- que usa a service role. Por isso todas ficam com RLS ligada e política
-- negando anon e authenticated, no mesmo padrão das tabelas legadas na 003.
-- O isolamento entre empresas vem do company_id gravado no vínculo do chat.

-- Chats autorizados. Um chat pertence a exatamente um usuário e uma empresa.
create table if not exists public.telegram_links (
  chat_id text primary key,
  company_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  erp_user_id text,
  display_name text,
  role text not null default 'Operador',
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_telegram_links_company
  on public.telegram_links (company_id)
  where revoked_at is null;

create index if not exists idx_telegram_links_user
  on public.telegram_links (user_id);

-- Código de pareamento gerado dentro do ERP e digitado no bot.
create table if not exists public.telegram_pairing_codes (
  code text primary key,
  company_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  erp_user_id text,
  display_name text,
  role text not null default 'Operador',
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_chat_id text
);

create index if not exists idx_telegram_pairing_pending
  on public.telegram_pairing_codes (company_id, expires_at)
  where used_at is null;

-- Rascunho de lançamento aguardando o Confirmar no chat. O callback_data do
-- Telegram cabe 64 bytes, então o que é confirmado fica aqui, não no botão.
create table if not exists public.telegram_pending_actions (
  id text primary key,
  chat_id text not null,
  company_id text not null,
  user_id uuid,
  action text not null,
  payload jsonb not null,
  summary text,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists idx_telegram_pending_chat
  on public.telegram_pending_actions (chat_id, expires_at)
  where consumed_at is null;

-- Trilha de tudo que o agente gravou no ERP.
create table if not exists public.telegram_audit (
  id bigserial primary key,
  chat_id text,
  company_id text not null,
  user_id uuid,
  action text not null,
  payload jsonb,
  result text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_telegram_audit_company_date
  on public.telegram_audit (company_id, created_at desc);

-- O Telegram reentrega o update quando não recebe 200 a tempo. Sem esta
-- tabela, uma reentrega viraria um segundo lançamento.
create table if not exists public.telegram_updates (
  update_id bigint primary key,
  chat_id text,
  processed_at timestamptz not null default timezone('utc', now())
);

alter table public.telegram_links enable row level security;
alter table public.telegram_pairing_codes enable row level security;
alter table public.telegram_pending_actions enable row level security;
alter table public.telegram_audit enable row level security;
alter table public.telegram_updates enable row level security;

drop policy if exists "Service role only" on public.telegram_links;
create policy "Service role only" on public.telegram_links
for all to anon, authenticated using (false) with check (false);

drop policy if exists "Service role only" on public.telegram_pairing_codes;
create policy "Service role only" on public.telegram_pairing_codes
for all to anon, authenticated using (false) with check (false);

drop policy if exists "Service role only" on public.telegram_pending_actions;
create policy "Service role only" on public.telegram_pending_actions
for all to anon, authenticated using (false) with check (false);

drop policy if exists "Service role only" on public.telegram_audit;
create policy "Service role only" on public.telegram_audit
for all to anon, authenticated using (false) with check (false);

drop policy if exists "Service role only" on public.telegram_updates;
create policy "Service role only" on public.telegram_updates
for all to anon, authenticated using (false) with check (false);
