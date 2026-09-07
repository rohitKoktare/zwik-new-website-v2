"use client";

import { useActionState, useState } from "react";
import { updateSettingsAction } from "@/lib/admin/settings/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import { FormField } from "@/components/admin/form-field";
import { FormAlert } from "@/components/admin/form-alert";
import { SubmitButton } from "@/components/admin/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { AdminSiteSettings } from "@/lib/supabase/queries/admin-settings";

/**
 * Every text field is controlled, matching ProductForm and CategoryForm.
 *
 * This form previously used `defaultValue`. That is fine right up until a
 * successful save: `updateSettingsAction` calls `revalidateSiteWide()`, which
 * refetches this page's server data and hands this same mounted component a
 * new `settings` prop with the value just written. Base UI's `Input` (a
 * `Field.Control` underneath) locks in its uncontrolled state from the first
 * render, so a `defaultValue` that changes afterwards trips its own dev-mode
 * guard — "changing the default value state of an uncontrolled FieldControl
 * after being initialized." Holding the values in state avoids the problem
 * entirely rather than suppressing the warning.
 *
 * All state changes happen in event handlers. Nothing here sets state from an
 * effect (see components/admin/confirm-action.tsx for the same rule applied to
 * action results).
 */

type FormValues = {
  brandName: string;
  contactEmail: string;
  instagramUrl: string;
  whatsappNumber: string;
  whatsappDefaultMessage: string;
  freeDeliveryThreshold: string;
  deliveryFee: string;
  deliveryScopeNote: string;
  defaultSeoTitle: string;
  defaultSeoDescription: string;
};

function initialValues(settings: AdminSiteSettings): FormValues {
  return {
    brandName: settings.brandName,
    contactEmail: settings.contactEmail ?? "",
    instagramUrl: settings.instagramUrl ?? "",
    whatsappNumber: settings.whatsappNumber ?? "",
    whatsappDefaultMessage: settings.whatsappDefaultMessage ?? "",
    freeDeliveryThreshold:
      settings.freeDeliveryThreshold === null ? "" : String(settings.freeDeliveryThreshold),
    deliveryFee: settings.deliveryFee === null ? "" : String(settings.deliveryFee),
    deliveryScopeNote: settings.deliveryScopeNote ?? "",
    defaultSeoTitle: settings.defaultSeoTitle ?? "",
    defaultSeoDescription: settings.defaultSeoDescription ?? "",
  };
}

