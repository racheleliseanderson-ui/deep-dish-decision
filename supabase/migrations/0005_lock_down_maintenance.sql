-- Two things the linter was right to ask about.
--
-- 1. purge_expired_night_plans is a maintenance job, not an endpoint. 0002
--    created it SECURITY DEFINER and left EXECUTE with PUBLIC, so it was
--    reachable at /rest/v1/rpc/purge_expired_night_plans by anyone holding the
--    publishable key: an unauthenticated delete that also reports how many rows
--    it removed. The rows are expired, so the damage is small, but nothing
--    about the shape of that is intended. Only the service role runs it.
--
-- 2. The enrichment tables have RLS on and no policies. That is deliberate —
--    deny-all to the publishable key, service-key-only — but "no policy" and
--    "policy forgotten" look identical to a reader, so say which this is.

revoke all on function public.purge_expired_night_plans() from public, anon, authenticated;
grant execute on function public.purge_expired_night_plans() to service_role;

comment on function public.purge_expired_night_plans() is
  'Maintenance only. Service role, or a scheduled job. Never exposed to the publishable key.';

comment on table public.enrichment_runs is
  'Pipeline history. RLS is on with no policy on purpose: deny-all to anon and authenticated, written and read by the service key alone.';
comment on table public.enrichment_results is
  'Per-record pipeline output. RLS is on with no policy on purpose: deny-all to anon and authenticated, written and read by the service key alone.';
