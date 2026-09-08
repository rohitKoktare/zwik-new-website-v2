import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customer-auth/session";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { PhoneLoginForm } from "@/components/store/phone-login-form";

/**
 * Session-dependent, like the tracking page it sits next to — must never be
 * crawled or enter the (store) layout's hourly ISR cache.
 */
export const metadata: Metadata = {
  title: "View your orders",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CustomerLoginPage() {
  const customer = await getCurrentCustomer();
  if (customer) redirect("/orders");

  return (
    <section className="px-6 py-14 md:px-12 md:py-16">
      <div className="mx-auto max-w-sm">
        <div className="font-mono text-[11px] tracking-[1.4px] text-[var(--text-secondary)] uppercase">
          No password needed
        </div>
        <h1 className="mt-3 text-[clamp(28px,3.5vw,40px)] leading-[0.98] font-semibold tracking-[-0.03em]">
          View your orders
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          Enter the mobile number you used when ordering.
        </p>

        <div className="mt-8">
          {!isSupabaseConfigured ? (
            <p className="border border-dashed border-[var(--border-strong)] p-4 text-sm text-[var(--text-secondary)]">
              This isn&rsquo;t set up on this deployment yet.
            </p>
          ) : (
            <PhoneLoginForm />
          )}
        </div>
      </div>
    </section>
  );
}
