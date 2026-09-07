# ZWIK Website — Development Standards

## 1. Purpose

This document defines the engineering, coding, security, performance, accessibility, SEO, Git, and operational standards for the ZWIK production website.

ZWIK is a D2C brand website where customers discover products, build a cart, and send that cart to ZWIK as a WhatsApp message. ZWIK then confirms stock and total and shares payment details on WhatsApp.

The website does not process payment, shipping, or order fulfilment, and stores no order records. The cart is a message builder, not a checkout.

An earlier revision of this document described an Amazon-redirect model. That is no longer current — see ARCHITECTURE.md §1 and §18.

## 2. Technology Rules

Primary stack:
- Next.js App Router
- TypeScript with strict mode
- Tailwind CSS
- shadcn/ui
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Vercel

Do not introduce an ORM, separate database, separate auth provider, or separate asset-storage provider without a documented technical reason and explicit approval.

Use Supabase's official client/server patterns. Keep privileged Supabase service-role credentials server-side only.

## 3. Architecture Principles

- Server Components by default.
- Client Components only where browser interactivity is required.
- Keep database/storage/auth access out of presentational UI components.
- Keep business rules separate from UI.
- Reuse components instead of duplicating logic.
- Prefer simple solutions over unnecessary abstractions.
- Do not rewrite working code without a clear reason.
- Frequently changing marketing/product content must be database-driven.
- Never hard-code prices, WhatsApp numbers/messages, delivery thresholds, or homepage marketing content in multiple components.

Suggested structure:

app/
  (store)/
  admin/
  api/
components/
  ui/
  store/
  admin/
  shared/
lib/
  supabase/
  validation/
  auth/
  storage/
  logger/
  utils/
sections/
data/
types/
docs/

## 4. TypeScript

- Strict TypeScript is mandatory.
- Avoid `any`.
- Define explicit domain types.
- Prefer generated Supabase database types where practical.
- Do not suppress TypeScript errors without documenting why.
- Keep DTO/input types separate from database row types when their purposes differ.

## 5. Components

- Components should have one clear responsibility.
- Avoid giant page components.
- Keep reusable UI in components.
- Keep homepage sections modular.
- Keep client-side state local unless it genuinely needs to be shared.
- Use shadcn/ui as primitives; customize it to match ZWIK's design system.

## 6. Data Access

- Use Supabase for database access.
- Centralize repeated queries/selectors.
- Select only required columns.
- Avoid N+1 queries.
- Avoid fetching entire tables when pagination/filtering is possible.
- Use appropriate indexes.
- Use server-side data access for sensitive operations.
- Use transactions/RPC when multiple related writes must succeed or fail together.

## 7. Validation

Validate every external input server-side.

Validate:
- Forms
- API request bodies
- Query parameters
- Route parameters
- Admin actions
- File metadata

Use Zod or an equivalent schema-validation approach already approved for the project.

Never rely only on client-side validation.

## 8. Authentication & Authorization

Admin routes must require authentication.

Authorization must be enforced server-side. Hiding an admin button in the frontend is not security.

Every protected operation must verify:
1. Valid authenticated session.
2. Appropriate role/permission.
3. Access to the requested resource.

Use Supabase Auth and Row Level Security (RLS).

Do not expose service-role keys to the browser.

## 9. Supabase / RLS

- Enable RLS on application tables.
- Write explicit policies for public read access and authenticated/admin writes.
- Default to deny until a policy is intentionally added.
- Never assume the frontend is trusted.
- Test policies with representative user roles.
- Keep privileged administrative operations on trusted server-side paths.

## 10. Secrets

Never commit:
- `.env`
- `.env.local`
- API keys
- database credentials
- service-role keys
- storage credentials
- private tokens

Only expose variables intended for the browser using the appropriate public environment-variable convention.

## 11. Asset Upload Security

Assets are stored in Supabase Storage, not inside PostgreSQL.

Validate:
- File type/MIME type
- Extension
- File size
- Image dimensions
- Video duration/resolution where applicable

Do not trust the filename or client-supplied MIME type alone.

Use unique storage keys. Never allow uploaded files to be executed as code.

Deletion/replacement requires authorization.

## 12. Product & Content Rules

Products are database-driven.

Product data may include:
- SKU
- Name
- Slug
- Description
- Features
- Category
- Price
- Original price
- Currency
- Rating
- Review count
- Featured/active state
- Sort order
- Created/updated timestamps
- ASIN and Amazon URL *(retained, nullable, unused — do not surface in UI)*

WhatsApp is the ordering channel. Do not implement on-site checkout or payment
unless explicitly requested.

The displayed price is the price quoted to the customer in the order message.
Keep it accurate. Never present it as a paid, confirmed, or reserved amount —
stock and total are only confirmed by a human on WhatsApp.

