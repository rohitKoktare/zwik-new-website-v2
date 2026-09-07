"use client";

import { useActionState, useState } from "react";
import { createReviewAction, updateReviewAction } from "@/lib/admin/reviews/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import { FormField } from "@/components/admin/form-field";
import { FormAlert } from "@/components/admin/form-alert";
import { SubmitButton } from "@/components/admin/submit-button";
import { AssetPicker } from "@/components/admin/asset-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  REVIEW_NAME_MAX_LENGTH,
  REVIEW_SOURCES,
  REVIEW_SOURCE_LABELS,
  REVIEW_TEXT_MAX_LENGTH,
} from "@/lib/validation/review";
import type { AdminAsset } from "@/lib/supabase/queries/admin-assets";
import type {
  AdminReview,
  ReviewProductOption,
} from "@/lib/supabase/queries/admin-reviews";

/**
 * Create/edit form for a review.
 *
 * Uses native <select> elements rather than the Base UI Select wrapper: a
 * native select posts its value in FormData with no client wiring, which is
 * what these plain server-action forms need.
 *
 * Source is a required, deliberate choice (DATABASE_DESIGN.md §8). ZWIK cannot
 * confirm a purchase, because ordering happens over WhatsApp rather than an
 * on-site checkout, so this form never offers any purchase-verification
 * affordance — only accurate attribution of where feedback came from.
 */

/** Native select styled to match components/ui/input. */
const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30";

