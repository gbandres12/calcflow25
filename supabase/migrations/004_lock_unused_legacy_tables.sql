-- As tabelas abaixo pertencem a uma tentativa anterior de normalização e não
-- são consumidas pelo ERP atual. A política explícita evita qualquer acesso
-- pela Data API sem desabilitar o RLS.

drop policy if exists "Direct API access disabled" on public.customers;
drop policy if exists "Direct API access disabled" on public.products;
drop policy if exists "Direct API access disabled" on public.orders;
drop policy if exists "Direct API access disabled" on public.stock_moves;
drop policy if exists "Direct API access disabled" on public.invoices;

create policy "Direct API access disabled" on public.customers
for all to anon, authenticated using (false) with check (false);
create policy "Direct API access disabled" on public.products
for all to anon, authenticated using (false) with check (false);
create policy "Direct API access disabled" on public.orders
for all to anon, authenticated using (false) with check (false);
create policy "Direct API access disabled" on public.stock_moves
for all to anon, authenticated using (false) with check (false);
create policy "Direct API access disabled" on public.invoices
for all to anon, authenticated using (false) with check (false);
