create table profiles (
  id uuid primary key,
  display_name text,
  email text
);

create policy "Anyone can read profiles" on profiles
  for select using (true);
