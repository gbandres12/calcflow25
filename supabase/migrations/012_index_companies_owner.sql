-- Fecha o aviso do advisor de performance: FK sem índice em companies.owner_user_id.
create index if not exists idx_companies_owner
  on public.companies (owner_user_id)
  where owner_user_id is not null;
