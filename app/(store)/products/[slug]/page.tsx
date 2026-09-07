import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/store/product-gallery";
import { ProductPurchasePanel } from "@/components/store/product-purchase-panel";
import { ProductCard } from "@/components/store/product-card";
import { Reveal } from "@/components/store/reveal";
import {
  getActiveProducts,
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/supabase/queries/products";
import { getSiteSettings } from "@/lib/supabase/queries/settings";
import { getCategoryAccent } from "@/lib/store/category-accent";
import { getDeliveryTerms } from "@/lib/store/delivery";
import { formatInr } from "@/lib/format";

/**
 * Pre-renders every active product at build time. These are the pages search
 * engines and customers land on most, so they should be served from the cache
 * rather than assembled per request.
 *
 * A product added later is still reachable: `dynamicParams` defaults to true,
 * so an unknown slug renders on demand and is then cached. Publishing through
 * the admin also calls revalidatePath('/products/<slug>').
 */
export async function generateStaticParams() {
  const products = await getActiveProducts();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) return {};

  return {
    title: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    openGraph: product.images[0]
      ? { images: [{ url: product.images[0].url, alt: product.images[0].altText }] }
      : undefined,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getProductBySlug(slug), getSiteSettings()]);

  if (!product) notFound();

  const related = await getRelatedProducts(slug, 4);
  const accent = getCategoryAccent(product.categorySlug);
  const delivery = getDeliveryTerms(settings);

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-[var(--gray-20)] px-6 py-3.5 font-mono text-[11px] tracking-[1.4px] text-[var(--text-secondary)] uppercase md:px-12">
        <Link href="/products" className="text-[var(--link-primary)] hover:underline">
          ← Catalog
        </Link>
        <span>
          / {product.categoryName} / {product.sku}
        </span>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr]">
        <ProductGallery
          images={product.images}
          name={product.name}
          videoUrl={product.videoUrl}
        />

        <div className="flex flex-col gap-6.5 px-6 py-10 md:px-12 md:pb-12">
          <div>
            <div
              className="inline-block px-2.5 py-1.5 font-mono text-[11px] tracking-[1.6px] uppercase"
              style={{ background: accent.bg, color: accent.fg }}
            >
              {product.categoryName}
            </div>
            <h1 className="mt-4.5 text-[clamp(34px,4vw,58px)] leading-[0.95] font-semibold tracking-[-0.035em]">
              {product.name}
            </h1>
            <div className="mt-4 flex items-baseline gap-3.5">
              <span className="font-mono text-3xl leading-tight font-semibold">
                {formatInr(product.price)}
              </span>
              {product.shortDescription && (
                <span className="font-mono text-xs tracking-[1.2px] text-[var(--text-secondary)] uppercase">
                  {product.shortDescription}
                </span>
              )}
            </div>
            {delivery.headline && (
              <p className="mt-3 flex items-center gap-2 font-mono text-[11px] tracking-[1.4px] text-[var(--teal-60)] uppercase">
                <span aria-hidden className="block size-2 bg-[var(--teal-60)]" />
                {delivery.headline}
              </p>
            )}
            {product.description && (
              <p className="mt-5 max-w-[48ch] text-base leading-relaxed text-[var(--text-secondary)]">
                {product.description}
              </p>
            )}
          </div>

          <ProductPurchasePanel
            product={product}
            whatsappNumber={settings.whatsappEnabled ? settings.whatsappNumber : null}
          />

          {product.specs.length > 0 && (
            <div className="border border-[var(--gray-20)]">
              <div className="grid grid-cols-2 bg-[var(--gray-100)] px-4 py-2.5 font-mono text-[11px] tracking-[1.4px] text-white uppercase">
                <span>Detail</span>
                <span>Value</span>
              </div>
              {product.specs.map((spec) => (
                <div
                  key={spec.label}
                  className="grid grid-cols-2 border-t border-[var(--gray-20)] px-4 py-2.5 text-sm hover:bg-[var(--layer-hover-01)]"
                >
                  <span className="text-[var(--text-secondary)]">{spec.label}</span>
                  <span className="font-mono">{spec.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 bg-[var(--yellow-30)] px-4 py-3.5">
            <span className="font-semibold">✿</span>
            <span className="text-sm leading-relaxed">
              Free gift wrap and a hand-written card. Ask us for a two-piece pairing and
              we&apos;ll price it together.
            </span>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <Reveal>
          <section className="px-6 py-14 md:px-12 md:py-16">
          <h2 className="mb-5.5 border-b border-[var(--gray-100)] pb-4 text-[32px] leading-tight font-semibold tracking-[-0.03em]">
            Sits well with
          </h2>
          <div className="grid grid-cols-1 gap-px bg-[var(--gray-20)] sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard
                key={p.id}
                product={{
                  id: p.id,
                  sku: p.sku,
                  name: p.name,
                  slug: p.slug,
                  categorySlug: p.categorySlug,
                  categoryName: p.categoryName,
                  price: p.price,
                  images: p.images,
                }}
              />
            ))}
            </div>
          </section>
        </Reveal>
      )}
    </>
  );
}
