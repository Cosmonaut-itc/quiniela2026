import { useEffect } from "react";
import { toast } from "sonner";
import type { NotificationItem } from "@/../convex/types";

/**
 * Dispara un toast por cada aviso más nuevo que el último visto (persistido en
 * localStorage por quiniela + tipo de panel). En la primera vez (sin corte previo)
 * solo fija el corte, para no anunciar el historial al cargar.
 */
export function useNotificationToasts(
  quinielaId: string | undefined,
  kind: "me" | "admin",
  items: NotificationItem[] | undefined,
) {
  useEffect(() => {
    if (!quinielaId || !items || items.length === 0) return;
    const key = `quiniela:${quinielaId}:notifseen:${kind}`;
    let last = 0;
    try { last = Number(localStorage.getItem(key) ?? 0) || 0; } catch { /* storage no disponible */ }
    const newest = items.reduce((m, n) => Math.max(m, n.createdAt), 0);
    if (last === 0) {
      try { localStorage.setItem(key, String(newest)); } catch { /* */ }
      return;
    }
    const fresh = items.filter((n) => n.createdAt > last).sort((a, b) => a.createdAt - b.createdAt);
    for (const n of fresh) toast(n.title, { description: n.body });
    if (newest > last) { try { localStorage.setItem(key, String(newest)); } catch { /* */ } }
  }, [quinielaId, kind, items]);
}
