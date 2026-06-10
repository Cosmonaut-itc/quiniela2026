import { useState } from "react";
import type { AdminMatchView } from "@/../convex/types";
import { SectionHeading } from "@/components/bits";
import { TeamFlag } from "@/components/TeamCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckIcon } from "lucide-react";

type Sel = "home" | "draw" | "away";

export function MatchScoreEditor({
  matches, savingId, onSave, onRevert,
}: {
  matches: AdminMatchView[];
  savingId: string | null;
  onSave: (externalId: string, homeScore: number, awayScore: number, winnerExternalId: string | null | undefined) => void;
  onRevert: (externalId: string) => void;
}) {
  const [scores, setScores] = useState<Record<string, { h?: string; a?: string }>>({});
  const [winners, setWinners] = useState<Record<string, Sel>>({});

  function selectedWinner(m: AdminMatchView): Sel {
    return (
      winners[m.externalId] ??
      (m.winnerExternalId && m.winnerExternalId === m.homeExternalId
        ? "home"
        : m.winnerExternalId && m.winnerExternalId === m.awayExternalId
          ? "away"
          : "draw")
    );
  }

  function handleSave(m: AdminMatchView) {
    const s = scores[m.externalId] ?? {};
    const homeScore = Number(s.h ?? m.homeScore ?? 0);
    const awayScore = Number(s.a ?? m.awayScore ?? 0);
    let winnerExternalId: string | null | undefined = undefined;
    if (m.stage !== "group") {
      const sel = selectedWinner(m);
      winnerExternalId = sel === "home" ? m.homeExternalId : sel === "away" ? m.awayExternalId : null;
    }
    onSave(m.externalId, homeScore, awayScore, winnerExternalId);
  }

  function handleRevert(externalId: string) {
    setWinners((prev) => {
      const next = { ...prev };
      delete next[externalId];
      return next;
    });
    onRevert(externalId);
  }

  const playableMatches = matches.filter((m) => m.homeTeam && m.awayTeam);

  return (
    <>
      <SectionHeading>Corregir marcador</SectionHeading>
      {playableMatches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
          No hay partidos con equipos definidos todavía.
        </div>
      ) : (
        <div className="space-y-2.5">
          {playableMatches.map((m) => {
            const s = scores[m.externalId] ?? {};
            const saving = savingId === m.externalId;
            return (
              <div key={m.externalId} className="rounded-2xl border border-border bg-card px-3.5 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{m.label}</span>
                  {m.manualOverride && (
                    <span className="flex items-center gap-2">
                      <span className="text-[0.65rem] font-semibold text-gold">editado a mano</span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleRevert(m.externalId)}
                        className="text-[0.65rem] font-semibold text-muted-foreground underline-offset-2 hover:text-gold hover:underline disabled:opacity-50"
                      >
                        ↺ volver al automático
                      </button>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <TeamFlag flag={m.homeTeam!.flag} name={m.homeTeam!.name} className="text-lg leading-none" />
                    <span className="truncate text-sm font-medium">{m.homeTeam!.code}</span>
                  </span>
                  <Input
                    type="number" min={0} inputMode="numeric"
                    aria-label={`Goles ${m.homeTeam!.code}`}
                    className="h-9 w-12 shrink-0 text-center"
                    value={s.h ?? (m.homeScore ?? "")}
                    onChange={(e) => setScores((prev) => ({ ...prev, [m.externalId]: { ...prev[m.externalId], h: e.target.value } }))}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number" min={0} inputMode="numeric"
                    aria-label={`Goles ${m.awayTeam!.code}`}
                    className="h-9 w-12 shrink-0 text-center"
                    value={s.a ?? (m.awayScore ?? "")}
                    onChange={(e) => setScores((prev) => ({ ...prev, [m.externalId]: { ...prev[m.externalId], a: e.target.value } }))}
                  />
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
                    <span className="truncate text-sm font-medium">{m.awayTeam!.code}</span>
                    <TeamFlag flag={m.awayTeam!.flag} name={m.awayTeam!.name} className="text-lg leading-none" />
                  </span>
                  <Button
                    size="icon" className="size-9 shrink-0 rounded-lg" disabled={saving}
                    aria-label="Guardar marcador" onClick={() => handleSave(m)}
                  >
                    {saving ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <CheckIcon />}
                  </Button>
                </div>
                {m.stage !== "group" && (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">Ganador</span>
                    {([["home", m.homeTeam!.code], ["draw", "Empate"], ["away", m.awayTeam!.code]] as const).map(([key, lbl]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setWinners((p) => ({ ...p, [m.externalId]: key }))}
                        className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${selectedWinner(m) === key ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"}`}
                        aria-pressed={selectedWinner(m) === key}
                        aria-label={`Ganador ${lbl}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
