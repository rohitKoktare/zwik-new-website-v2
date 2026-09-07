import Link from "next/link";
import { getCategoryAccent } from "@/lib/store/category-accent";
import { Reveal } from "@/components/store/reveal";

export type CategoryTile = {
  slug: string;
  name: string;
  count: number;
};

export function CategoryTilesSection({ tiles }: { tiles: CategoryTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <section className="grid grid-cols-2 border-b border-[var(--gray-100)] md:grid-cols-4">
      {/* Each tile reveals in turn, so the row lands as a sequence. */}
      {tiles.map((tile, i) => {
        const accent = getCategoryAccent(tile.slug);
        return (
          <Reveal key={tile.slug} delayMs={i * 90}>
            <Link
              href={`/products?place=${tile.slug}`}
              className="group relative block h-[200px] overflow-hidden border-r border-[var(--gray-100)] p-4.5 text-left transition-[filter] duration-150 hover:brightness-110 hover:no-underline"
              style={{ background: accent.bg, color: accent.fg }}
            >
              <div className="font-mono text-[11px] tracking-[1.6px] uppercase opacity-80">
                {tile.count === 1 ? "1 piece" : `${tile.count} pieces`}
              </div>
              <div className="absolute bottom-11 left-4.5 text-3xl leading-none font-semibold tracking-[-0.025em]">
                {tile.name}
              </div>
              <div className="absolute bottom-4.5 left-4.5 font-mono text-xs tracking-[1.2px] uppercase">
                Browse →
              </div>
              <div className="absolute -top-7.5 -right-3 text-[104px] leading-none font-semibold tracking-[-0.05em] opacity-20">
                {String(i + 1).padStart(2, "0")}
              </div>
            </Link>
          </Reveal>
        );
      })}
    </section>
  );
}
