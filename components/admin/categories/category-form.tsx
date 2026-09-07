"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  createCategoryAction,
  updateCategoryAction,
} from "@/lib/admin/categories/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import { FormField } from "@/components/admin/form-field";
import { FormAlert } from "@/components/admin/form-alert";
import { SubmitButton } from "@/components/admin/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  CATEGORY_DESCRIPTION_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
} from "@/lib/validation/category";
import { slugify } from "@/lib/validation/common";
import { CATEGORY_ACCENTS } from "@/lib/store/category-accent";
import type { AdminCategory } from "@/lib/supabase/queries/admin-categories";

/**
 * Create/edit form for a category.
 *
 * Two consequences of the slug are surfaced live rather than left to be
 * discovered on the public site:
 *
 *   - it is the `?place=` value on /products, so changing it breaks shared
 *     links;
 *   - lib/store/category-accent.ts keys the brand accent colour off it, and an
 *     unrecognised slug renders plain grey.
 *
 * Neither blocks saving. The form states them and lets the admin decide.
 */
export function CategoryForm({ category }: { category?: AdminCategory }) {
  const isEditing = Boolean(category);
  const [state, formAction] = useActionState(
    isEditing ? updateCategoryAction : createCategoryAction,
    IDLE_RESULT,
  );

  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  // Only auto-fill the slug while creating, and only until it is edited by
  // hand. Rewriting an existing slug from the name would silently break links.
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const accent = CATEGORY_ACCENTS[effectiveSlug];
  const slugChanged = isEditing && category!.slug !== effectiveSlug;

  const productCount = category?.productCount ?? 0;
  const activeProductCount = category?.activeProductCount ?? 0;

  const visibilityNote = !isActive
    ? activeProductCount > 0
      ? `Hidden: this category disappears from the catalog filters — and because the catalog only shows products whose category is visible, its ${activeProductCount} active ${activeProductCount === 1 ? "product" : "products"} will be hidden from the storefront too.`
      : "Hidden: this category no longer appears as a catalog filter."
    : productCount === 0
      ? "Visible, but a category with no products does not show up as a catalog filter."
      : `Visible, with ${activeProductCount} active ${activeProductCount === 1 ? "product" : "products"}.`;

  return (
    <form action={formAction} className="mt-6 grid max-w-2xl gap-6">
      {category && <input type="hidden" name="id" value={category.id} />}

      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <section className="grid gap-4">
        <h2 className="text-sm font-semibold tracking-tight">Category</h2>

        <FormField
          name="name"
          label="Name"
          hint="Shown on the catalog filter and the homepage tiles — for example “Desk”."
          errors={state.fieldErrors?.name}
          required
        >
          <Input
            id="name"
            name="name"
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            aria-invalid={Boolean(state.fieldErrors?.name)}
          />
        </FormField>

        <FormField
          name="slug"
          label="Slug"
          hint="Lowercase letters, numbers and hyphens. Used in the catalog filter URL."
          errors={state.fieldErrors?.slug}
          required
        >
          <Input
            id="slug"
            name="slug"
            value={effectiveSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            required
            aria-invalid={Boolean(state.fieldErrors?.slug)}
          />
        </FormField>

        <div className="grid gap-2 border border-border bg-muted px-3 py-2.5 text-xs">
          <p className="text-muted-foreground">
            Catalog filter link:{" "}
            <code className="font-mono text-foreground">
              /products?place={effectiveSlug || "…"}
            </code>
          </p>

          {slugChanged && (
            <p role="status" className="text-foreground">
              <strong>Changing the slug breaks existing links.</strong> Anything already
              pointing at{" "}
              <code className="font-mono">/products?place={category!.slug}</code> — a shared
              link, a saved bookmark, an Instagram bio — will fall back to the full catalog
              instead of this category. It still works, it just stops filtering.
            </p>
          )}

          <p className="flex items-center gap-2 text-muted-foreground">
            <span
              aria-hidden
              className="inline-block size-3.5 shrink-0 border border-border"
              style={{ background: accent?.bg ?? "var(--gray-100)" }}
            />
            {accent ? (
              <span>
                Accent colour: this slug has a brand colour assigned in{" "}
                <code className="font-mono">lib/store/category-accent.ts</code>.
              </span>
            ) : (
              <span>
                <strong className="text-foreground">No accent colour for this slug.</strong>{" "}
                Product cards in this category will use plain dark grey. Brand colours are
                mapped by slug in <code className="font-mono">lib/store/category-accent.ts</code>{" "}
                and need a code change to add one.
              </span>
            )}
          </p>
        </div>

        <FormField
          name="description"
          label="Description (optional)"
          hint={`Internal context for now — nothing on the storefront renders it yet. Up to ${CATEGORY_DESCRIPTION_MAX_LENGTH} characters.`}
          errors={state.fieldErrors?.description}
        >
          <Textarea
            id="description"
            name="description"
            rows={3}
            maxLength={CATEGORY_DESCRIPTION_MAX_LENGTH}
            defaultValue={category?.description ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.description)}
          />
        </FormField>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Visibility</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Hiding a category also hides its products from the catalog, even products that
            are active themselves.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="isActive"
            name="isActive"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Label htmlFor="isActive">Visible on the site</Label>
        </div>

        <p role="status" className="border border-border px-3 py-2 text-xs">
          {visibilityNote}
        </p>

        <FormField
          name="sortOrder"
          label="Display order"
          hint="Lower numbers appear first in the catalog filters. Leave at 0 unless you need a specific position."
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
            defaultValue={String(category?.sortOrder ?? 0)}
            aria-invalid={Boolean(state.fieldErrors?.sortOrder)}
          />
        </FormField>
      </section>

      <div className="border-t border-border pt-6">
        <SubmitButton>{isEditing ? "Save category" : "Create category"}</SubmitButton>
      </div>
    </form>
  );
}
