import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { getCurrentProfile } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/validation/env";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function AdminLoginPage() {
  // Already signed in as an active admin? Don't show the form again.
  const profile = await getCurrentProfile();
  if (profile) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm border border-border bg-background p-8">
        <div className="flex items-center gap-2.5 font-mono text-sm font-semibold tracking-[2px]">
          <span className="block size-3 bg-primary" aria-hidden />
          ZWIK ADMIN
        </div>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin access only. Sign-in attempts are logged.
        </p>

        {!isSupabaseConfigured ? (
          <p className="mt-6 border border-dashed border-border p-4 text-sm text-muted-foreground">
            Supabase isn&apos;t configured on this deployment. Set{" "}
            <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
            <code className="font-mono text-xs">.env.local</code> to enable sign-in.
          </p>
        ) : (
          <LoginForm />
        )}
      </div>
    </main>
  );
}
