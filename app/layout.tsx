import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { publicEnv } from "@/lib/validation/env";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  // publicEnv.siteUrl is validated and blank-guarded in lib/validation/env.ts
  // — do not read process.env.NEXT_PUBLIC_SITE_URL directly here again; that
  // duplicated fallback is what broke the production build (see git history).
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: "ZWIK — Your own miniature world",
    template: "%s · ZWIK",
  },
  description:
    "Hand-painted miniature decor for desks, monitors, dashboards, and shelves.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
