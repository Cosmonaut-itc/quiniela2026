import type { PrizeView } from "../convex/types";

export function formatMXN(n: number): string {
  return `$${n.toLocaleString("es-MX")}`;
}

/**
 * Arma el banner de premio. Devuelve null si no hay nada que mostrar
 * (modo fijo sin texto). `championSuffix` incluye su espacio inicial,
 * p. ej. " al campeón" o " — para el dueño del campeón".
 */
export function prizeBanner(
  prize: PrizeView,
  status: "open" | "locked" | "finished",
  championSuffix: string,
): { title: string; subline?: string } | null {
  if (prize.mode === "per_person") {
    const fee = formatMXN(prize.entryFee ?? 0);
    const pool = formatMXN(prize.pool ?? 0);
    const n = prize.contributors;
    if (status === "open") {
      return { title: `Bote: ${pool}`, subline: `${fee} × ${n} ${n === 1 ? "pagado" : "pagados"}` };
    }
    return { title: `${pool}${championSuffix}`, subline: `${n} × ${fee}` };
  }
  if (!prize.text) return null;
  return { title: `${prize.text}${championSuffix}` };
}

export function whenLabel(ms: number): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} ${time}`;
}
