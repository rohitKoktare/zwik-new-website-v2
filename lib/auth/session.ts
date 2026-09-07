import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";

export type AdminProfile = {
  id: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
};

/** Returns the current admin profile, or null if unauthenticated/not an active admin. */
export async function getCurrentProfile(): Promise<AdminProfile | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    displayName: profile.display_name,
    role: profile.role,
    isActive: profile.is_active,
  };
}
