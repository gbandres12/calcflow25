-- Rascunho/slots da conversa de venda no Telegram (entrevista pedido + NF-e).
-- TTL aplicado no webhook (~30 min). Só o service role acessa (mesmo padrão da 008).

create table if not exists public.telegram_sale_drafts (
  chat_id text primary key,
  company_id text not null,
  user_id uuid,
  slots jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create index if not exists idx_telegram_sale_drafts_expires
  on public.telegram_sale_drafts (expires_at);

alter table public.telegram_sale_drafts enable row level security;

drop policy if exists "Service role only" on public.telegram_sale_drafts;
create policy "Service role only" on public.telegram_sale_drafts
for all to anon, authenticated using (false) with check (false);
