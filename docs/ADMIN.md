# ZWIK Admin — implementation notes

How the admin area is put together, and the rules to follow when extending it.
Read `DEVELOPMENT_STANDARDS.md` and `ARCHITECTURE.md` first; this document only
covers admin-specific mechanics.

## 1. Routing and the authorization boundary

```
app/admin/
  layout.tsx              no guard — /admin/login lives under it
  login/page.tsx          public sign-in form
  (protected)/
    layout.tsx            requireAdmin() — the rendering guard
    page.tsx              dashboard            -> /admin
    products/…            -> /admin/products
    orders/…              -> /admin/orders
    customers/…           -> /admin/customers
    campaigns/…           -> /admin/campaigns
    categories/…          -> /admin/categories
    assets/…              -> /admin/assets
    homepage/…            -> /admin/homepage
    reviews/…             -> /admin/reviews
    settings/…            -> /admin/settings
    audit-logs/…          -> /admin/audit-logs
```

`(protected)` is a route group, so it does not appear in URLs. It exists purely
so the login page can sit outside the guard — a guard on `app/admin/layout.tsx`
would have made `/admin/login` unreachable and produced a redirect loop.

**A layout guard protects rendering, not server actions.** Server actions are
independently addressable endpoints: an attacker can invoke one without ever
rendering the page. Every action therefore re-authorizes itself:

```ts
const actor = await getAuthorizedActor();          // or (SETTINGS_ROLES) etc.
if (!actor) return actionError("You don't have permission to do that.");
```

Roles are defined in `lib/auth/guard.ts`:

| Constant | Roles | Used for |
| --- | --- | --- |
| `ADMIN_ROLES` | SUPER_ADMIN, ADMIN, CONTENT_MANAGER | reaching `/admin` at all |
| `SETTINGS_ROLES` | SUPER_ADMIN, ADMIN | changing site settings |
| `DESTRUCTIVE_ROLES` | SUPER_ADMIN, ADMIN | permanent deletion |

Authorization is enforced in three independent layers: the layout guard, the
action's own check, and Postgres RLS (`public.is_admin()`). Any one of them
failing still leaves two.

## 2. The canonical mutation

`lib/admin/settings/actions.ts` is the reference implementation. Every mutation
follows the same seven steps:

1. **Authorize** — `getAuthorizedActor(roles?)`, never trust the layout.
2. **Validate** — `parseForm(schema, formData)` with a Zod schema. Server-side
   validation is the only validation that counts.
3. **Read before-state** — needed for a meaningful audit diff.
4. **Write** — via `createClient()` (RLS-enforced), never the service-role client.
5. **Audit** — `recordAuditEvent()` with `diffRecords()` so the log stores the
   change, not a duplicate of the row.
6. **Revalidate** — the affected public paths, via `lib/admin/revalidate.ts`.
7. **Return** — an `ActionResult` with safe, human-readable text.

Raw database or exception text must never reach the browser. Log it with
`logger` and return a friendly sentence.

## 3. Which Supabase client

| Client | Use for | Notes |
| --- | --- | --- |
| `lib/supabase/server.ts` | all normal admin reads and writes | anon key + session; RLS applies |
| `lib/supabase/client.ts` | browser-side reads | anon key; RLS applies |
| `lib/supabase/admin.ts` | **audit writes only** | service-role, bypasses RLS |

The service-role client is confined to `lib/audit`. `audit_logs` has an
admin-only SELECT policy and deliberately **no INSERT policy**, which makes the
table append-only from trusted server code — a signed-in admin cannot forge or
edit an audit entry from the browser. That is why `SUPABASE_SERVICE_ROLE_KEY`
is required for the admin area rather than optional.

Both `lib/supabase/admin.ts` and `lib/audit` import `server-only`, so bundling
either into a client component is a build error, not a runtime surprise.

An audit write that fails does **not** roll back the mutation — a broken log
must not block a legitimate content fix — but it is logged at error level so it
cannot rot unnoticed.

## 4. Forms

Forms are plain `<form action={…}>` posting to a server action, driven by
`useActionState`. There is no form library.

- `parseForm` converts `FormData` into an object and collapses repeated fields
  into arrays before validating.
- `FormField` wires up the label, hint, `aria-describedby` and `role="alert"`
  so errors are announced, not merely coloured red.
- `SubmitButton` reads `useFormStatus` for pending state and double-submit
  protection.
- `ConfirmAction` gates destructive operations behind an alert dialog. It is a
  usability guard only — the action behind it still authorizes independently.

### FormData has no types, and no arity

Everything arrives as a string, and this trips people up repeatedly:

| Control | Unchecked / empty / single | Handle with |
| --- | --- | --- |
| checkbox, switch | **key is absent entirely** | `checkboxSchema` |
| multi-select, `AssetPicker` | one selection posts a bare string, not an array | `idListSchema` |
| single asset picker | may post a repeated key | `optionalIdSchema` |
| number | `"12"`, or `""` when blank | `numericSchema` / `integerSchema` |
| `datetime-local` | `"2026-01-31T14:30"`, no timezone | convert to UTC ISO before storing |

