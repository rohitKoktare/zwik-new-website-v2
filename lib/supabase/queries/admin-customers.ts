import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logQueryFailure } from "@/lib/supabase/pending-migration";
import type { Pagination } from "@/lib/admin/pagination";
import { canReceiveMarketing, type Customer } from "@/types/customer";

/**
 * Admin customer reads.
 *
 * Every row here is personal data. All queries use the RLS-enforced client, and
 * `customers` has no public read policy at all (migration 0012) — so this data
 * cannot leak through the anon key even if a page forgets its guard.
 */

export type AdminCustomer = Customer & {
  /** Orders of any status. */
  orderCount: number;
  /** Orders a human has confirmed — the ones that represent real business. */
  confirmedOrderCount: number;
  lastOrderAt: string | null;
  /** Total across confirmed orders only; initiated ones may never have been sent. */
  confirmedTotal: number;
  /** Whether a campaign may include them. */
  contactable: boolean;
};

export const CUSTOMER_FILTERS = ["consented", "no-consent", "unsubscribed"] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];

/** Validates an untrusted `?filter=` value (DEVELOPMENT_STANDARDS.md §7). */
export function parseCustomerFilter(value?: string): CustomerFilter | undefined {
  const allowed: readonly string[] = CUSTOMER_FILTERS;
  return value !== undefined && allowed.includes(value) ? (value as CustomerFilter) : undefined;
}

type CustomerRow = {
  id: string;
  phone: string;
  name: string | null;
  city_and_pincode: string | null;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  marketing_consent_source: string | null;
  unsubscribed_at: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  orders: { status: string; total: number | string; created_at: string }[] | null;
};

const CUSTOMER_SELECT = `
  id, phone, name, city_and_pincode, marketing_consent, marketing_consent_at,
  marketing_consent_source, unsubscribed_at, admin_note, created_at, updated_at,
  orders(status, total, created_at)
`;

function toAdminCustomer(row: CustomerRow): AdminCustomer {
  const orders = row.orders ?? [];
  const confirmed = orders.filter(
    (order) => order.status === "confirmed" || order.status === "fulfilled",
  );

  const lastOrderAt = orders.reduce<string | null>(
    (latest, order) => (latest === null || order.created_at > latest ? order.created_at : latest),
    null,
  );

  const customer: Customer = {
    id: row.id,
    phone: row.phone,
    name: row.name,
    cityAndPincode: row.city_and_pincode,
    marketingConsent: row.marketing_consent,
    marketingConsentAt: row.marketing_consent_at,
    marketingConsentSource: row.marketing_consent_source,
    unsubscribedAt: row.unsubscribed_at,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return {
    ...customer,
    orderCount: orders.length,
    confirmedOrderCount: confirmed.length,
    lastOrderAt,
    confirmedTotal: confirmed.reduce((sum, order) => sum + Number(order.total), 0),
    contactable: canReceiveMarketing(customer),
  };
}

export async function listCustomersForAdmin(options: {
  pagination: Pagination;
  filter?: CustomerFilter;
  search?: string;
}): Promise<{ customers: AdminCustomer[]; totalCount: number }> {
  if (!isSupabaseConfigured) return { customers: [], totalCount: 0 };

  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select(CUSTOMER_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(options.pagination.from, options.pagination.to);

  if (options.filter === "consented") {
    query = query.eq("marketing_consent", true).is("unsubscribed_at", null);
  }
  if (options.filter === "no-consent") {
    query = query.eq("marketing_consent", false);
  }
  if (options.filter === "unsubscribed") {
    query = query.not("unsubscribed_at", "is", null);
  }

  if (options.search) {
    const term = options.search.trim();
    const digits = term.replace(/[^0-9]/g, "");

    if (digits.length >= 3) {
      query = query.ilike("phone", `%${digits}%`);
    } else {
      // Escape PostgREST's or() delimiters before interpolating user input.
      const safe = term.replace(/[,()]/g, " ").trim();
      if (safe) query = query.ilike("name", `%${safe}%`);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    logQueryFailure("listCustomersForAdmin", error, "customers");
    return { customers: [], totalCount: 0 };
  }

  return {
    customers: ((data ?? []) as unknown as CustomerRow[]).map(toAdminCustomer),
    totalCount: count ?? 0,
  };
}

export async function getCustomerById(id: string): Promise<AdminCustomer | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logQueryFailure("getCustomerById", error, "customers");
    return null;
  }

  return data ? toAdminCustomer(data as unknown as CustomerRow) : null;
}

/**
 * Size of the marketing audience: consented, not unsubscribed.
 *
 * Used to tell the admin how many people a campaign would actually reach before
 * they write it, and as the sanity check that consent gating is doing something.
 */
export async function countContactableCustomers(): Promise<{
  contactable: number;
  total: number;
}> {
  if (!isSupabaseConfigured) return { contactable: 0, total: 0 };

  const supabase = await createClient();

  const [contactable, total] = await Promise.all([
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("marketing_consent", true)
      .is("unsubscribed_at", null),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ]);

  if (contactable.error || total.error) {
    logQueryFailure(
      "countContactableCustomers",
      contactable.error ?? total.error,
      "customers",
    );
    return { contactable: 0, total: 0 };
  }

  return { contactable: contactable.count ?? 0, total: total.count ?? 0 };
}
