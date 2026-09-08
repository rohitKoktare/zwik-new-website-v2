-- record_login_attempt() (migration 0015) is a security definer function, but
-- Postgres grants EXECUTE on a new function to PUBLIC by default -- verified
-- against the live database: the anon key could call it directly, passing any
-- ip_hash it liked, not just its own.
--
-- The blast radius is narrow (it only touches the login_attempts bookkeeping
-- table, not customers/orders), but it does open one real griefing vector:
-- since IP addresses aren't secret, anyone can compute sha256(target_ip)
-- themselves and call this function directly to pre-fill a specific person's
-- rate-limit bucket, throttling their real sign-in attempts. Locking this down
-- closes that off entirely -- only the service-role client (which is how
-- lib/customer-auth/rate-limit.ts calls it) may execute it.

revoke execute on function public.record_login_attempt(text, interval) from public;
revoke execute on function public.record_login_attempt(text, interval) from anon;
revoke execute on function public.record_login_attempt(text, interval) from authenticated;
