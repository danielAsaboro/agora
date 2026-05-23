-- Agora initial schema.
-- All amounts stored as numeric(78,0) (USDC base units; supports any uint256).
-- Chain state of record is on-chain; these tables are the indexer's denormalized cache.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =====================================================================
-- pythias: one row per registered Pythia
-- =====================================================================
create table public.pythias (
    name_hash      bytea primary key,            -- keccak256(name)
    name           text not null unique,
    owner_address  text not null,
    daemon_address text not null,
    vault_address  text not null unique,
    manifest_hash  bytea not null,
    manifest_irys_id text,                       -- Irys txn id (transaction hash, base64url)
    mandate_root   bytea not null,
    mandate_categories text[] not null default '{}',
    bond_floor     numeric(78, 0) not null default 0,
    bond_balance   numeric(78, 0) not null default 0,
    stake_principal numeric(78, 0) not null default 0,
    total_shares   numeric(78, 0) not null default 0,
    accrued_owner_fees numeric(78, 0) not null default 0,
    last_forecast_at timestamptz,
    registered_at  timestamptz not null default now(),
    delisted       boolean not null default false,
    delisted_reason int,
    agora_rank     numeric default 0,
    brier_30d      numeric,
    profile_image_url text,
    description    text,
    extra          jsonb not null default '{}'
);

create index pythias_owner_idx on public.pythias (owner_address);
create index pythias_delisted_idx on public.pythias (delisted);
create index pythias_agora_rank_idx on public.pythias (agora_rank desc);

-- =====================================================================
-- forecasts: one row per ForecastEmitted event
-- =====================================================================
create table public.forecasts (
    id             uuid primary key default uuid_generate_v4(),
    name_hash      bytea not null references public.pythias(name_hash) on delete cascade,
    market_id      bytea not null,
    prob_scaled    numeric(78, 0) not null,      -- 1e18 fixed-point
    trace_hash     bytea not null unique,
    trace_irys_id  text,
    block_number   bigint not null,
    block_time     timestamptz not null,
    tx_hash        bytea not null,
    position_id    bigint,                       -- vault-local position id (if vault opened a market position)
    market_resolved boolean not null default false,
    market_outcome_yes boolean,
    brier_contribution numeric,                  -- (prob - outcome)^2 once resolved
    extra          jsonb not null default '{}'
);

create index forecasts_pythia_idx on public.forecasts (name_hash, block_time desc);
create index forecasts_market_idx on public.forecasts (market_id);

-- =====================================================================
-- stakes: one row per stake() / queueRedeem() / redeem() event
-- =====================================================================
create table public.stakes (
    id             uuid primary key default uuid_generate_v4(),
    name_hash      bytea not null references public.pythias(name_hash) on delete cascade,
    user_address   text not null,
    action         text not null check (action in ('stake', 'queue_redeem', 'redeem', 'bond_post', 'bond_withdraw')),
    quote_amount   numeric(78, 0) not null default 0,
    shares         numeric(78, 0) not null default 0,
    block_number   bigint not null,
    block_time     timestamptz not null,
    tx_hash        bytea not null,
    extra          jsonb not null default '{}'
);

create index stakes_pythia_idx on public.stakes (name_hash, block_time desc);
create index stakes_user_idx on public.stakes (user_address);

-- =====================================================================
-- positions: one row per vault-opened market position
-- =====================================================================
create table public.positions (
    id             uuid primary key default uuid_generate_v4(),
    name_hash      bytea not null references public.pythias(name_hash) on delete cascade,
    vault_position_id bigint not null,
    market_id      bytea not null,
    yes            boolean not null,
    quote_amount   numeric(78, 0) not null,
    opened_at      timestamptz not null,
    closed_at      timestamptz,
    returned_amount numeric(78, 0),
    pnl            numeric(78, 0),
    extra          jsonb not null default '{}',
    unique (name_hash, vault_position_id)
);

-- =====================================================================
-- builder_fees: builder-code fee accrual per Pythia
-- =====================================================================
create table public.builder_fees (
    id             uuid primary key default uuid_generate_v4(),
    name_hash      bytea not null references public.pythias(name_hash) on delete cascade,
    amount         numeric(78, 0) not null,
    claimed_at     timestamptz not null,
    tx_hash        bytea not null
);

-- =====================================================================
-- slashings
-- =====================================================================
create table public.slashings (
    id             uuid primary key default uuid_generate_v4(),
    name_hash      bytea not null references public.pythias(name_hash) on delete cascade,
    slash_type     int not null check (slash_type in (1, 2, 3, 4)),
    amount         numeric(78, 0) not null,
    detail         jsonb not null default '{}',
    block_number   bigint not null,
    block_time     timestamptz not null,
    tx_hash        bytea not null
);
create index slashings_pythia_idx on public.slashings (name_hash, block_time desc);

-- =====================================================================
-- markets: known prediction markets the indexer is watching
-- =====================================================================
create table public.markets (
    market_id      bytea primary key,
    label          text not null,
    category       text,
    source         text not null default 'mock',   -- 'mock' | 'polymarket' | 'limitless'
    expires_at     timestamptz,
    resolved       boolean not null default false,
    outcome_yes    boolean,
    resolved_at    timestamptz,
    extra          jsonb not null default '{}'
);

-- =====================================================================
-- disputes: type-3 trace-fraud submissions
-- =====================================================================
create table public.disputes (
    id             uuid primary key default uuid_generate_v4(),
    name_hash      bytea not null references public.pythias(name_hash) on delete cascade,
    trace_hash     bytea not null,
    submitter_address text not null,
    rationale      text not null,
    validator_verdict jsonb,
    status         text not null default 'open' check (status in ('open', 'upheld', 'rejected')),
    bond_share_to_submitter numeric(78, 0),
    created_at     timestamptz not null default now(),
    resolved_at    timestamptz
);

-- =====================================================================
-- traction_events: arc-canteen update traction mirror
-- =====================================================================
create table public.traction_events (
    id             uuid primary key default uuid_generate_v4(),
    kind           text not null,                -- 'pythia_registered' | 'stake' | 'forecast' | 'resolved' | 'dispute' | 'invite'
    name_hash      bytea references public.pythias(name_hash) on delete set null,
    actor          text,
    payload        jsonb not null default '{}',
    pushed_at      timestamptz,
    created_at     timestamptz not null default now()
);

-- =====================================================================
-- realtime
-- =====================================================================
alter publication supabase_realtime add table public.pythias;
alter publication supabase_realtime add table public.forecasts;
alter publication supabase_realtime add table public.stakes;
alter publication supabase_realtime add table public.slashings;
alter publication supabase_realtime add table public.traction_events;
