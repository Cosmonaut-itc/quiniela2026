import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { Popover } from "@base-ui/react/popover";
import { api } from "@/../convex/_generated/api";
import { useNotificationToasts } from "@/lib/useNotificationToasts";
import { cn } from "@/lib/utils";

/**
 * Campana con badge de no leídos + panel desplegable de avisos. Se usa en el panel
 * personal (kind="me", token = personalToken) y en el admin (kind="admin", token = adminToken).
 * También dispara los toasts de lo nuevo vía useNotificationToasts.
 *
 * El panel se renderiza en un portal (Popover de Base UI) para que no lo recorte el
 * `overflow-hidden` del header que lo contiene.
 */
export function NotificationBell({
  quinielaId, token, kind,
}: { quinielaId: string; token: string; kind: "me" | "admin" }) {
  const meData = useQuery(api.notifications.listForParticipant, kind === "me" ? { personalToken: token } : "skip");
  const adminData = useQuery(api.notifications.listForAdmin, kind === "admin" ? { adminToken: token } : "skip");
  const data = kind === "me" ? meData : adminData;
  const markRead = useMutation(api.notifications.markRead);

  useNotificationToasts(quinielaId, kind, data?.items);

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  async function onOpenChange(open: boolean) {
    if (open && unread > 0) {
      try {
        await markRead(kind === "me" ? { personalToken: token } : { adminToken: token });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudieron marcar como leídos");
      }
    }
  }

  return (
    <Popover.Root onOpenChange={(open) => void onOpenChange(open)}>
      <Popover.Trigger
        aria-label={`Avisos${unread > 0 ? ` (${unread} sin leer)` : ""}`}
        className="relative grid size-9 place-items-center rounded-full border border-border bg-card/80 text-lg backdrop-blur"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="max-h-[70svh] w-72 origin-[var(--transform-origin)] overflow-y-auto rounded-2xl border border-border bg-popover/95 p-2 shadow-xl backdrop-blur-xl outline-none">
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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
