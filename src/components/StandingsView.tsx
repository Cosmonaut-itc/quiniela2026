// Tabla de posiciones de liga (Vista Torneo, formato liga). Misma estética que
// GroupsView: filas con escudo/bandera, PJ, dif, gf y pts.
import type { TeamLite } from "@/../convex/types";
import { TeamFlag } from "@/components/TeamCard";

type Row = { team: TeamLite; points: number; played: number; gd: number; gf: number };

export function StandingsView({ standings }: { standings: Row[] }) {
  return (
    <section className="grain relative overflow-hidden rounded-3xl border border-border bg-card p-4">
      <table className="w-full text-sm">
        <thead className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="w-8 text-left">#</th>
            <th className="text-left">Equipo</th>
            <th className="w-8 text-right">PJ</th>
            <th className="w-8 text-right">Dif</th>
            <th className="w-8 text-right">GF</th>
            <th className="w-10 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((r, i) => (
            <tr key={r.team.code} className="border-t border-border/50">
              <td className="py-2 text-muted-foreground">{i + 1}</td>
              <td className="py-2 font-medium">
                <span className="flex min-w-0 items-center gap-2">
                  <TeamFlag flag={r.team.flag} name={r.team.name} className="text-lg leading-none" />
                  <span className="truncate">{r.team.name}</span>
                </span>
              </td>
              <td className="text-right text-muted-foreground">{r.played}</td>
              <td className="text-right">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              <td className="text-right text-muted-foreground">{r.gf}</td>
              <td className="text-right font-bold">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
