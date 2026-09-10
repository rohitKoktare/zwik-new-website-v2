"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createProductAction,
  updateProductAction,
} from "@/lib/admin/products/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import { slugify } from "@/lib/validation/common";
import { MAX_GALLERY_ASSETS } from "@/lib/validation/product";
import { FormField } from "@/components/admin/form-field";
import { FormAlert } from "@/components/admin/form-alert";
import { SubmitButton } from "@/components/admin/submit-button";
import { AssetPicker } from "@/components/admin/asset-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { AdminAsset } from "@/lib/supabase/queries/admin-assets";
import type { AdminProduct } from "@/lib/supabase/queries/admin-products";

export type ProductCategoryOption = { id: string; name: string };

/**
 * Create/edit form for a product.
 *
 * Every text field is controlled. React resets an *uncontrolled* form once a
 * form action resolves, which would wipe a long description the moment the
 * server rejected one field — holding the values in state keeps the admin's
 * work on screen alongside the validation messages.
 *
 * All state changes happen in event handlers. Nothing here sets state from an
 * effect (see components/admin/confirm-action.tsx for the same rule applied to
 * action results).
 */

type FormValues = {
  name: string;
  slug: string;
  sku: string;
  shortDescription: string;
  description: string;
  price: string;
  originalPrice: string;
  currency: string;
  sortOrder: string;
  specs: string;
};

function initialValues(product?: AdminProduct): FormValues {
  return {
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    sku: product?.sku ?? "",
    shortDescription: product?.shortDescription ?? "",
    description: product?.description ?? "",
    price: product ? String(product.price) : "",
    originalPrice:
      product && product.originalPrice !== null ? String(product.originalPrice) : "",
    currency: product?.currency ?? "INR",
    sortOrder: product ? String(product.sortOrder) : "0",
    specs: product?.specsText ?? "",
  };
}

