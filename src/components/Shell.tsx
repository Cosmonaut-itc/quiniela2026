import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { readStoredToken, persistToken } from "@/lib/storage";

/**
 * Mobile-first page shell for the whole app: a centered ~28rem column on a
 * stadium-night backdrop, with room for an optional sticky bottom nav.
 */
export function Shell({
  children,
  bottomNav,
  className,
}: {
  children: ReactNode;
  bottomNav?: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative min-h-svh w-full">
      <div
        className={cn(
          "pt-safe-top mx-auto w-full max-w-md px-4",
          bottomNav ? "pb-28" : "pb-12",
          className,
        )}
      >
        {children}
      </div>
      {bottomNav}
    </div>
  );
}

type NavKey = "me" | "general" | "mundial";

/**
 * Sticky bottom navigation matching the 3-tab wireframe
 * (Mi panel · General · Mundial). Links are built from the quiniela id and the
 * optional personal/join tokens that are available in the current context.
 */
export function BottomNav({
  id,
  active,
  meToken,
  joinToken,
}: {
  id: string;
  active: NavKey;
  meToken?: string | null;
  joinToken?: string | null;
}) {
  // Persist whatever tokens this page knows so tokenless routes (Mundial) can
  // still reach Mi panel / General via the localStorage fallback below.
  useEffect(() => {
    if (meToken) persistToken(id, "me", meToken);
    if (joinToken) persistToken(id, "join", joinToken);
  }, [id, meToken, joinToken]);

  const storedMe = meToken ?? readStoredToken(id, "me");
  const storedJoin = joinToken ?? readStoredToken(id, "join");

  const items: { key: NavKey; label: string; emoji: string; to: string | null }[] =
    [
      {
        key: "me",
        label: "Mi panel",
        emoji: "👤",
        to: storedMe ? `/q/${id}/me/${storedMe}` : null,
      },
      {
        key: "general",
        label: "General",
        emoji: "📋",
        to: storedJoin ? `/q/${id}/join/${storedJoin}` : null,
      },
      { key: "mundial", label: "Mundial", emoji: "🌍", to: `/q/${id}/mundial` },
    ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto max-w-md px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="grain relative grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-popover/85 p-1.5 shadow-xl backdrop-blur-xl">
          {items.map((it) => {
            const isActive = it.key === active;
            const content = (
              <span
                className={cn(
                  "relative z-10 flex flex-col items-center gap-0.5 rounded-xl py-2 text-[0.7rem] font-semibold transition-colors",
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-base leading-none">{it.emoji}</span>
                {it.label}
              </span>
            );
            return (
              <div key={it.key} className="relative">
                {isActive && (
                  <span className="absolute inset-0 rounded-xl bg-primary glow-primary" />
                )}
                {it.to ? (
                  <Link to={it.to} className="block">
                    {content}
                  </Link>
                ) : (
                  <span className="block cursor-not-allowed opacity-60">
                    {content}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
