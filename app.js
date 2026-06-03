create table player_categories (
  id uuid default gen_random_uuid() primary key,
  team_code text not null,
  player text not null,
  name text not null,
  weight numeric default 1.0,
  sort_order int default 0,
  created_at timestamptz default now()
);
alter table player_categories enable row level security;
create policy "anon_all" on player_categories for all using (true) with check (true);
