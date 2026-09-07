-- Seed data: real ZWIK catalog content (from the approved design reference),
-- NOT placeholder/fake data. Reviews are deliberately NOT seeded — the design
-- reference's testimonials are explicitly marked as placeholders, and
-- docs/DATABASE_DESIGN.md §8 forbids implying a review is genuine when it isn't.
-- Idempotent: safe to re-run.

insert into public.categories (name, slug, sort_order) values
  ('Desk', 'desk', 1),
  ('Monitor', 'monitor', 2),
  ('Dashboard', 'dashboard', 3),
  ('Shelf', 'shelf', 4)
on conflict (slug) do nothing;

insert into public.assets (filename, storage_path, media_type, mime_type, file_size_bytes, alt_text) values
  ('cat-set-white.jpg', 'products/cat-set-white.jpg', 'image', 'image/jpeg', 110341, 'Sunhat cat dashboard set on a white background'),
  ('cat-set-dashboard.jpg', 'products/cat-set-dashboard.jpg', 'image', 'image/jpeg', 154343, 'Sunhat cat dashboard set mounted on a car dashboard'),
  ('cat-set-monitor-2.jpg', 'products/cat-set-monitor-2.jpg', 'image', 'image/jpeg', 104458, 'Sunhat cat set perched on a monitor'),
  ('cat-set-flatlay.jpg', 'products/cat-set-flatlay.jpg', 'image', 'image/jpeg', 118328, 'Sunhat cat set laid out flat on a desk'),
  ('cat-set-monitor.jpg', 'products/cat-set-monitor.jpg', 'image', 'image/jpeg', 112062, 'Cat figurine on a monitor bezel'),
  ('cat-monitor-sleepy.jpg', 'products/cat-monitor-sleepy.jpg', 'image', 'image/jpeg', 82617, 'Sleepy tabby cat monitor topper'),
  ('houses-diorama.jpg', 'products/houses-diorama.jpg', 'image', 'image/jpeg', 202231, 'Miniature cottage houses on a grass diorama'),
  ('houses-pair.jpg', 'products/houses-pair.jpg', 'image', 'image/jpeg', 179126, 'A pair of miniature cottage houses'),
  ('houses-grass.jpg', 'products/houses-grass.jpg', 'image', 'image/jpeg', 78666, 'Miniature houses set in grass'),
  ('house-hand.jpg', 'products/house-hand.jpg', 'image', 'image/jpeg', 180619, 'A miniature house held in a hand for scale'),
  ('houses-dimensions.jpg', 'products/houses-dimensions.jpg', 'image', 'image/jpeg', 55508, 'Cottage house set shown with dimensions'),
  ('daisy-spring.jpg', 'products/daisy-spring.jpg', 'image', 'image/jpeg', 62912, 'Daisy on a spring dashboard ornament'),
  ('figurine-set.jpg', 'products/figurine-set.jpg', 'image', 'image/jpeg', 36365, 'Set of six cheeky boy figurines'),
  ('figurine-single.jpg', 'products/figurine-single.jpg', 'image', 'image/jpeg', 39670, 'Single cheeky boy figurine, close up')
on conflict (storage_path) do nothing;

