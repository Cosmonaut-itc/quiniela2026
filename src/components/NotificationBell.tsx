import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useNotificationToasts } from "@/lib/useNotificationToasts";
import { cn } from "@/lib/utils";

/**
 * Campana con badge de no leídos + panel desplegable de avisos. Se usa en el panel
 * personal (kind="me", token = personalToken) y en el admin (kind="admin", token = adminToken).
 * También dispara los toasts de lo nuevo vía useNotificationToasts.
 */
export function NotificationBell({
  quinielaId, token, kind,
}: { quinielaId: string; token: string; kind: "me" | "admin" }) {
  const meData = useQuery(api.notifications.listForParticipant, kind === "me" ? { personalToken: token } : "skip");
  const adminData = useQuery(api.notifications.listForAdmin, kind === "admin" ? { adminToken: token } : "skip");
  const data = kind === "me" ? meData : adminData;
  const markRead = useMutation(api.notifications.markRead);
  const [open, setOpen] = useState(false);

  useNotificationToasts(quinielaId, kind, data?.items);

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  async function onToggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await markRead(kind === "me" ? { personalToken: token } : { adminToken: token });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void onToggle()}
        aria-label={`Avisos${unread > 0 ? ` (${unread} sin leer)` : ""}`}
        className="relative grid size-9 place-items-center rounded-full border border-border bg-card/80 text-lg backdrop-blur"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar avisos"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 max-h-[70svh] w-72 overflow-y-auto rounded-2xl border border-border bg-popover/95 p-2 shadow-xl backdrop-blur-xl">
            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Sin avisos todavía.</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "rounded-xl px-3 py-2.5",
                    n.read ? "opacity-70" : "bg-secondary/60",
                  )}
                >
                  <div className="text-sm font-semibold">{n.title}</div>
                  <div className="text-[0.78rem] text-muted-foreground">{n.body}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
