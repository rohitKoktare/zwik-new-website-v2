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

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseImagePattern(),
  },
};

export default nextConfig;
