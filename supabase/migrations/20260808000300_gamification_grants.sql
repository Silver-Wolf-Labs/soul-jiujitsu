-- ─────────────────────────────────────────────────────────────────────────────
-- Grant the awarding functions to service_role.
--
-- The kiosk check-in path runs on a service-role client (kioskClient() in
-- src/lib/actions/check-ins.ts), which is NOT covered by the GRANT ... TO
-- authenticated in the earlier migrations. Without this, awarding XP from the
-- kiosk fails with "permission denied for function" — and since the award is
-- deliberately non-fatal, it would fail silently: check-ins recorded, no XP.
--
-- backfill_gamification() is deliberately NOT granted here. It stays
-- service-role-via-superuser only, invoked manually after a deploy.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.award_check_in_xp(BIGINT)              TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_member_badges(INT, DATE)      TO service_role;
GRANT EXECUTE ON FUNCTION public.get_training_day_streak(INT, DATE)     TO service_role;
GRANT EXECUTE ON FUNCTION public.get_longest_training_streak(INT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_member_gamification(INT, DATE)     TO service_role;
