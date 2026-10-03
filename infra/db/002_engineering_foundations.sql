create table if not exists consent_events (
  consent_event_id text primary key,
  consent_id text not null references user_consents(consent_id),
  user_id text not null references app_users(user_id),
  purpose text not null,
  state text not null check (state in ('granted', 'revoked')),
  channel text not null,
  occurred_at timestamptz not null default now(),
  version integer not null
);

create table if not exists app_events (
  event_id text primary key,
  aggregate_id text not null,
  aggregate_version integer not null,
  event_type text not null,
  payload jsonb not null,
  occurred_at timestamptz not null,
  unique (aggregate_id, aggregate_version)
);

create index if not exists app_events_aggregate_order on app_events (aggregate_id, occurred_at, event_id);

create table if not exists app_jobs (
  job_id text primary key,
  idempotency_key text not null unique,
  job_type text not null,
  payload jsonb not null,
  status text not null check (status in ('queued', 'processing', 'completed', 'retrying', 'dead_letter')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_jobs_claimable on app_jobs (status, available_at, created_at);

create table if not exists notification_deliveries (
  delivery_id text primary key,
  user_id text not null references app_users(user_id),
  kind text not null,
  dedupe_key text not null,
  state text not null check (state in ('queued', 'sent', 'failed', 'suppressed')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failure_reason text,
  unique (user_id, dedupe_key)
);

create table if not exists user_imports (
  import_id text primary key,
  user_id text not null references app_users(user_id),
  kind text not null,
  media_type text,
  size_bytes bigint,
  content_hash text not null,
  encrypted_payload bytea,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists review_queue_items (
  item_id text primary key,
  item_type text not null,
  subject_id text not null,
  status text not null,
  priority integer not null default 0,
  assigned_to text,
  lease_expires_at timestamptz,
  version integer not null default 1,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notification_subscriptions (
  subscription_id text primary key,
  user_id text not null references app_users(user_id),
  kind text not null,
  enabled boolean not null,
  quiet_hours jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_subscriptions_user on notification_subscriptions (user_id, kind);

insert into schema_migrations(version) values ('002_engineering_foundations') on conflict (version) do nothing;
