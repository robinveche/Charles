-- Charles : table de synchronisation (à coller une seule fois dans Supabase → SQL Editor → Run)
create table if not exists public.records (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,              -- item | category | project | kv
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null, -- date de modification côté appareil
  server_updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create index if not exists records_pull on public.records (user_id, server_updated_at);

-- Horloge serveur + « la version la plus récente gagne »
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old; -- on garde la version plus récente déjà présente
  end if;
  new.server_updated_at = clock_timestamp();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.records_touch();

-- Chacun ne voit que ses propres données
alter table public.records enable row level security;
drop policy if exists "mes donnees" on public.records;
create policy "mes donnees" on public.records for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