`z.array()` on a single-selection field fails on exactly the most common case,
so always normalise first. These helpers live in `lib/validation/common.ts` and
their behaviour is verified against Zod v4.

## 5. UI library gotcha

shadcn/ui here is the **Base UI** build (`@base-ui/react`), not Radix.
Composition uses a `render` prop, not `asChild`:

```tsx
<Button render={<Link href="/admin/products" />}>Products</Button>
<AlertDialogTrigger render={<Button variant="outline">Archive</Button>} />
```

Two related constraints:

- ESLint forbids calling `setState` inside `useEffect`
  (`react-hooks/set-state-in-effect`). To react to an action result, use
  `useTransition` and await the action — see `components/admin/confirm-action.tsx`.
- Do not add comments inside the `:root` or `@theme` blocks of
  `app/globals.css`. Tailwind v4.3.3 fails to resolve `@apply border-border`
  when they are present, under both Turbopack and webpack. This is a real
  upstream parser bug, not a stylistic preference.

## 6. Deletion policy

Content is **archived**, not deleted (`DATABASE_DESIGN.md` §17):

- Products, reviews, hero slides → `is_active = false`. No hard delete exists.
- Assets → `status = 'archived'`.

Permanent deletion exists in exactly two places, both gated behind
`DESTRUCTIVE_ROLES` and both refused while anything still references the row:

- **Assets** — only when `countAssetReferences()` returns zero. The Storage
  object is removed before the database row so a failure cannot leave an
  orphaned file with no record of it.
- **Categories** — only when no product points at them. `products.category_id`
  is `on delete restrict`, so Postgres is the actual guarantee; the count check
  in `deleteCategoryAction` exists to produce a useful message instead of a
  foreign-key error, and the `23503` branch still handles the race where a
  product is assigned between the check and the delete. Hiding
  (`is_active = false`) remains the reversible option and is what the UI steers
  toward.

- **Customer records** — deleting one is the DPDP Act erasure path, not a
  cleanup convenience. It is a hard delete on purpose: an archive flag would
  leave the phone number in the database, which is exactly what an erasure
  request asks you to remove. `orders.customer_id` is `on delete set null`, so
  the sales history survives with nothing identifying attached.

Categories are otherwise archived like everything else. **Orders are never
deleted** — they are a business record, and `cancelled` is the terminal
"not going ahead" state rather than a soft delete.

### 6.1 Campaigns send nothing

`/admin/campaigns` is a worklist, not a send queue. A `wa.me` link cannot
deliver a message — it opens WhatsApp with text prefilled and a human presses
send — so `campaign_recipients.status` records what a person did. Nothing in the
system can mark a message sent on its own.

"Open & mark sent" is therefore optimistic: it records the send at the moment
WhatsApp opens, because that is the last thing the site can observe. Skip exists
to correct the record when someone closes WhatsApp without sending.

Two consent gates, not one:

1. `startCampaignAction` builds the audience by querying consent directly. No
   UI path can add a non-consenting customer, and non-consenting customers are
   not inserted as "skipped" either — so the recipient table never becomes a
   record of people ZWIK considered messaging without permission.
2. `markRecipientSentAction` re-checks consent per recipient. The audience is
   snapshotted; consent is not. Anyone who unsubscribed in between is flipped to
   `skipped` and the send is refused.

The opt-out line is appended by `buildCampaignMessage`, not stored as an
editable field, so it cannot be removed from a message.

### 6.2 Consent is not an admin decision

`/admin/customers` can withdraw marketing consent but cannot grant it. A button
that let staff tick "yes, they agreed" would manufacture the very evidence the
record exists to hold. Re-subscribing after an unsubscribe is possible, but
requires the admin to state where the customer actually asked, and that reason
is written into the audit log.

## 7. Media

`lib/storage/resolve-asset-url.ts` is the only place a media URL is constructed.
With Supabase configured it returns public Storage URLs; without it, it falls
back to the seed images in `/public/products` so the storefront still renders
locally.

Upload rules (`DEVELOPMENT_STANDARDS.md` §11):

- Never trust the client-supplied MIME type or filename. Verify magic bytes.
- Never reuse the client filename as the storage key — use `buildStorageKey()`.
  The original name is kept only as display metadata.
- Enforce size and an extension/MIME allowlist in the action. The bucket
  enforces its own limits too, so a bypassed app check still cannot store
  arbitrary files.
- If the database insert fails after a successful upload, remove the uploaded
  object so Storage and Postgres cannot drift apart.

## 8. Adding a module

1. Schema first — a migration in `supabase/migrations/`, with RLS policies and
   indexes. Never edit an applied migration.
2. Zod schema in `lib/validation/`.
3. Read queries in `lib/supabase/queries/admin-*.ts`. Select only the columns
   you need and paginate.
4. Actions in `lib/admin/<module>/actions.ts`, following the seven steps above.
5. UI in `components/admin/<module>/` and pages in
   `app/admin/(protected)/<module>/`.
6. Verify: `npm run lint`, `npm run typecheck`, `npm run build`, then exercise
   the unauthorized path, invalid input, and the failure states.
