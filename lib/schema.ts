export const SCHEMA = `
create table if not exists gmail_draft_exports (
  outreach_id text not null,
  recipient text not null unique,
  message_hash text not null,
  state text not null,
  gmail_draft_id text,
  created_at timestamptz not null default now(),
  primary key (outreach_id, message_hash)
);

create table if not exists gmail_send_exports (
  outreach_id text not null,
  message_hash text not null,
  recipient text not null,
  kind text not null default 'initial',
  state text not null,
  gmail_message_id text,
  gmail_thread_id text,
  created_at timestamptz not null default now(),
  primary key (outreach_id, message_hash)
);
create unique index if not exists gmail_send_one_initial on gmail_send_exports (recipient) where kind = 'initial';

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
