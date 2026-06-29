// convex/lib/syncWindow.ts
import { tournamentCodeOf } from "./tournaments";

/** Ventana pre-saque del aviso "match_soon" Y del idle-gate (la MISMA constante).
 *
 *  notifications.ts importa esto para SOON_MS: un partido agendado dispara el aviso
 *  cuando su kickoff cae dentro de este margen. El idle-gate usa el MISMO valor como
 *  cota superior: así el ciclo de sync corre exactamente cuando el aviso se vuelve
 *  elegible. Una sola fuente de verdad impide que se desincronicen — si el gate
 *  abriera más tarde que la ventana del aviso, el cron no correría a tiempo para
 *  emitirlo. */
export const MATCH_SOON_MS = 65 * 60_000;

/** Cuánto hacia atrás un partido sigue siendo "relevante" para sincronizar: cubre
 *  90' + prórroga + penales + descanso con margen de sobra. Pasado esto dejamos de
 *  forzar el sync por su causa (un partido marcado "live" 6h después del saque es
 *  anómalo; su resultado ya se capturó dentro de la ventana). Acota el gate para que
 *  un partido "fantasma" no lo deje abierto para siempre. */
export const SYNC_PAST_MS = 6 * 60 * 60_000;

type MatchLike = { status: string; kickoffAt: number; tournamentCode?: string };

/** Núcleo puro del idle-gate: ¿algún partido de un torneo activo está en vivo o por
 *  comenzar, de modo que el ciclo de sync deba correr? `now` se inyecta porque una
 *  query Convex no puede usar Date.now() (debe ser determinista).
 *
 *  Recibe ya un superconjunto leído por índice (by_kickoff en la ventana); reaplica
 *  las cotas para ser la fuente de verdad exacta de la decisión, independiente de
 *  cómo se haya filtrado la lectura. */
export function anyMatchDueForSync(
  matches: MatchLike[],
  activeCodes: string[],
  now: number,
): boolean {
  const active = new Set(activeCodes);
  return matches.some((mt) => {
    if (!active.has(tournamentCodeOf(mt))) return false;
    if (mt.kickoffAt < now - SYNC_PAST_MS) return false; // demasiado viejo: ya no forzamos sync
    if (mt.status === "live") return true;
    if (mt.status === "scheduled") return mt.kickoffAt <= now + MATCH_SOON_MS;
    return false; // finished → nada que sincronizar
  });
}