export function SettingsForm({ settings }: { settings: AdminSiteSettings }) {
  const [state, formAction] = useActionState(updateSettingsAction, IDLE_RESULT);
  const [whatsappEnabled, setWhatsappEnabled] = useState(settings.whatsappEnabled);
  // Lazy initializer: runs once at mount, never re-synced from a later
  // `settings` prop, so a post-save refetch cannot fight what's on screen.
  const [values, setValues] = useState<FormValues>(() => initialValues(settings));

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <form action={formAction} className="mt-6 grid max-w-2xl gap-6">
      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <section className="grid gap-4">
        <h2 className="text-sm font-semibold tracking-tight">Brand</h2>

        <FormField name="brandName" label="Brand name" errors={state.fieldErrors?.brandName} required>
          <Input
            id="brandName"
            name="brandName"
            value={values.brandName}
            onChange={(e) => setField("brandName", e.target.value)}
            required
            aria-invalid={Boolean(state.fieldErrors?.brandName)}
          />
        </FormField>

        <FormField
          name="contactEmail"
          label="Contact email"
          hint="Shown on the contact page when set."
          errors={state.fieldErrors?.contactEmail}
        >
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            value={values.contactEmail}
            onChange={(e) => setField("contactEmail", e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.contactEmail)}
          />
        </FormField>

        <FormField
          name="instagramUrl"
          label="Instagram URL"
          errors={state.fieldErrors?.instagramUrl}
        >
          <Input
            id="instagramUrl"
            name="instagramUrl"
            inputMode="url"
            placeholder="https://instagram.com/…"
            value={values.instagramUrl}
            onChange={(e) => setField("instagramUrl", e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.instagramUrl)}
          />
        </FormField>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">WhatsApp ordering</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            This is how customers place orders. Turning it off, or leaving the number blank,
            removes the only way to buy from the site.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="whatsappEnabled"
            name="whatsappEnabled"
            checked={whatsappEnabled}
            onCheckedChange={setWhatsappEnabled}
          />
          <Label htmlFor="whatsappEnabled">WhatsApp ordering enabled</Label>
        </div>

        {!whatsappEnabled && (
          <p role="alert" className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Ordering is currently switched off. Customers will not see a way to place an order.
          </p>
        )}

        <FormField
          name="whatsappNumber"
          label="WhatsApp number"
          hint="Include the country code. Digits only — e.g. 917666068317 for +91 76660 68317."
          errors={state.fieldErrors?.whatsappNumber}
          required={whatsappEnabled}
        >
          <Input
            id="whatsappNumber"
            name="whatsappNumber"
            inputMode="numeric"
            value={values.whatsappNumber}
            onChange={(e) => setField("whatsappNumber", e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.whatsappNumber)}
          />
        </FormField>

        <FormField
          name="whatsappDefaultMessage"
          label="Default enquiry message"
          hint="Pre-filled when someone taps “Ask a question”."
          errors={state.fieldErrors?.whatsappDefaultMessage}
        >
          <Textarea
            id="whatsappDefaultMessage"
            name="whatsappDefaultMessage"
            rows={3}
            value={values.whatsappDefaultMessage}
            onChange={(e) => setField("whatsappDefaultMessage", e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.whatsappDefaultMessage)}
          />
        </FormField>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Delivery</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Shown in the footer, on every product page and in the cart, where it also tells
            the customer how much more to add. Leave the amount blank to run no offer — the
            site then says nothing about delivery cost.
          </p>
        </div>

        {settings.deliveryMigrationPending && (
          <p
            role="alert"
            className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            <strong>These two fields cannot be saved yet.</strong> The database is missing
            the delivery columns — apply{" "}
            <code className="font-mono">
              supabase/migrations/0011_delivery_settings.sql
            </code>{" "}
            (<code className="font-mono">npm run db:push</code>), then reload this page.
            Everything else on this form saves normally.
          </p>
        )}

        <FormField
          name="freeDeliveryThreshold"
          label="Free delivery over"
          hint="Order value at or above which delivery is free, in rupees. For example 500."
          errors={state.fieldErrors?.freeDeliveryThreshold}
        >
          <Input
            id="freeDeliveryThreshold"
            name="freeDeliveryThreshold"
            inputMode="decimal"
            placeholder="500"
            className="w-40"
            disabled={settings.deliveryMigrationPending}
            value={values.freeDeliveryThreshold}
            onChange={(e) => setField("freeDeliveryThreshold", e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.freeDeliveryThreshold)}
          />
        </FormField>

        <FormField
          name="deliveryFee"
          label="Delivery charge below that"
          hint="Flat charge quoted in the cart and inside the WhatsApp order message. Leave blank to not quote one — the cart then says delivery is confirmed on WhatsApp."
          errors={state.fieldErrors?.deliveryFee}
        >
          <Input
            id="deliveryFee"
            name="deliveryFee"
            inputMode="decimal"
            placeholder="79"
            className="w-40"
            disabled={settings.deliveryMigrationPending}
            value={values.deliveryFee}
            onChange={(e) => setField("deliveryFee", e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.deliveryFee)}
          />
        </FormField>

        <FormField
          name="deliveryScopeNote"
          label="Where it applies"
          hint="Completes the sentence “Free delivery over ₹500 …”. Keep it short."
          errors={state.fieldErrors?.deliveryScopeNote}
        >
          <Input
            id="deliveryScopeNote"
            name="deliveryScopeNote"
            placeholder="across all India"
            disabled={settings.deliveryMigrationPending}
            value={values.deliveryScopeNote}
            onChange={(e) => setField("deliveryScopeNote", e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.deliveryScopeNote)}
          />
        </FormField>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="text-sm font-semibold tracking-tight">SEO defaults</h2>

        <FormField
          name="defaultSeoTitle"
          label="Default page title"
          errors={state.fieldErrors?.defaultSeoTitle}
        >
          <Input
            id="defaultSeoTitle"
            name="defaultSeoTitle"
            value={values.defaultSeoTitle}
            onChange={(e) => setField("defaultSeoTitle", e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.defaultSeoTitle)}
          />
        </FormField>

        <FormField
          name="defaultSeoDescription"
          label="Default meta description"
          hint="Around 150–160 characters reads best in search results."
          errors={state.fieldErrors?.defaultSeoDescription}
        >
          <Textarea
            id="defaultSeoDescription"
            name="defaultSeoDescription"
            rows={3}
            value={values.defaultSeoDescription}
            onChange={(e) => setField("defaultSeoDescription", e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.defaultSeoDescription)}
          />
        </FormField>
      </section>

      <div className="border-t border-border pt-6">
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </form>
  );
}