export function ReviewForm({
  products,
  assets,
  review,
}: {
  /** Active products, fetched server-side. */
  products: ReviewProductOption[];
  /** Selectable image assets, fetched server-side. */
  assets: AdminAsset[];
  /** Present when editing; absent when creating. */
  review?: AdminReview;
}) {
  const isEditing = Boolean(review);
  const [state, formAction] = useActionState(
    isEditing ? updateReviewAction : createReviewAction,
    IDLE_RESULT,
  );

  const [isActive, setIsActive] = useState(review?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(review?.isFeatured ?? false);
  // Controlled: updateReviewAction revalidates this exact edit page, so a
  // successful save hands this mounted form a fresh `review` prop. A
  // `defaultValue` here would then change after Base UI's Input has already
  // locked in its initial uncontrolled state, which trips its "changing the
  // default value state" dev warning. (The Textarea and native <select>
  // fields below aren't Base UI components, so they aren't affected and stay
  // as `defaultValue`.)
  const [customerDisplayName, setCustomerDisplayName] = useState(
    review?.customerDisplayName ?? "",
  );
  const [rating, setRating] = useState(review ? String(review.rating) : "");
  const [sortOrder, setSortOrder] = useState(String(review?.sortOrder ?? 0));

  // The product a review already points at may have been hidden since. Keep it
  // in the list so editing an unrelated field cannot silently reassign it.
  const missingProductOption =
    review && !products.some((product) => product.id === review.productId)
      ? {
          id: review.productId,
          label: `${review.productName ?? "Unknown product"} (not currently active)`,
        }
      : null;

  // A row may carry a custom source written before these options existed.
  // Offer it back verbatim so saving cannot rewrite an existing attribution.
  const knownSources: readonly string[] = REVIEW_SOURCES;
  const customSource =
    review && review.source !== "" && !knownSources.includes(review.source)
      ? review.source
      : null;

  const visibilityNote = !isActive
    ? "Hidden: this review appears nowhere on the site."
    : isFeatured
      ? "Active and featured: eligible for the homepage, which shows the first few featured reviews by display order."
      : "Active but not featured: the homepage only shows featured reviews, so this one will not appear there.";

  return (
    <form action={formAction} className="mt-6 grid max-w-2xl gap-6">
      {review && <input type="hidden" name="id" value={review.id} />}

      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <div className="border border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        <p className="text-sm font-medium text-foreground">
          Publish real customer feedback only.
        </p>
        <p className="mt-1">
          Ordering happens over WhatsApp rather than an on-site checkout, so ZWIK cannot
          confirm that a reviewer bought the product. Reviews are published as customer
          feedback, not as proof of purchase. Never invent a review, and never change a
          review&rsquo;s <strong>Source</strong> to a channel it did not actually come from.
        </p>
      </div>

      <section className="grid gap-4">
        <h2 className="text-sm font-semibold tracking-tight">Review</h2>

        <FormField
          name="productId"
          label="Product"
          hint="The product this feedback is about."
          errors={state.fieldErrors?.productId}
          required
        >
          <select
            id="productId"
            name="productId"
            data-slot="input"
            className={SELECT_CLASS}
            defaultValue={review?.productId ?? ""}
            required
            aria-invalid={Boolean(state.fieldErrors?.productId)}
          >
            <option value="" disabled>
              Choose a product…
            </option>
            {missingProductOption && (
              <option value={missingProductOption.id}>{missingProductOption.label}</option>
            )}
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
                {product.isActive ? "" : " (hidden)"}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          name="customerDisplayName"
          label="Customer name"
          hint="Shown publicly. A first name and initial is fine — do not publish contact details."
          errors={state.fieldErrors?.customerDisplayName}
          required
        >
          <Input
            id="customerDisplayName"
            name="customerDisplayName"
            maxLength={REVIEW_NAME_MAX_LENGTH}
            value={customerDisplayName}
            onChange={(event) => setCustomerDisplayName(event.target.value)}
            required
            aria-invalid={Boolean(state.fieldErrors?.customerDisplayName)}
          />
        </FormField>

        <FormField
          name="rating"
          label="Rating out of 5"
          hint="Whole or half stars only — for example 4 or 4.5. Record what the customer actually gave."
          errors={state.fieldErrors?.rating}
          required
        >
          <Input
            id="rating"
            name="rating"
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            max="5"
            className="w-32"
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            required
            aria-invalid={Boolean(state.fieldErrors?.rating)}
          />
        </FormField>

        <FormField
          name="reviewText"
          label="Review text"
          hint={`The customer's own words. Up to ${REVIEW_TEXT_MAX_LENGTH} characters.`}
          errors={state.fieldErrors?.reviewText}
          required
        >
          <Textarea
            id="reviewText"
            name="reviewText"
            rows={6}
            maxLength={REVIEW_TEXT_MAX_LENGTH}
            defaultValue={review?.reviewText ?? ""}
            required
            aria-invalid={Boolean(state.fieldErrors?.reviewText)}
          />
        </FormField>

        <FormField
          name="source"
          label="Source"
          hint="Where this feedback genuinely came from. This attribution is shown to customers, so keep it accurate."
          errors={state.fieldErrors?.source}
          required
        >
          <select
            id="source"
            name="source"
            data-slot="input"
            className={SELECT_CLASS}
            defaultValue={review?.source ?? ""}
            required
            aria-invalid={Boolean(state.fieldErrors?.source)}
          >
            <option value="" disabled>
              Choose where this review came from…
            </option>
            {customSource && (
              <option value={customSource}>{customSource} (existing value)</option>
            )}
            {REVIEW_SOURCES.map((source) => (
              <option key={source} value={source}>
                {REVIEW_SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </FormField>
      </section>

      <section className="grid gap-3 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Photo (optional)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Only use a photo the customer actually sent and agreed to have published. Upload
            new images from the Assets page first.
          </p>
        </div>

        <AssetPicker
          name="imageAssetId"
          assets={assets}
          defaultSelectedIds={review?.imageAssetId ? [review.imageAssetId] : []}
          emptyHint="No images in the library yet. Upload one from the Assets page to attach a photo."
        />
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Visibility</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The homepage reviews section shows reviews that are <strong>both</strong> active
            and featured. Active on its own is not enough for a review to appear there.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="isActive"
            name="isActive"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Label htmlFor="isActive">Active (visible on the site)</Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="isFeatured"
            name="isFeatured"
            checked={isFeatured}
            onCheckedChange={setIsFeatured}
          />
          <Label htmlFor="isFeatured">Featured (candidate for the homepage)</Label>
        </div>

        <p role="status" className="border border-border px-3 py-2 text-xs">
          {visibilityNote}
        </p>

        <FormField
          name="sortOrder"
          label="Display order"
          hint="Lower numbers appear first. Leave at 0 unless you need a specific position."
          errors={state.fieldErrors?.sortOrder}
        >
          <Input
            id="sortOrder"
            name="sortOrder"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            className="w-32"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.sortOrder)}
          />
        </FormField>
      </section>

      <div className="border-t border-border pt-6">
        <SubmitButton>{isEditing ? "Save review" : "Create review"}</SubmitButton>
      </div>
    </form>
  );
}