export function ProductForm({
  mode,
  product,
  categories,
  assets,
  videoAssets,
}: {
  mode: "create" | "edit";
  product?: AdminProduct;
  categories: ProductCategoryOption[];
  /** Selectable image assets for the gallery. */
  assets: AdminAsset[];
  /** Selectable video assets. Separate list — a video is not a gallery image. */
  videoAssets: AdminAsset[];
}) {
  const [state, formAction] = useActionState(
    mode === "edit" ? updateProductAction : createProductAction,
    IDLE_RESULT,
  );

  const [values, setValues] = useState<FormValues>(() => initialValues(product));
  const [categoryIds, setCategoryIds] = useState<string[]>(product?.categoryIds ?? []);
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  // An existing product already has a slug that public URLs point at, so it is
  // never auto-rewritten from the name.
  const [slugTouched, setSlugTouched] = useState(mode === "edit");

  const errors = state.fieldErrors;

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleNameChange(next: string) {
    setValues((current) => ({
      ...current,
      name: next,
      slug: slugTouched ? current.slug : slugify(next),
    }));
  }

  function toggleCategory(categoryId: string) {
    setCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  }

  // A previously-assigned category may since have been deactivated; keep it
  // checkable so saving unrelated fields cannot silently drop the product
  // from a category an admin never touched. categoryIds/categoryNames come
  // from the same mapped array in admin-products.ts, so they line up by index.
  const missingCategories = (product?.categoryIds ?? [])
    .map((id, index) => ({ id, name: product?.categoryNames[index] ?? "Current category" }))
    .filter((missing) => !categories.some((category) => category.id === missing.id));

  return (
    <form action={formAction} className="mt-6 grid max-w-3xl gap-6">
      {mode === "edit" && product && <input type="hidden" name="id" value={product.id} />}

      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <section className="grid gap-4">
        <h2 className="text-sm font-semibold tracking-tight">Details</h2>

        <FormField name="name" label="Product name" errors={errors?.name} required>
          <Input
            id="name"
            name="name"
            value={values.name}
            onChange={(event) => handleNameChange(event.target.value)}
            required
            maxLength={200}
            aria-invalid={Boolean(errors?.name)}
          />
        </FormField>

        <FormField
          name="slug"
          label="Slug"
          hint="Used in the product URL. Lowercase letters, numbers and hyphens only."
          errors={errors?.slug}
          required
        >
          <div className="flex items-center gap-2">
            <Input
              id="slug"
              name="slug"
              value={values.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setField("slug", event.target.value);
              }}
              required
              maxLength={200}
              aria-invalid={Boolean(errors?.slug)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSlugTouched(true);
                setField("slug", slugify(values.name));
              }}
            >
              Use name
            </Button>
          </div>
        </FormField>

        <FormField
          name="sku"
          label="SKU"
          hint="Optional internal code. Must be unique across products."
          errors={errors?.sku}
        >
          <Input
            id="sku"
            name="sku"
            value={values.sku}
            onChange={(event) => setField("sku", event.target.value)}
            maxLength={64}
            aria-invalid={Boolean(errors?.sku)}
          />
        </FormField>

        <FormField
          name="categoryIds"
          label="Categories"
          hint="A product can belong to more than one — e.g. a dashboard cat miniature assigned to both Monitor and Table decor."
          errors={errors?.categoryIds}
          required
        >
          {/* Native checkboxes with a shared name post reliably as a repeated
              FormData key — the same multi-value shape parseForm already
              collapses into an array for assetIds. */}
          <div
            role="group"
            aria-label="Categories"
            className="grid gap-2 border border-input p-3"
          >
            {missingCategories.map((missing) => (
              <label key={missing.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={missing.id}
                  checked={categoryIds.includes(missing.id)}
                  onChange={() => toggleCategory(missing.id)}
                  className="size-4"
                />
                {missing.name} (hidden)
              </label>
            ))}
            {categories.map((category) => (
              <label key={category.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={category.id}
                  checked={categoryIds.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                  className="size-4"
                />
                {category.name}
              </label>
            ))}
          </div>
        </FormField>

        {categories.length === 0 && missingCategories.length === 0 && (
          <div
            role="alert"
            className="grid gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            <p>
              There are no active categories yet. Add one before creating products — a
              product with no categories never appears on the public site.
            </p>
            <div>
              {/* Base UI composes via `render`, not Radix's `asChild`. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                render={<Link href="/admin/categories/new" />}
              >
                Add a category
              </Button>
            </div>
          </div>
        )}

        <FormField
          name="shortDescription"
          label="Short description"
          hint="One line, shown on cards and in listings."
          errors={errors?.shortDescription}
        >
          <Textarea
            id="shortDescription"
            name="shortDescription"
            rows={2}
            maxLength={300}
            value={values.shortDescription}
            onChange={(event) => setField("shortDescription", event.target.value)}
            aria-invalid={Boolean(errors?.shortDescription)}
          />
        </FormField>

        <FormField name="description" label="Description" errors={errors?.description}>
          <Textarea
            id="description"
            name="description"
            rows={6}
            maxLength={5000}
            value={values.description}
            onChange={(event) => setField("description", event.target.value)}
            aria-invalid={Boolean(errors?.description)}
          />
        </FormField>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Pricing</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            This price is what a customer is quoted when they send their cart over WhatsApp.
            Check it before saving.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField name="price" label="Price" errors={errors?.price} required>
            <Input
              id="price"
              name="price"
              inputMode="decimal"
              placeholder="1299.00"
              value={values.price}
              onChange={(event) => setField("price", event.target.value)}
              required
              aria-invalid={Boolean(errors?.price)}
            />
          </FormField>

          <FormField
            name="originalPrice"
            label="Compare-at price"
            hint="Optional. Shown struck through."
            errors={errors?.originalPrice}
          >
            <Input
              id="originalPrice"
              name="originalPrice"
              inputMode="decimal"
              placeholder="1799.00"
              value={values.originalPrice}
              onChange={(event) => setField("originalPrice", event.target.value)}
              aria-invalid={Boolean(errors?.originalPrice)}
            />
          </FormField>

          <FormField
            name="currency"
            label="Currency"
            hint="Three-letter code."
            errors={errors?.currency}
          >
            <Input
              id="currency"
              name="currency"
              maxLength={3}
              className="uppercase"
              value={values.currency}
              onChange={(event) => setField("currency", event.target.value.toUpperCase())}
              aria-invalid={Boolean(errors?.currency)}
            />
          </FormField>
        </div>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="text-sm font-semibold tracking-tight">Specifications</h2>

        <FormField
          name="specs"
          label="Specifications"
          hint={'One per line, written as "Label: Value" — for example "Material: Stainless steel". Only the first colon on a line is used as the separator.'}
          errors={errors?.specs}
        >
          <Textarea
            id="specs"
            name="specs"
            rows={6}
            className="font-mono text-xs"
            placeholder={"Material: Stainless steel\nCapacity: 750 ml"}
            value={values.specs}
            onChange={(event) => setField("specs", event.target.value)}
            aria-invalid={Boolean(errors?.specs)}
          />
        </FormField>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Images</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The first image selected becomes the main product image; the rest form the
            gallery in the order shown. Up to {MAX_GALLERY_ASSETS} images.
          </p>
        </div>

        <FormField name="assetIds" label="Gallery" errors={errors?.assetIds}>
          <AssetPicker
            name="assetIds"
            multiple
            assets={assets}
            defaultSelectedIds={product?.assetIds ?? []}
          />
        </FormField>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Video (optional)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            One short clip of the piece, shown as the first item in the product gallery with
            the photos after it. Upload MP4 or WebM from the Assets page first — keep it
            small, it loads on the product page. Leave empty for no video.
          </p>
        </div>

        <FormField name="videoAssetId" label="Product video" errors={errors?.videoAssetId}>
          <AssetPicker
            name="videoAssetId"
            assets={videoAssets}
            defaultSelectedIds={product?.videoAssetId ? [product.videoAssetId] : []}
            emptyHint="No videos in the library yet. Upload an MP4 or WebM from the Assets page to attach one."
          />
        </FormField>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="text-sm font-semibold tracking-tight">Visibility</h2>

        <div className="flex items-center gap-3">
          <Switch
            id="isActive"
            name="isActive"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Label htmlFor="isActive">
            {isActive ? "Live — visible on the site" : "Archived — hidden from the site"}
          </Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="isFeatured"
            name="isFeatured"
            checked={isFeatured}
            onCheckedChange={setIsFeatured}
          />
          <Label htmlFor="isFeatured">
            {isFeatured ? "Featured on the homepage" : "Not featured"}
          </Label>
        </div>

        <FormField
          name="sortOrder"
          label="Sort order"
          hint="Lower numbers appear first in listings."
          errors={errors?.sortOrder}
        >
          <Input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            step={1}
            className="max-w-32"
            value={values.sortOrder}
            onChange={(event) => setField("sortOrder", event.target.value)}
            aria-invalid={Boolean(errors?.sortOrder)}
          />
        </FormField>
      </section>

      <div className="flex items-center gap-2 border-t border-border pt-6">
        <SubmitButton>{mode === "edit" ? "Save product" : "Create product"}</SubmitButton>
        <Button variant="outline" render={<Link href="/admin/products" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
