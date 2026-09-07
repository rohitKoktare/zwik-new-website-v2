"use client";

import { useActionState } from "react";
import { updateFeaturedProductsAction } from "@/lib/admin/homepage/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import { FormAlert } from "@/components/admin/form-alert";
import { SubmitButton } from "@/components/admin/submit-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInr } from "@/lib/format";
import type { FeaturedProductCandidate } from "@/lib/supabase/queries/admin-hero-slides";

/**
 * Featured-product picker: one form, a checkbox per product, one save.
 *
 * Every product on screen is also posted as a hidden `productIds` value.
 * Unchecked boxes are omitted by HTML, so without that list the action could
 * not tell "the admin unfeatured this" from "this product was on another
 * page" — and a save would silently clear the rest of the catalogue.
 *
 * Checkboxes are native inputs rather than the Base UI Checkbox: they need to
 * post a per-row `value` into FormData with no client state at all, which is
 * exactly what a native checkbox does.
 */
export function FeaturedProductsPanel({
  products,
}: {
  products: FeaturedProductCandidate[];
}) {
  const [state, formAction] = useActionState(updateFeaturedProductsAction, IDLE_RESULT);

  if (products.length === 0) {
    return (
      <EmptyState
        title="No active products"
        description="Featured products are picked from the active catalogue. Add or publish a product first."
      />
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Currently</TableHead>
              <TableHead className="text-right">Feature on homepage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const checkboxId = `featured-${product.id}`;

              return (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">
                    {product.name}
                    <span className="block font-mono text-xs font-normal text-muted-foreground">
                      /{product.slug}
                    </span>
                    {/* The full set on screen, so an unticked box is a real
                        "not featured" rather than an absence. */}
                    <input type="hidden" name="productIds" value={product.id} />
                  </TableCell>
                  <TableCell>{formatInr(product.price)}</TableCell>
                  <TableCell>
                    <StatusBadge
                      active={product.isFeatured}
                      activeLabel="Featured"
                      inactiveLabel="Not featured"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      name="featuredIds"
                      value={product.id}
                      defaultChecked={product.isFeatured}
                      className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    <label htmlFor={checkboxId} className="sr-only">
                      Feature {product.name} on the homepage
                    </label>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Save featured products</SubmitButton>
        <p className="text-xs text-muted-foreground">
          Saving applies to the products listed above. Products on other pages are left
          untouched.
        </p>
      </div>
    </form>
  );
}