insert into public.products (
  sku, name, slug, short_description, description, features,
  category_id, price, currency, is_featured, is_active, sort_order
) values
  (
    'ZW-01', 'Sunhat cat, dashboard set', 'sunhat-cat-dashboard-set',
    '6 cm cat · 2 cm chicks',
    'An orange tabby in a woven straw hat and tiny sunglasses, with two chicks to keep it company. Comes with adhesive pads, so it holds on a dashboard, a monitor edge, or a shelf lip.',
    '[
      {"label": "Pieces", "value": "5 — cat, hat, glasses, 2 chicks"},
      {"label": "Material", "value": "Hand-painted resin"},
      {"label": "Mounting", "value": "Adhesive pads included"},
      {"label": "Best for", "value": "Dashboard, monitor, desk"},
      {"label": "Care", "value": "Wipe with a dry cloth"}
    ]'::jsonb,
    (select id from public.categories where slug = 'dashboard'),
    899, 'INR', true, true, 1
  ),
  (
    'ZW-02', 'Sleepy tabby, monitor topper', 'sleepy-tabby-monitor-topper',
    '4.5 cm tall',
    'The same shy tabby, no hat, no entourage. Flat-footed so it balances on a monitor bezel and looks like it is thinking about something.',
    '[
      {"label": "Pieces", "value": "1"},
      {"label": "Material", "value": "Hand-painted resin"},
      {"label": "Mounting", "value": "Free-standing, flat base"},
      {"label": "Best for", "value": "Monitor, desk"},
      {"label": "Care", "value": "Wipe with a dry cloth"}
    ]'::jsonb,
    (select id from public.categories where slug = 'monitor'),
    499, 'INR', false, true, 2
  ),
  (
    'ZW-03', 'Cottage village, set of four', 'cottage-village-set-of-four',
    '2.7–3.2 cm each',
    'Four little houses — tile roofs, stone walls, yellow windows — each on its own base. Line them along a shelf or scatter them in a planter and you have a village.',
    '[
      {"label": "Pieces", "value": "4 houses"},
      {"label": "Material", "value": "Hand-painted resin"},
      {"label": "Dimensions", "value": "2.7–3.2 cm tall"},
      {"label": "Best for", "value": "Shelf, planter, desk"},
      {"label": "Care", "value": "Dust with a soft brush"}
    ]'::jsonb,
    (select id from public.categories where slug = 'shelf'),
    799, 'INR', true, true, 3
  ),
  (
    'ZW-04', 'Daisy on a spring', 'daisy-on-a-spring',
    '5 cm tall',
    'A purple daisy on a coiled steel spring with a weighted base. It nods for a few seconds every time you shut the car door or nudge the desk.',
    '[
      {"label": "Pieces", "value": "1"},
      {"label": "Material", "value": "Resin flower, steel spring"},
      {"label": "Height", "value": "5 cm"},
      {"label": "Best for", "value": "Dashboard, desk"},
      {"label": "Care", "value": "Keep out of direct sun"}
    ]'::jsonb,
    (select id from public.categories where slug = 'dashboard'),
    299, 'INR', false, true, 4
  ),
  (
    'ZW-05', 'Cheeky boy figures, set of six', 'cheeky-boy-figures-set-of-six',
    '3.4–3.8 cm each',
    'Six tiny figures in six poses — waving, sulking, hiding, holding a gift. Small enough to line up along a keyboard or hide one in a colleague''s pen cup.',
    '[
      {"label": "Pieces", "value": "6 figures"},
      {"label": "Material", "value": "Hand-painted resin"},
      {"label": "Dimensions", "value": "3.4 × 3.8 cm"},
      {"label": "Best for", "value": "Desk, shelf"},
      {"label": "Care", "value": "Wipe with a dry cloth"}
    ]'::jsonb,
    (select id from public.categories where slug = 'desk'),
    699, 'INR', false, true, 5
  )
on conflict (slug) do nothing;

insert into public.product_assets (product_id, asset_id, role, sort_order)
select p.id, a.id, x.role, x.sort_order
from (values
  ('sunhat-cat-dashboard-set', 'products/cat-set-white.jpg', 'main', 0),
  ('sunhat-cat-dashboard-set', 'products/cat-set-dashboard.jpg', 'gallery', 1),
  ('sunhat-cat-dashboard-set', 'products/cat-set-monitor-2.jpg', 'gallery', 2),
  ('sunhat-cat-dashboard-set', 'products/cat-set-flatlay.jpg', 'gallery', 3),
  ('sunhat-cat-dashboard-set', 'products/cat-set-monitor.jpg', 'gallery', 4),
  ('sleepy-tabby-monitor-topper', 'products/cat-monitor-sleepy.jpg', 'main', 0),
  ('sleepy-tabby-monitor-topper', 'products/cat-set-monitor.jpg', 'gallery', 1),
  ('cottage-village-set-of-four', 'products/houses-diorama.jpg', 'main', 0),
  ('cottage-village-set-of-four', 'products/houses-pair.jpg', 'gallery', 1),
  ('cottage-village-set-of-four', 'products/houses-grass.jpg', 'gallery', 2),
  ('cottage-village-set-of-four', 'products/house-hand.jpg', 'gallery', 3),
  ('cottage-village-set-of-four', 'products/houses-dimensions.jpg', 'gallery', 4),
  ('daisy-on-a-spring', 'products/daisy-spring.jpg', 'main', 0),
  ('cheeky-boy-figures-set-of-six', 'products/figurine-set.jpg', 'main', 0),
  ('cheeky-boy-figures-set-of-six', 'products/figurine-single.jpg', 'gallery', 1)
) as x (product_slug, storage_path, role, sort_order)
join public.products p on p.slug = x.product_slug
join public.assets a on a.storage_path = x.storage_path
on conflict (product_id, asset_id) do nothing;

insert into public.site_settings (whatsapp_number, whatsapp_default_message, brand_name)
select '917666068317', 'Hi ZWIK! I saw your site and wanted to ask about a piece.', 'ZWIK'
where not exists (select 1 from public.site_settings);