## 13. WhatsApp

WhatsApp is the ordering channel, not a secondary contact method. Treat it as
production infrastructure.

WhatsApp settings must be centrally managed. Do not hard-code the number,
default message, or delivery thresholds across components.

Admin-configurable values can include:
- Number
- Default message
- Enable/disable
- Visibility by page/context

Rules:
- Build links through the shared helper in `lib/whatsapp`, never by string
  concatenation at a call site.
- URL-encode the message exactly once.
- Never include secrets, internal IDs, or other customers' data in a message.
- When WhatsApp is disabled or unconfigured, hide or disable the ordering
  affordance. Never render a dead or half-built link.
- Changing the number or disabling WhatsApp takes ordering offline. Audit these
  changes and confirm them explicitly in the admin UI.

## 14. Error Handling

- Never expose stack traces, SQL errors, credentials, or internal implementation details to users.
- Use friendly error messages.
- Log detailed technical errors server-side.
- Use appropriate HTTP status codes.
- Add error boundaries where useful.

## 15. Logging

Use a centralized logger.

Development may be more verbose. Production logs must be useful and controlled.

Never log:
- Passwords
- Access tokens
- API keys
- Session secrets
- Unnecessary personal data

Remove temporary debugging logs before production.

## 16. Security Threats to Consider

Before shipping admin/API features, consider:
- Broken access control
- Injection
- XSS
- CSRF where relevant
- SSRF where relevant
- Credential/session theft
- Rate-limit abuse
- Malicious file uploads
- Insecure direct object references
- Data leakage
- Misconfigured CORS
- Exposed secrets
- Weak RLS policies

Use framework and platform security features rather than implementing cryptography or authentication primitives yourself.

## 17. Performance

- Use `next/image` for images.
- Provide appropriate responsive image sizes.
- Lazy-load non-critical media.
- Optimize videos.
- Avoid shipping unnecessary JavaScript.
- Prefer Server Components.
- Use caching/revalidation deliberately.
- Paginate large admin lists.
- Avoid unnecessary database requests.

## 18. Accessibility

- Semantic HTML.
- Keyboard navigation.
- Visible focus states.
- Accessible labels.
- Proper button/link semantics.
- Sufficient contrast.
- Accessible carousel controls.
- Captions/transcripts where appropriate for meaningful video content.
- Do not rely on color alone to communicate state.

## 19. SEO

Implement:
- Page metadata
- Open Graph metadata
- Canonical URLs
- Sitemap
- Robots configuration
- Product structured data where appropriate
- Clean slugs
- Meaningful image alt text

Do not generate duplicate or misleading SEO content.

## 20. Git

Before Git operations:
- `git status`
- `git branch`
- `git remote -v`

Never blindly overwrite an existing remote.

Never commit generated or secret files.

Use meaningful commits such as:
- `feat: add product management`
- `fix: prevent duplicate asset upload`
- `security: restrict admin asset deletion`

## 21. Testing & Verification

Before considering a feature complete:
1. Run lint.
2. Run TypeScript/type checks.
3. Run tests where available.
4. Run production build.
5. Test desktop and mobile.
6. Test unauthorized access.
7. Test invalid input.
8. Test failure states.
9. Check network requests for accidental secret/data exposure.

## 22. Definition of Done

A feature is not complete merely because the UI works.

It must also satisfy:
- Correct architecture
- Type safety
- Server-side validation
- Authorization
- RLS where applicable
- Error handling
- Performance requirements
- Accessibility requirements
- SEO requirements where applicable
- Tests/checks
- Production build

## 23. Change Discipline

Before modifying code:
1. Inspect existing implementation.
2. Identify affected files.
3. Identify security implications.
4. Identify database/storage changes.
5. Implement the smallest clean change.
6. Verify.
7. Summarize what changed and why.

Do not install libraries or create infrastructure simply because an AI-generated solution suggests it.

## Buttons that navigate

`components/ui/button.tsx` bypasses Base UI entirely when its `render` prop is
given an element, cloning it with the variant classes instead.

Base UI's Button assumes it renders a real `<button>`: with the default
`nativeButton` it puts `type="button"` on whatever element it is handed — not a
valid attribute on `<a>` — and with `nativeButton={false}` it puts
`role="button"` on it, which makes a link announce as a button and lose its
navigation semantics. It also logs a console error on every render in
development. Neither setting is correct for a link, so the primitive is not used
for one.

`<Button render={<Link href="…" />}>Label</Button>` therefore stays the call
pattern, and produces a plain styled anchor. `disabled` on such a button is
expressed the way a link can carry it: `aria-disabled`, removed from the tab
order, and with the `href` dropped so it cannot navigate.
