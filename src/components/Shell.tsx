import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { readStoredToken, persistToken } from "@/lib/storage";
import { parsePersonalPanelPath } from "@shared/personalLink";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  tournament,
}: {
  id: string;
  active: NavKey;
  meToken?: string | null;
  joinToken?: string | null;
  // Torneo de la quiniela (getMode/getTorneo): da el label del tab Vista Torneo.
  tournament?: { shortName: string } | null;
}) {
  // Persist whatever tokens this page knows so tokenless routes (Mundial) can
  // still reach Mi panel / General via the localStorage fallback below.
  useEffect(() => {
    if (meToken) persistToken(id, "me", meToken);
    if (joinToken) persistToken(id, "join", joinToken);
  }, [id, meToken, joinToken]);

  const storedMe = meToken ?? readStoredToken(id, "me");
  const storedJoin = joinToken ?? readStoredToken(id, "join");

  // Recuperación de "Mi panel" cuando no hay token en este dispositivo (típico de
  // la PWA en iOS: storage aislado de Safari y sin barra de direcciones). El
  // inscrito pega su link personal y lo llevamos a su panel (que ya persiste el
  // token al montar, así que las próximas veces el tab queda habilitado).
  const navigate = useNavigate();
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");

  function recoverPanel() {
    const path = parsePersonalPanelPath(linkInput, id);
    if (!path) {
      toast.error("No reconocí el link. Pega tu link personal completo.");
      return;
    }
    setRecoverOpen(false);
    setLinkInput("");
    navigate(path);
  }

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
      {
        key: "mundial",
        label: tournament?.shortName ?? "Mundial",
        emoji: "🌍",
        to: `/q/${id}/torneo`,
      },
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
                ) : it.key === "me" ? (
                  <button
                    type="button"
                    onClick={() => setRecoverOpen(true)}
                    className="block w-full"
                  >
                    {content}
                  </button>
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

      <Dialog
        open={recoverOpen}
        onOpenChange={(o) => {
          setRecoverOpen(o);
          if (!o) setLinkInput("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ir a Mi panel</DialogTitle>
            <DialogDescription>
              Pega tu link personal (el que recibiste al inscribirte) para abrir
              tu panel en esta app.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              recoverPanel();
            }}
          >
            <Input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="https://…/q/…/me/…"
              inputMode="url"
              autoFocus
            />
            <Button
              type="submit"
              size="lg"
              className="h-11 rounded-xl font-bold"
              disabled={!linkInput.trim()}
            >
              Abrir mi panel
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              ¿No lo tienes? Pídeselo al organizador.
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
