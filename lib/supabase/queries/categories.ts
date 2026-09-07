import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import type { Category } from "@/types/category";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

export async function getActiveCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured) {
    logger.debug("getActiveCategories skipped: Supabase not configured");
    return [];
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    logger.error("getActiveCategories failed", { error: error.message });
    return [];
  }

  return (data ?? []).map(toCategory);
}
