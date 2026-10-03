-- Shopping Navigation local/production schema baseline.
-- PostgreSQL is the authoritative target; adapters may use a compatible local database.
create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists app_users (
  user_id text primary key,
  external_subject text unique,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists user_sessions (
  session_id text primary key,
  user_id text not null references app_users(user_id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists user_consents (
  consent_id text primary key,
  user_id text not null references app_users(user_id),
  purpose text not null,
  policy_version text not null,
  granted_at timestamptz not null,
  revoked_at timestamptz,
  unique (user_id, purpose, policy_version)
);

create table if not exists audit_events (
  audit_id text primary key,
  actor_user_id text,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists recognition_tasks (
  task_id text primary key,
  user_id text not null references app_users(user_id),
  input_type text not null,
  fields jsonb not null,
  status text not null,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists purchase_protection_cases (
  case_id text primary key,
  user_id text not null references app_users(user_id),
  idempotency_key text not null,
  status text not null,
  version integer not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists source_authorizations (
  authorization_id text primary key,
  source_id text not null,
  policy_version text not null,
  state text not null,
  purposes jsonb not null,
  scope jsonb not null,
  effective_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  evidence_reference text not null
);

create table if not exists catalog_evidence (
  evidence_id text primary key,
  entity_type text not null,
  entity_id text not null,
  source_id text,
  captured_at timestamptz not null,
  expires_at timestamptz,
  payload jsonb not null
);

create table if not exists attribution_sessions (
  attribution_id text primary key,
  user_id text not null references app_users(user_id),
  source_id text not null,
  status text not null,
  payload jsonb not null,
  version integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists reward_entitlements (
  entitlement_id text primary key,
  user_id text not null references app_users(user_id),
  status text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  currency text not null,
  payload jsonb not null,
  version integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists wallet_ledger_entries (
  ledger_entry_id text primary key,
  account_id text not null,
  user_id text not null references app_users(user_id),
  currency text not null,
  amount_minor bigint not null,
  entry_type text not null,
  source_event_id text not null unique,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists payout_requests (
  payout_id text primary key,
  account_id text not null,
  user_id text not null references app_users(user_id),
  currency text not null,
  amount_minor bigint not null check (amount_minor > 0),
  idempotency_key text not null unique,
  status text not null,
  created_at timestamptz not null default now()
);

insert into schema_migrations(version) values ('001_initial_domain') on conflict (version) do nothing;
