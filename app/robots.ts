import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/validation/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/admin" }],
    sitemap: `${publicEnv.siteUrl}/sitemap.xml`,
  };
}
