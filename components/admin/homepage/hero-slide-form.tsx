"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createHeroSlideAction,
  updateHeroSlideAction,
} from "@/lib/admin/homepage/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import {
  HERO_CTA_OPTIONS,
  toDateTimeLocalValue,
  type HeroCtaFormValue,
} from "@/lib/validation/hero-slide";
import { FormField } from "@/components/admin/form-field";
import { FormAlert } from "@/components/admin/form-alert";
import { SubmitButton } from "@/components/admin/submit-button";
import { AssetPicker } from "@/components/admin/asset-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { AdminAsset } from "@/lib/supabase/queries/admin-assets";
import type { AdminHeroSlide } from "@/lib/supabase/queries/admin-hero-slides";

/**
 * Create/edit form for a hero slide.
 *
 * A client component because three things react to input without a round
 * trip: the CTA type reveals its dependent fields, the visibility switch warns
 * that a hidden slide will not appear, and both feed straight back into what
 * the server will require. Everything it posts is re-validated server-side —
 * the conditional rendering here is convenience, not enforcement.
 *
 * Uses a native <select> for the CTA type: components/ui/select is a Base UI
 * popup that manages its own value, whereas a native select posts reliably in
 * FormData with no client wiring.
 */

const SELECT_CLASSES =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export function HeroSlideForm({
  mode,
  slide,
  assets,
}: {
  mode: "create" | "edit";
  /** The row being edited. Absent in create mode. */
  slide?: AdminHeroSlide;
  /** Active image assets, fetched server-side by the page. */
  assets: AdminAsset[];
}) {
  const [state, formAction] = useActionState(
    mode === "edit" ? updateHeroSlideAction : createHeroSlideAction,
    IDLE_RESULT,
  );

  const [ctaType, setCtaType] = useState<HeroCtaFormValue>(slide?.ctaType ?? "none");
  const [isActive, setIsActive] = useState(slide?.isActive ?? true);

  const assetErrors = state.fieldErrors?.assetId;

  return (
    <form action={formAction} className="mt-6 grid max-w-2xl gap-6">
      {mode === "edit" && slide && <input type="hidden" name="id" value={slide.id} />}

      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <section className="grid gap-4">
        <h2 className="text-sm font-semibold tracking-tight">Content</h2>

        <FormField
          name="heading"
          label="Heading"
          errors={state.fieldErrors?.heading}
          required
        >
          <Input
            id="heading"
            name="heading"
            defaultValue={slide?.heading ?? ""}
            maxLength={120}
            required
            aria-invalid={Boolean(state.fieldErrors?.heading)}
          />
        </FormField>

        <FormField
          name="subheading"
          label="Subheading"
          hint="Optional supporting line shown under the heading."
          errors={state.fieldErrors?.subheading}
        >
          <Textarea
            id="subheading"
            name="subheading"
            rows={2}
            maxLength={280}
            defaultValue={slide?.subheading ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.subheading)}
          />
        </FormField>

        {/* Not a FormField: the picker is a listbox with its own label rather
            than a single control an htmlFor could point at. */}
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Slide image</p>
          <AssetPicker
            name="assetId"
            assets={assets}
            defaultSelectedIds={slide?.assetId ? [slide.assetId] : []}
            emptyHint="No images in the library yet. Upload one from the Assets page, then come back."
          />
          <p className="text-xs text-muted-foreground">
            Optional. Pick one image; click it again to clear the selection.
          </p>
          {assetErrors?.length ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {assetErrors.join(" ")}
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Button</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional call to action shown on the slide.
          </p>
        </div>

        <FormField name="ctaType" label="Button action" errors={state.fieldErrors?.ctaType}>
          <select
            id="ctaType"
            name="ctaType"
            value={ctaType}
            onChange={(event) => setCtaType(event.target.value as HeroCtaFormValue)}
            className={SELECT_CLASSES}
            aria-invalid={Boolean(state.fieldErrors?.ctaType)}
          >
            {HERO_CTA_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>

        {ctaType !== "none" && (
          <FormField
            name="ctaLabel"
            label="Button label"
            hint="The words on the button, e.g. “Shop the range”."
            errors={state.fieldErrors?.ctaLabel}
            required
          >
            <Input
              id="ctaLabel"
              name="ctaLabel"
              maxLength={40}
              defaultValue={slide?.ctaLabel ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.ctaLabel)}
            />
          </FormField>
        )}

        {ctaType === "url" && (
          <FormField
            name="ctaUrl"
            label="Button link"
            hint="An https:// address, or a path on this site starting with /."
            errors={state.fieldErrors?.ctaUrl}
            required
          >
            <Input
              id="ctaUrl"
              name="ctaUrl"
              inputMode="url"
              placeholder="/products or https://example.com/page"
              defaultValue={slide?.ctaUrl ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.ctaUrl)}
            />
          </FormField>
        )}
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="text-sm font-semibold tracking-tight">Visibility and order</h2>

        <div className="flex items-center gap-3">
          <Switch
            id="isActive"
            name="isActive"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Label htmlFor="isActive">Slide is visible</Label>
        </div>

        {!isActive && (
          <p
            role="status"
            className="border border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
          >
            Hidden: this slide will not appear on the homepage until it is made visible
            again.
          </p>
        )}

        <FormField
          name="sortOrder"
          label="Sort order"
          hint="Lower numbers appear first."
          errors={state.fieldErrors?.sortOrder}
        >
          <Input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            max={9999}
            step={1}
            defaultValue={String(slide?.sortOrder ?? 0)}
            aria-invalid={Boolean(state.fieldErrors?.sortOrder)}
          />
        </FormField>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Schedule</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional. Leave both blank to show the slide whenever it is visible. Times are
            entered and stored in UTC, so they mean the same thing wherever they are read.
          </p>
        </div>

        <FormField
          name="startsAt"
          label="Starts at (UTC)"
          errors={state.fieldErrors?.startsAt}
        >
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={toDateTimeLocalValue(slide?.startsAt)}
            aria-invalid={Boolean(state.fieldErrors?.startsAt)}
          />
        </FormField>

        <FormField name="endsAt" label="Ends at (UTC)" errors={state.fieldErrors?.endsAt}>
          <Input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            defaultValue={toDateTimeLocalValue(slide?.endsAt)}
            aria-invalid={Boolean(state.fieldErrors?.endsAt)}
          />
        </FormField>
      </section>

      <div className="flex items-center gap-2 border-t border-border pt-6">
        <SubmitButton>{mode === "edit" ? "Save slide" : "Create slide"}</SubmitButton>
        {/* Base UI composes via `render`, not Radix's `asChild`. */}
        <Button variant="outline" render={<Link href="/admin/homepage" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
