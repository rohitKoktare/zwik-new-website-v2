-- Fixes from a security audit of the whole schema, done once the site was
-- close to production. Two independent, low-risk changes:

-- ---------------------------------------------------------------------------
-- 1. next_order_number() had the same gap 0016 already fixed for
--    record_login_attempt(): Postgres grants EXECUTE on a new function to
--    PUBLIC by default, so despite being `security definer`, the anon key
--    could call it directly via supabase.rpc('next_order_number') — verified
--    against the live database — advancing the real monthly counter and
--    burning order-number slots that a legitimate order will then skip over.
--    Safe to revoke: the only caller in the app is the BEFORE INSERT trigger
--    set_order_number() (migration 0014), which runs as the table owner
--    regardless of the calling role's own grants, and this function is never
--    referenced inside another table's RLS policy (unlike is_admin(), which
--    is why that one is deliberately left alone — see docs/DATABASE_DESIGN.md).
-- ---------------------------------------------------------------------------

revoke execute on function public.next_order_number() from public;
revoke execute on function public.next_order_number() from anon;
revoke execute on function public.next_order_number() from authenticated;

-- ---------------------------------------------------------------------------
-- 2. product_assets_public_read let an archived asset's join row (asset_id,
--    role, sort_order) stay visible through an active product, because it
--    only checked the product's is_active flag and never the linked asset's
--    own status — unlike assets_public_read, which does check status on the
--    assets table itself. Narrowing an existing read policy can only remove
--    rows a caller could see, never add any, so this is safe to apply without
--    the RLS-short-circuit risk noted in item 1's comment.
-- ---------------------------------------------------------------------------

alter policy "product_assets_public_read" on public.product_assets
  using (
    exists (
      select 1
      from public.products p
      join public.assets a on a.id = product_assets.asset_id
      where p.id = product_assets.product_id
        and p.is_active = true
        and a.status = 'active'
    )
  );
