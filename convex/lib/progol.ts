// convex/lib/progol.ts
import type { MatchRow } from "./tournament";
import type { Pick } from "../types";
import { dedupeKey, type NotifyIntent } from "./notify";

/** Etiquetas de etapa, compartidas con las vistas. */
export const STAGE_LABEL: Record<string, string> = {
  group: "Grupos", r32: "Dieciseisavos", r16: "Octavos", qf: "Cuartos",
  sf: "Semis", third: "3er lugar", final: "Final",
};
const STAGE_ORDER = ["group", "r32", "r16", "qf", "sf", "third", "final"];
export function stageRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? STAGE_ORDER.length : i;
}

/** 1/X/2 por marcador efectivo; null si no terminó o falta marcador. */
export function matchResult(
  m: { status: string; homeScore: number | null; awayScore: number | null },
): Pick | null {
  if (m.status !== "finished" || m.homeScore == null || m.awayScore == null) return null;
  if (m.homeScore > m.awayScore) return "home";
  if (m.awayScore > m.homeScore) return "away";
  return "draw";
}

/** ¿Pronosticable AHORA? Ambos equipos definidos, programado y antes del saque. */
export function isPredictable(
  m: { homeTeamId: string | null; awayTeamId: string | null; status: string; kickoffAt: number },
  now: number,
): boolean {
  return !!m.homeTeamId && !!m.awayTeamId && m.status === "scheduled" && now < m.kickoffAt;
}

export type MatchUiState = "pending" | "predictable" | "locked" | "finished";
/** pending = falta rival · predictable = editable · locked = ya empezó sin resultado · finished = terminado. */
export function matchUiState(m: MatchRow, now: number): MatchUiState {
  if (m.status === "finished") return "finished";
  if (!m.homeTeamId || !m.awayTeamId) return "pending";
  return isPredictable(m, now) ? "predictable" : "locked";
}

export type LeaderRow = {
  participantId: string; points: number; correct: number; played: number; rank: number;
};
/** points = correct = aciertos. played = partidos terminados (con resultado) pronosticados.
 *  Orden: points desc, luego participantId asc (determinista). rank por points (empates comparten). */
export function leaderboard(
  participants: { id: string }[],
  picks: { participantId: string; matchId: string; pick: Pick }[],
  results: Map<string, Pick>,
): LeaderRow[] {
  const agg = new Map<string, { correct: number; played: number }>();
  for (const p of participants) agg.set(p.id, { correct: 0, played: 0 });
  for (const pk of picks) {
    const res = results.get(pk.matchId);
    if (res === undefined) continue;
    const a = agg.get(pk.participantId);
    if (!a) continue;
    a.played += 1;
    if (pk.pick === res) a.correct += 1;
  }
  const rows = participants.map((p) => {
    const a = agg.get(p.id)!;
    return { participantId: p.id, points: a.correct, correct: a.correct, played: a.played, rank: 0 };
  });
  rows.sort((x, y) => y.points - x.points || (x.participantId < y.participantId ? -1 : 1));
  let rank = 0; let prev = Number.NaN;
  rows.forEach((r, i) => {
    if (r.points !== prev) { rank = i + 1; prev = r.points; }
    r.rank = rank;
  });
  return rows;
}

/** Etapas de eliminatoria cuyos partidos YA tienen ambos equipos definidos (para avisar). */
export function unlockedKnockoutStages(
  effMatches: { stage: string; homeTeamId: string | null; awayTeamId: string | null }[],
): string[] {
  const stages = new Set<string>();
  for (const mt of effMatches) {
    if (mt.stage !== "group" && mt.homeTeamId && mt.awayTeamId) stages.add(mt.stage);
  }
  return [...stages].sort((a, b) => stageRank(a) - stageRank(b));
}

export type ProgolSyncInput = {
  quinielaId: string;
  tournamentStarted: boolean;
  effMatches: { stage: string; homeTeamId: string | null; awayTeamId: string | null }[];
  participants: { id: string }[];
};
/** Avisos del modo progol: torneo iniciado + etapas de eliminatoria desbloqueadas. */
export function detectProgolEvents(input: ProgolSyncInput): NotifyIntent[] {
  const { quinielaId: q, tournamentStarted, effMatches, participants } = input;
  const out: NotifyIntent[] = [];
  if (tournamentStarted) {
    for (const p of participants) {
      out.push({
        quinielaId: q, audience: "participant", participantId: p.id, type: "tournament_started",
        title: "¡Arrancó el Mundial! ⚽", body: "Pronostica los partidos en tu panel.",
        matchId: null, teamId: null, dedupeKey: dedupeKey(q, "tournament_started", null, p.id),
      });
    }
  }
  for (const stage of unlockedKnockoutStages(effMatches)) {
    const label = STAGE_LABEL[stage] ?? stage;
    for (const p of participants) {
      out.push({
        quinielaId: q, audience: "participant", participantId: p.id, type: "predictions_unlocked",
        title: "¡Nuevos partidos para pronosticar!", body: `Ya puedes pronosticar los ${label}.`,
        matchId: null, teamId: null, dedupeKey: dedupeKey(q, "predictions_unlocked", stage, p.id),
      });
    }
  }
  return out;
}
