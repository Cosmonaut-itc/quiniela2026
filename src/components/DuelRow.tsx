import type { OverviewData } from "@/../convex/types";
import { whenLabel } from "@/lib/format";
import { TeamFlag } from "@/components/TeamCard";

/**
 * An upcoming head-to-head between two participants of the quiniela:
 * homeOwner 🏳 vs 🏳 awayOwner · <kickoff>.
 */
export function DuelRow({ d }: { d: OverviewData["upcomingDuels"][number] }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
          <span className="truncate text-sm font-semibold">{d.homeOwner}</span>
          <TeamFlag flag={d.homeTeam.flag} name={d.homeTeam.name} className="text-xl leading-none" />
        </div>

        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-muted-foreground">
          VS
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <TeamFlag flag={d.awayTeam.flag} name={d.awayTeam.name} className="text-xl leading-none" />
          <span className="truncate text-sm font-semibold">{d.awayOwner}</span>
        </div>
      </div>
      <div className="mt-1 text-center text-[0.7rem] font-medium text-muted-foreground">
        {whenLabel(d.kickoffAt)}
      </div>
    </div>
  );
}
