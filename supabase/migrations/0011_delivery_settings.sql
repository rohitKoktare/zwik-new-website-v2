-- Delivery terms on site_settings — see docs/DATABASE_DESIGN.md §10.
--
-- ZWIK quotes delivery on WhatsApp, but the free-delivery threshold is the one
-- number customers act on before they message, so it belongs on the site and
-- must be editable without a deploy.
--
-- Nullable on purpose: null means "no free-delivery offer is running", and the
-- storefront then says nothing rather than advertising a ₹0 threshold.

alter table public.site_settings
  add column if not exists free_delivery_threshold numeric(12, 2)
    check (free_delivery_threshold is null or free_delivery_threshold >= 0);

alter table public.site_settings
  add column if not exists delivery_scope_note text;

-- The flat fee charged below the threshold. This one is quoted to the customer
-- inside the WhatsApp order message, so it is operational data, not marketing
-- copy — it was previously hard-coded at 79 in the cart drawer, which meant the
-- site quoted a delivery charge nobody could change without a deploy.
--
-- Null means "we do not quote a delivery charge on the site"; the cart then
-- says delivery is confirmed on WhatsApp instead of inventing a number.
alter table public.site_settings
  add column if not exists delivery_fee numeric(12, 2)
    check (delivery_fee is null or delivery_fee >= 0);

comment on column public.site_settings.free_delivery_threshold is
  'Cart subtotal at or above which delivery is free. Null = no offer running.';

comment on column public.site_settings.delivery_scope_note is
  'Where the offer applies, e.g. "across all India". Shown next to the threshold.';

comment on column public.site_settings.delivery_fee is
  'Flat delivery charge below the threshold. Null = quoted on WhatsApp instead.';
