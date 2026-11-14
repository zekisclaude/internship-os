export const SCHEMA = `
create table if not exists records (
  collection text not null,
  id text not null,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text not null,
  primary key (collection, id)
);
create index if not exists records_collection on records (collection);
create table if not exists audit (
  seq bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  target text not null,
  detail text not null default ''
);
create table if not exists secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
)
`;
