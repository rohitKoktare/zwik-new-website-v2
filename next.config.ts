import type { NextConfig } from "next";

/**
 * Allow next/image to optimize media served from this project's Supabase
 * Storage bucket. Scoped to the exact host from NEXT_PUBLIC_SUPABASE_URL —
 * never a wildcard, so a compromised or mistyped URL elsewhere cannot turn the
 * image optimizer into an open proxy.
 */
function supabaseImagePattern() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];

  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:") return [];
    return [
      {
        protocol: "https" as const,
        hostname,
        pathname: "/storage/v1/object/public/**",
      },
    ];
  } catch {
    return [];
  }
}

/** Same host as above, as an origin string — product videos load directly
 *  from it (`<video src>`, unlike images, is never proxied through next/image
 *  since Next does not optimize video), so the CSP's media-src needs it too. */
function supabaseOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;

  try {
    const { origin, protocol } = new URL(url);
    return protocol === "https:" ? origin : null;
  } catch {
    return null;
  }
}

/**
 * Content-Security-Policy, deliberately NOT nonce-based.
 *
 * Next's own docs (node_modules/next/dist/docs/.../content-security-policy.md)
 * recommend nonces for a strict policy, but nonces require every page to be
 * dynamically rendered — Next only attaches them during per-request SSR, and
 * static/ISR pages are built with no request to attach one to. This site's
 * whole storefront is intentionally static/ISR (ARCHITECTURE.md §15: "content
 * is pre-rendered and cached rather than rebuilt per request"), so adopting
 * nonces would mean giving that up sitewide — a much bigger, separate
 * architectural trade this header change should not make silently.
 *
 * The trade-off that follows: `script-src` and `style-src` need
 * `'unsafe-inline'`. Next's App Router streams inline hydration scripts
 * (`self.__next_f.push(...)`) regardless of CSP mode — without a nonce, those
 * would violate a strict script-src and break the site. `style-src` needs it
 * because this codebase uses React's `style={{...}}` prop extensively (e.g.
 * the per-category accent colours in components/store/site-footer.tsx),
 * which renders as an inline `style="..."` attribute, itself governed by
 * style-src. The residual risk this leaves is real but bounded: there is no
 * `dangerouslySetInnerHTML` anywhere in this codebase (grepped), so there is
 * no known HTML-injection surface for it to matter against today — this is
 * a defense against a *future* mistake, not a currently-exploitable gap.
 *
 * `connect-src` is `'self'` only: lib/supabase/client.ts (the browser-side
 * Supabase client) has zero importers today — every Supabase read/write goes
 * through Server Actions/Components. If client-side Supabase calls are ever
 * added, this will need the Supabase host added too, or every such call will
 * silently fail against this policy.
 */
function contentSecurityPolicy(): string {
  const origin = supabaseOrigin();
  const isDev = process.env.NODE_ENV === "development";

  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `media-src 'self'${origin ? ` ${origin}` : ""}`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: supabaseImagePattern(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Every browser feature this site has no legitimate use for,
            // denied outright rather than left at the browser default.
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          // HTTPS is already enforced by the host (Vercel redirects http ->
          // https); this header additionally tells the browser to skip the
          // redirect on repeat visits and go straight to https.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
