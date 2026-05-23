-- Leaderboard view: live Pythias ranked by agoraRank desc.
create or replace view public.leaderboard as
select
    p.name,
    encode(p.name_hash, 'hex') as name_hash_hex,
    p.owner_address,
    p.vault_address,
    p.bond_balance,
    p.stake_principal,
    p.total_shares,
    p.agora_rank,
    p.brier_30d,
    p.last_forecast_at,
    p.registered_at,
    p.profile_image_url,
    p.description,
    p.mandate_categories,
    coalesce((select count(*) from public.forecasts f where f.name_hash = p.name_hash), 0) as forecast_count,
    coalesce((select sum(amount)::numeric from public.builder_fees bf where bf.name_hash = p.name_hash), 0) as lifetime_builder_fees
from public.pythias p
where not p.delisted;

-- Per-Pythia accuracy roll-up
create or replace view public.pythia_accuracy as
select
    p.name_hash,
    p.name,
    count(f.id) filter (where f.market_resolved) as resolved_count,
    avg(f.brier_contribution) filter (where f.market_resolved) as brier_avg_all,
    avg(f.brier_contribution) filter (where f.market_resolved
                                       and f.block_time > now() - interval '30 days') as brier_avg_30d
from public.pythias p
left join public.forecasts f on f.name_hash = p.name_hash
group by p.name_hash, p.name;
