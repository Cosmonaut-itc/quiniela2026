import { useQuery } from "convex/react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/../convex/_generated/api";
import { Avatar } from "@/components/Avatar";
import { TeamCard } from "@/components/TeamCard";
import { StatusBadge } from "@/components/StatusBadge";
import { NotificationBell } from "@/components/NotificationBell";
import { PushOptIn } from "@/components/PushOptIn";
import { Shell, BottomNav } from "@/components/Shell";
import { SectionHeading, PrizeBanner, EmptyTile } from "@/components/bits";
import { Skeleton } from "@/components/ui/skeleton";
import { whenLabel, prizeBanner } from "@/lib/format";

function LoadingState() {
  return (
    <Shell>
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <Skeleton className="mt-4 h-12 rounded-2xl" />
      <div className="mt-8 space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    </Shell>
  );
}

export default function Personal() {
  const { id, token } = useParams();
  const data = useQuery(api.participants.getPersonalPanel, {
    personalToken: token!,
  });

  if (data === undefined) return <LoadingState />;

  const { me } = data;
  const statusLabel =
    me.status === "pending"
      ? "En espera del sorteo"
      : me.status === "champion"
        ? "Campeón"
        : me.status === "out"
          ? "Fuera"
          : `Vivo · ${me.aliveCount} ${me.aliveCount === 1 ? "equipo" : "equipos"}`;

  return (
    <Shell
      bottomNav={
        <BottomNav
          id={id!}
          active="me"
          meToken={token}
          joinToken={data.joinToken}
        />
      }
    >
      {/* Header */}
      <header className="grain bg-pitch header-safe relative -mx-4 overflow-hidden rounded-b-3xl border-b border-border px-4 pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={
                me.status === "champion" ? "gold-ring rounded-full" : undefined
              }
            >
              <Avatar name={me.name} url={me.photoUrl} size={48} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-heading text-2xl font-extrabold tracking-tight">
                {me.name}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {data.quinielaName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start">
            <StatusBadge status={me.status} label={statusLabel} />
            <NotificationBell quinielaId={id!} token={token!} kind="me" />
          </div>
        </div>
        {(() => {
          const b = prizeBanner(data.prize, data.status, " — para el dueño del campeón");
          return b ? <PrizeBanner title={b.title} subline={b.subline} /> : null;
        })()}
      </header>

      <PushOptIn personalToken={token!} />

      {me.status === "pending" && (
        <div className="grain animate-rise relative mt-6 overflow-hidden rounded-3xl border border-border bg-card px-5 py-8 text-center">
          <div className="text-4xl">🎲</div>
          <h2 className="mt-2 font-heading text-lg font-extrabold tracking-tight">
            El sorteo aún no empieza
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Tus equipos aparecerán aquí en cuanto el organizador haga el
            reparto. ¡Prepárate!
          </p>
        </div>
      )}

      {me.status !== "pending" && (
        <>
          {/* Playing now / soon */}
          {data.playingNow.length > 0 && (
            <>
              <SectionHeading>Jugando ahora / pronto</SectionHeading>
              <div className="space-y-2.5">
                {data.playingNow.map((g, i) => (
                  <div
                    key={i}
                    className={
                      "grain relative overflow-hidden rounded-2xl border px-3.5 py-3 " +
                      (g.status === "live"
                        ? "border-alive/40 [background:linear-gradient(100deg,oklch(0.32_0.08_150/0.5),oklch(0.26_0.04_160/0.3))]"
                        : "border-border bg-card")
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="text-2xl leading-none">
                          {g.myTeam.flag}
                        </span>
                        <span className="font-heading font-bold">
                          Tu {g.myTeam.name}
                        </span>
                      </span>
                      {g.status === "live" ? (
                        <span className="flex items-center gap-1.5 text-[0.7rem] font-bold tracking-wide text-alive uppercase">
                          <span className="size-1.5 animate-pulse rounded-full bg-alive" />
                          En vivo
                        </span>
                      ) : (
                        <span className="text-[0.7rem] font-medium text-muted-foreground">
                          {whenLabel(g.kickoffAt)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-lg leading-none">
                        {g.opponent.flag}
                      </span>
                      <span>
                        {g.opponent.name} — de{" "}
                        <span className="font-semibold text-foreground/80">
                          {g.opponentOwner}
                        </span>
                      </span>
                      <span className="ml-auto">⚔️</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* My teams */}
          <SectionHeading>
            Mis equipos
            <span className="ml-1.5 font-medium text-foreground/40">
              {me.aliveCount}/{me.totalCount} vivos
            </span>
          </SectionHeading>
          <div className="space-y-2.5">
            {data.teams.length === 0 ? (
              <EmptyTile>Aún no tienes equipos asignados.</EmptyTile>
            ) : (
              data.teams.map((t, i) => <TeamCard key={i} t={t} />)
            )}
          </div>
        </>
      )}

      {/* Mundial link */}
      <Link
        to={`/q/${id}/mundial`}
        className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold transition-colors hover:bg-secondary"
      >
        <span className="flex items-center gap-2">
          <span className="text-lg">🌍</span> Ver grupos y bracket del Mundial
        </span>
        <span className="text-muted-foreground">→</span>
      </Link>
    </Shell>
  );
}
