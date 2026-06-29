import type { MundialData } from "@/../convex/types";
import { TeamFlag } from "@/components/TeamCard";
import { cn } from "@/lib/utils";
import { whenLabel } from "@shared/format";

type BracketMatch = MundialData["bracket"][number]["matches"][number];
type Side = BracketMatch["home"];

function SideRow({
  side,
  win,
  showOwners,
}: {
  side: Side;
  win: boolean;
  showOwners: boolean;
}) {
  if (!side) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-2 text-[0.7rem] text-muted-foreground italic">
        Por definir
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2.5 py-2",
        win && "bg-alive/10",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <TeamFlag flag={side.team.flag} name={side.team.name} className="text-base leading-none" />
        <span
          className={cn(
            "text-xs font-medium",
            win && "font-bold text-foreground",
          )}
        >
          {side.team.code}
        </span>
        {showOwners && (
          <span className="truncate text-[0.65rem] text-muted-foreground">
            · {side.owner}
          </span>
        )}
      </span>
    </div>
  );
}

function Score({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <span className="px-2 font-heading text-sm font-bold tabular-nums">
      {value}
    </span>
  );
}

function MatchCard({
  m,
  isFinal,
  showOwners,
}: {
  m: BracketMatch;
  isFinal: boolean;
  showOwners: boolean;
}) {
  const finished = m.status === "finished";
  const homeWin =
    finished && m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore;
  const awayWin =
    finished && m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card",
        isFinal ? "gold-ring border-gold/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1 divide-y divide-border/60">
          <SideRow side={m.home} win={homeWin} showOwners={showOwners} />
          <SideRow side={m.away} win={awayWin} showOwners={showOwners} />
        </div>
        {(m.homeScore != null || m.awayScore != null) && (
          <div className="flex shrink-0 flex-col items-center self-stretch border-l border-border/60 bg-muted/30">
            <span className="flex flex-1 items-center">
              <Score value={m.homeScore} />
            </span>
            <span className="flex flex-1 items-center border-t border-border/60">
              <Score value={m.awayScore} />
            </span>
          </div>
        )}
      </div>
      <div className="border-t border-border/60 px-2.5 py-1 text-center text-[0.6rem] text-muted-foreground tabular-nums">
        {whenLabel(m.kickoffAt)}
      </div>
    </div>
  );
}

/**
 * Knockout bracket as horizontally-scrolling rounds. Each round is a labeled
 * column of match cards; the Final round gets the gold treatment. Scores show
 * when available and the winning side is highlighted.
 */
export function BracketView({
  bracket,
  showOwners = true,
}: {
  bracket: MundialData["bracket"];
  showOwners?: boolean;
}) {
  if (bracket.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        🗓️ El bracket se llenará cuando terminen los grupos.
      </div>
    );
  }

  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {bracket.map((round) => {
          const isFinal = round.stage === "final";
          return (
            <div
              key={round.stage}
              className="flex min-w-[10.5rem] flex-col justify-center gap-3"
            >
              <div
                className={cn(
                  "text-center text-[0.65rem] font-bold tracking-[0.1em] uppercase",
                  isFinal ? "text-gold" : "text-muted-foreground",
                )}
              >
                {isFinal ? "🏆 " : ""}
                {round.label}
              </div>
              {round.matches.map((m, i) => (
                <MatchCard
                  key={i}
                  m={m}
                  isFinal={isFinal}
                  showOwners={showOwners}
                />
              ))}
            </div>
          );
        })}
      </div>
      <p className="mt-1 pr-1 text-right text-[0.65rem] text-muted-foreground">
        desliza →
      </p>
    </div>
  );
}
