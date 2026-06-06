import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Uppercase, tracked section label used throughout the app. */
export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "mt-6 mb-2.5 px-1 text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** Golden prize banner: `🏆 {title}` con subline opcional. */
export function PrizeBanner({ title, subline }: { title: string; subline?: string }) {
  if (!title) return null;
  return (
    <div className="grain relative mt-4 flex items-center gap-2.5 overflow-hidden rounded-2xl border border-gold/30 px-4 py-3 [background:linear-gradient(100deg,oklch(0.32_0.06_84/0.55),oklch(0.28_0.04_70/0.35))]">
      <span className="text-xl leading-none">🏆</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gold">{title}</div>
        {subline && <div className="text-xs text-gold/70">{subline}</div>}
      </div>
    </div>
  );
}

/** A small dashed "empty / waiting" tile. */
export function EmptyTile({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

/** Centered error card for failed/not-found queries. */
export function ErrorCard({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-20 max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
      <div className="text-3xl">🚫</div>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
